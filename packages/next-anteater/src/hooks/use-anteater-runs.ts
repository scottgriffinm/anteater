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
  const dismissedRunsRef = useRef<DismissedRun[]>([]);

  useEffect(() => {
    pendingRunsRef.current = loadPendingRuns();
    dismissedRunsRef.current = loadDismissedRuns();
  }, []);

  /**
   * Merge server runs with optimistic pending runs.
   * Server is the source of truth — pending runs only fill the gap
   * before the server picks up a newly dispatched workflow (~5-10s).
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
      step: "initializing" as const,
      mode: p.mode,
      startedAt: new Date(p.submittedAt).toISOString(),
    }));

    // Pending first (newest), then server runs, cap at 5
    return [...pendingAsRuns, ...visibleServerRuns].slice(0, 5);
  }, []);

  const pollRuns = useCallback(async () => {
    try {
      const res = await fetch(`${apiEndpoint}/runs`, { cache: "no-store" });
      if (!res.ok) return;

      const data: AnteaterRunsResponse = await res.json();
      if (!mountedRef.current) return;

      const merged = mergeRuns(data.runs);
      setRuns(merged);

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
        try { await fetch(window.location.href, { cache: "no-store" }); } catch {}
        window.location.reload();
        return;
      }
    } catch {
      // Network error — show pending runs if nothing else
      if (pendingRunsRef.current.length > 0 && mountedRef.current) {
        setRuns((prev) => {
          if (prev.length > 0) return prev;
          return pendingRunsRef.current.map((p) => ({
            branch: p.branch,
            requestId: p.requestId,
            prompt: p.prompt,
            step: "initializing" as const,
            mode: p.mode,
            startedAt: new Date(p.submittedAt).toISOString(),
          }));
        });
      }
    }
  }, [apiEndpoint, mergeRuns]);

  const startPolling = useCallback(
    (interval: number) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(pollRuns, interval);
    },
    [pollRuns],
  );

  // Adjust poll frequency based on active runs
  useEffect(() => {
    const hasActive = runs.some((r) => r.step !== "error");
    startPolling(hasActive ? POLL_ACTIVE : POLL_IDLE);
  }, [runs, startPolling]);

  // On mount: show pending runs instantly, then poll
  useEffect(() => {
    mountedRef.current = true;
    const pending = loadPendingRuns();
    if (pending.length > 0) {
      pendingRunsRef.current = pending;
      setRuns(
        pending.map((p) => ({
          branch: p.branch,
          requestId: p.requestId,
          prompt: p.prompt,
          step: "initializing" as const,
          mode: p.mode,
          startedAt: new Date(p.submittedAt).toISOString(),
        })),
      );
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

      try {
        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        const data: AnteaterResponse = await res.json();

        if (!res.ok || data.status === "error") {
          setError(data.error || `Request failed (${res.status})`);
          setSubmitting(false);
          return null;
        }

        // Save optimistic run for instant UI
        const now = Date.now();
        const pendingRun: PendingRun = {
          branch: data.branch,
          requestId: data.requestId,
          prompt: request.prompt,
          mode: request.mode,
          submittedAt: now,
        };
        pendingRunsRef.current = [...pendingRunsRef.current, pendingRun];
        savePendingRuns(pendingRunsRef.current);

        // Show it immediately
        setRuns((prev) =>
          [
            ...prev,
            {
              branch: data.branch,
              requestId: data.requestId,
              prompt: request.prompt,
              step: "initializing" as const,
              mode: request.mode,
              startedAt: new Date(now).toISOString(),
            },
          ].slice(0, 5),
        );

        setSubmitting(false);
        startPolling(POLL_ACTIVE);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setSubmitting(false);
        return null;
      }
    },
    [apiEndpoint, runs.length, startPolling],
  );

  const deleteRun = useCallback(
    async (requestId: string) => {
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
