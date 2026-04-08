"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  AnteaterRequest,
  AnteaterResponse,
  AnteaterRun,
  AnteaterRunsResponse,
} from "../types";

const POLL_ACTIVE = 3000;
const POLL_IDLE = 30000;
const STORAGE_KEY = "anteater_pending_runs";
const QUEUE_KEY = "anteater_queued_prompts";
const DISMISSED_FAILED_RUNS_KEY = "anteater_dismissed_failed_runs";
const FAILED_RUN_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/** Optimistic run saved to localStorage for instant UI before server catches up */
interface PendingRun {
  branch: string;
  requestId: string;
  prompt: string;
  mode: "prod" | "copy";
  submittedAt: number;
}

/** Prompt waiting in the client-side queue (not yet dispatched to GitHub) */
interface QueuedPrompt {
  id: string;
  prompt: string;
  mode: "prod" | "copy";
  branch?: string;
  context?: AnteaterRequest["context"];
  queuedAt: number;
  /** GitHub issue comment ID — set when the server creates the queue comment */
  queueCommentId?: number;
}

interface DismissedRun {
  requestId: string;
  dismissedAt: number;
}

function loadPendingRuns(): PendingRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const runs: PendingRun[] = JSON.parse(raw);
    const cutoff = Date.now() - 10 * 60 * 1000;
    return runs.filter((r) => r.submittedAt > cutoff);
  } catch {
    return [];
  }
}

function savePendingRuns(runs: PendingRun[]) {
  if (typeof window === "undefined") return;
  try {
    if (runs.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {}
}

function loadQueuedPrompts(): QueuedPrompt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const prompts: QueuedPrompt[] = JSON.parse(raw);
    const cutoff = Date.now() - 10 * 60 * 1000;
    return prompts.filter((p) => p.queuedAt > cutoff);
  } catch {
    return [];
  }
}

function saveQueuedPrompts(prompts: QueuedPrompt[]) {
  if (typeof window === "undefined") return;
  try {
    if (prompts.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(prompts));
  } catch {}
}

function loadDismissedRuns(): DismissedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DISMISSED_FAILED_RUNS_KEY);
    if (!raw) return [];
    const runs: DismissedRun[] = JSON.parse(raw);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return runs.filter((r) => r.dismissedAt > cutoff).slice(-100);
  } catch {
    return [];
  }
}

function saveDismissedRuns(runs: DismissedRun[]) {
  if (typeof window === "undefined") return;
  try {
    if (runs.length === 0) localStorage.removeItem(DISMISSED_FAILED_RUNS_KEY);
    else localStorage.setItem(DISMISSED_FAILED_RUNS_KEY, JSON.stringify(runs));
  } catch {}
}

function isExpiredFailedRun(run: AnteaterRun): boolean {
  if (run.step !== "error") return false;
  const startedAtMs = new Date(run.startedAt).getTime();
  if (Number.isNaN(startedAtMs)) return false;
  return Date.now() - startedAtMs > FAILED_RUN_MAX_AGE_MS;
}

export function useAnteaterRuns(apiEndpoint: string = "/api/anteater") {
  const [runs, setRuns] = useState<AnteaterRun[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDeploymentIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pendingRunsRef = useRef<PendingRun[]>([]);
  const queuedPromptsRef = useRef<QueuedPrompt[]>([]);
  const dismissedRunsRef = useRef<DismissedRun[]>([]);
  const drainingRef = useRef(false);

  useEffect(() => {
    pendingRunsRef.current = loadPendingRuns();
    queuedPromptsRef.current = loadQueuedPrompts();
    dismissedRunsRef.current = loadDismissedRuns();
  }, []);

  /**
   * Merge server runs with optimistic pending runs and queued prompts.
   * Server is the source of truth — pending runs fill the ~5-10s dispatch gap.
   * Queued prompts are client-only (not yet dispatched to GitHub).
   */
  const mergeRuns = useCallback((serverRuns: AnteaterRun[]): AnteaterRun[] => {
    const visibleServerRuns = serverRuns.filter((r) => {
      if (isExpiredFailedRun(r)) return false;
      return !dismissedRunsRef.current.some((d) => d.requestId === r.requestId);
    });
    const serverRequestIds = new Set(visibleServerRuns.map((r) => r.requestId));
    const cutoff = Date.now() - 10 * 60 * 1000;

    // Keep pending runs the server doesn't know about yet
    const stillPending = pendingRunsRef.current.filter(
      (p) => p.submittedAt > cutoff && !serverRequestIds.has(p.requestId),
    );
    pendingRunsRef.current = stillPending;
    savePendingRuns(stillPending);

    // Convert pending to AnteaterRun format
    const pendingAsRuns: AnteaterRun[] = stillPending.map((p) => ({
      branch: p.branch,
      requestId: p.requestId,
      prompt: p.prompt,
      step: "starting" as const,
      mode: p.mode,
      startedAt: new Date(p.submittedAt).toISOString(),
    }));

    // Server may return queued runs from the shared GitHub Issue queue.
    // Deduplicate: if a server run with step "queued" matches a local QueuedPrompt
    // by requestId, the server version wins (it has submittedBy + real queue position).
    const serverQueuedIds = new Set(
      visibleServerRuns.filter((r) => r.step === "queued").map((r) => r.requestId),
    );

    // Only show local queued prompts that the server doesn't know about yet
    const localOnlyQueued = queuedPromptsRef.current.filter(
      (q) => !serverQueuedIds.has(q.id),
    );
    const queuedAsRuns: AnteaterRun[] = localOnlyQueued.map((q, i) => ({
      branch: "",
      requestId: q.id,
      prompt: q.prompt,
      step: "queued" as const,
      mode: q.mode,
      startedAt: new Date(q.queuedAt).toISOString(),
      queuePosition: i + 1,
    }));

    // Pending first, then server runs (including server-known queued), then local-only queued — cap at 5
    return [...pendingAsRuns, ...visibleServerRuns, ...queuedAsRuns].slice(0, 5);
  }, []);

  /** Try to dispatch the next queued prompt if no active run exists */
  const drainQueue = useCallback(async (serverRuns: AnteaterRun[]) => {
    if (drainingRef.current) return;
    if (queuedPromptsRef.current.length === 0) return;

    // Only drain if no run is actively processing
    const hasActiveRun = serverRuns.some(
      (r) => r.step === "starting" || r.step === "working" || r.step === "merging" || r.step === "deploying",
    );
    // Also check pending runs (dispatched but not yet in GitHub)
    if (hasActiveRun || pendingRunsRef.current.length > 0) return;

    drainingRef.current = true;
    const next = queuedPromptsRef.current[0];

    // Remove from queue BEFORE posting (prevents multi-tab duplicate dispatch)
    queuedPromptsRef.current = queuedPromptsRef.current.slice(1);
    saveQueuedPrompts(queuedPromptsRef.current);

    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: next.prompt,
          mode: next.mode,
          branch: next.branch,
          context: next.context,
          queueCommentId: next.queueCommentId,
        }),
      });
      const data: AnteaterResponse = await res.json();

      if (data.status === "queued") {
        // Accepted — move to pending runs
        const now = Date.now();
        const pendingRun: PendingRun = {
          branch: data.branch,
          requestId: data.requestId,
          prompt: next.prompt,
          mode: next.mode,
          submittedAt: now,
        };
        pendingRunsRef.current = [...pendingRunsRef.current, pendingRun];
        savePendingRuns(pendingRunsRef.current);
      } else if (data.status === "busy") {
        // Race condition — re-add to front of queue
        queuedPromptsRef.current = [next, ...queuedPromptsRef.current];
        saveQueuedPrompts(queuedPromptsRef.current);
      }
      // If error, the prompt is lost — acceptable, the user saw the error
    } catch {
      // Network error — re-add to queue
      queuedPromptsRef.current = [next, ...queuedPromptsRef.current];
      saveQueuedPrompts(queuedPromptsRef.current);
    } finally {
      drainingRef.current = false;
    }
  }, [apiEndpoint]);

  const pollRuns = useCallback(async () => {
    try {
      const res = await fetch(`${apiEndpoint}/runs`, { cache: "no-store" });
      if (!res.ok) {
        setError(`Status check failed (${res.status})`);
        return;
      }

      const data: AnteaterRunsResponse = await res.json();
      if (!mountedRef.current) return;

      const merged = mergeRuns(data.runs);
      setRuns(merged);
      setError(null);

      // Track deployment ID for reload detection
      if (data.deploymentId && !initialDeploymentIdRef.current) {
        initialDeploymentIdRef.current = data.deploymentId;
      }

      // Detect new deployment → remove runs, reload page
      if (
        data.deploymentId &&
        initialDeploymentIdRef.current &&
        data.deploymentId !== initialDeploymentIdRef.current
      ) {
        console.log("[anteater] New deployment detected, reloading...");
        savePendingRuns([]);
        // Keep queued prompts across reload — they haven't been dispatched yet
        try { await fetch(window.location.href, { cache: "no-store" }); } catch {}
        window.location.reload();
        return;
      }

      // Try to drain the queue if nothing is active
      await drainQueue(data.runs);
    } catch {
      setError("Status check unavailable, retrying...");
      // Network error — show pending + queued runs if nothing else
      if ((pendingRunsRef.current.length > 0 || queuedPromptsRef.current.length > 0) && mountedRef.current) {
        setRuns((prev) => {
          if (prev.length > 0) return prev;
          const pendingAsRuns = pendingRunsRef.current.map((p) => ({
            branch: p.branch,
            requestId: p.requestId,
            prompt: p.prompt,
            step: "starting" as const,
            mode: p.mode,
            startedAt: new Date(p.submittedAt).toISOString(),
          }));
          const queuedAsRuns = queuedPromptsRef.current.map((q, i) => ({
            branch: "",
            requestId: q.id,
            prompt: q.prompt,
            step: "queued" as const,
            mode: q.mode,
            startedAt: new Date(q.queuedAt).toISOString(),
            queuePosition: i + 1,
          }));
          return [...pendingAsRuns, ...queuedAsRuns];
        });
      }
    }
  }, [apiEndpoint, mergeRuns, drainQueue]);

  const startPolling = useCallback(
    (interval: number) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(pollRuns, interval);
    },
    [pollRuns],
  );

  // Adjust poll frequency based on active runs or queued prompts
  useEffect(() => {
    const hasActive = runs.some((r) => r.step !== "error" && r.step !== "queued");
    const hasQueued = queuedPromptsRef.current.length > 0;
    startPolling(hasActive || hasQueued ? POLL_ACTIVE : POLL_IDLE);
  }, [runs, startPolling]);

  // On mount: show pending + queued runs instantly, then poll
  useEffect(() => {
    mountedRef.current = true;
    const pending = loadPendingRuns();
    const queued = loadQueuedPrompts();
    if (pending.length > 0 || queued.length > 0) {
      pendingRunsRef.current = pending;
      queuedPromptsRef.current = queued;
      setRuns([
        ...pending.map((p) => ({
          branch: p.branch,
          requestId: p.requestId,
          prompt: p.prompt,
          step: "starting" as const,
          mode: p.mode,
          startedAt: new Date(p.submittedAt).toISOString(),
        })),
        ...queued.map((q, i) => ({
          branch: "",
          requestId: q.id,
          prompt: q.prompt,
          step: "queued" as const,
          mode: q.mode,
          startedAt: new Date(q.queuedAt).toISOString(),
          queuePosition: i + 1,
        })),
      ]);
    }
    pollRuns();
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollRuns]);

  const submit = useCallback(
    async (request: AnteaterRequest) => {
      if (runs.length >= 5) {
        setError("Maximum 5 concurrent runs");
        return null;
      }

      setSubmitting(true);
      setError(null);

      // Show the run in the UI INSTANTLY — before any network request
      const tempId = crypto.randomUUID().slice(0, 8);
      const now = Date.now();
      setRuns((prev) =>
        [
          ...prev,
          {
            branch: "",
            requestId: tempId,
            prompt: request.prompt,
            step: "starting" as const,
            mode: request.mode,
            startedAt: new Date(now).toISOString(),
          },
        ].slice(0, 5),
      );

      try {
        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        const data: AnteaterResponse = await res.json();

        if (!res.ok || data.status === "error") {
          // Remove the optimistic run and show error
          setRuns((prev) => prev.filter((r) => r.requestId !== tempId));
          setError(data.error || `Request failed (${res.status})`);
          setSubmitting(false);
          return null;
        }

        if (data.status === "busy") {
          // Server says another run is active — transition to queued
          const queued: QueuedPrompt = {
            id: tempId,
            prompt: request.prompt,
            mode: request.mode,
            branch: request.branch,
            context: request.context,
            queuedAt: now,
            queueCommentId: data.queueCommentId,
          };
          queuedPromptsRef.current = [...queuedPromptsRef.current, queued];
          saveQueuedPrompts(queuedPromptsRef.current);

          const queuePosition = queuedPromptsRef.current.length;
          setRuns((prev) =>
            prev.map((r) =>
              r.requestId === tempId
                ? { ...r, step: "queued" as const, queuePosition }
                : r,
            ),
          );

          setSubmitting(false);
          startPolling(POLL_ACTIVE);
          return { requestId: tempId, branch: "", status: "busy" as const } satisfies AnteaterResponse;
        }

        // Server accepted and dispatched — update the optimistic run with real IDs
        const pendingRun: PendingRun = {
          branch: data.branch,
          requestId: data.requestId,
          prompt: request.prompt,
          mode: request.mode,
          submittedAt: now,
        };
        pendingRunsRef.current = [...pendingRunsRef.current, pendingRun];
        savePendingRuns(pendingRunsRef.current);

        // Replace temp ID with real requestId/branch from server
        setRuns((prev) =>
          prev.map((r) =>
            r.requestId === tempId
              ? { ...r, requestId: data.requestId, branch: data.branch }
              : r,
          ),
        );

        setSubmitting(false);
        startPolling(POLL_ACTIVE);
        return data;
      } catch (err) {
        // Remove the optimistic run on network error
        setRuns((prev) => prev.filter((r) => r.requestId !== tempId));
        setError(err instanceof Error ? err.message : "Unknown error");
        setSubmitting(false);
        return null;
      }
    },
    [apiEndpoint, runs.length, startPolling],
  );

  const deleteRun = useCallback(
    async (requestId: string) => {
      // Check if this is a queued (not-yet-dispatched) run — handle client-side only
      const isQueued = queuedPromptsRef.current.some((q) => q.id === requestId);
      if (isQueued) {
        queuedPromptsRef.current = queuedPromptsRef.current.filter((q) => q.id !== requestId);
        saveQueuedPrompts(queuedPromptsRef.current);
        // Recalculate queue positions
        setRuns((prev) => {
          const without = prev.filter((r) => r.requestId !== requestId);
          let pos = 1;
          return without.map((r) =>
            r.step === "queued" ? { ...r, queuePosition: pos++ } : r,
          );
        });
        return;
      }

      // Optimistically remove from UI
      setRuns((prev) => prev.filter((r) => r.requestId !== requestId));
      pendingRunsRef.current = pendingRunsRef.current.filter((p) => p.requestId !== requestId);
      savePendingRuns(pendingRunsRef.current);

      // Delete from GitHub Actions
      try {
        dismissedRunsRef.current = [
          ...dismissedRunsRef.current.filter((r) => r.requestId !== requestId),
          { requestId, dismissedAt: Date.now() },
        ];
        saveDismissedRuns(dismissedRunsRef.current);

        const res = await fetch(`${apiEndpoint}/runs?requestId=${encodeURIComponent(requestId)}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 404 && res.status !== 405 && res.status !== 409) {
          setError(`Delete failed (${res.status}). Hidden locally for now.`);
        }
      } catch {
        // Best-effort — the run is already gone from the UI.
        // Keep it dismissed locally so old backends don't re-add it.
      }
    },
    [apiEndpoint],
  );

  const canSubmit = !submitting && runs.length < 5;

  return { runs, submitting, error, canSubmit, submit, deleteRun };
}
