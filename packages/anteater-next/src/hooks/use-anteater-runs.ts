"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AnteaterRequest, AnteaterResponse, AnteaterRun, AnteaterRunsResponse } from "../types";

const POLL_ACTIVE = 3000;   // 3s when runs are active
const POLL_IDLE = 30000;    // 30s when no runs (discover others' runs)

export function useAnteaterRuns(apiEndpoint: string = "/api/anteater") {
  const [runs, setRuns] = useState<AnteaterRun[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDeploymentIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const pollRuns = useCallback(async () => {
    try {
      const res = await fetch(`${apiEndpoint}/runs`, { cache: "no-store" });
      if (!res.ok) return;

      const data: AnteaterRunsResponse = await res.json();
      if (!mountedRef.current) return;

      setRuns(data.runs);

      // Track deployment ID for reload detection
      if (data.deploymentId && !initialDeploymentIdRef.current) {
        initialDeploymentIdRef.current = data.deploymentId;
      }

      // Detect new deployment — a run completed and Vercel redeployed
      if (
        data.deploymentId &&
        initialDeploymentIdRef.current &&
        data.deploymentId !== initialDeploymentIdRef.current
      ) {
        console.log("[anteater] New deployment detected, reloading...");
        // Prefetch to warm CDN, then reload
        try { await fetch(window.location.href, { cache: "no-store" }); } catch {}
        window.location.reload();
        return;
      }
    } catch {
      // Network error — will retry on next interval
    }
  }, [apiEndpoint]);

  // Start/restart polling with the appropriate interval
  const startPolling = useCallback(
    (interval: number) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(pollRuns, interval);
    },
    [pollRuns],
  );

  // Adjust poll frequency based on active runs
  useEffect(() => {
    const interval = runs.length > 0 ? POLL_ACTIVE : POLL_IDLE;
    startPolling(interval);
  }, [runs.length, startPolling]);

  // Poll immediately on mount, clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
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

        setSubmitting(false);

        // Immediately poll to pick up the new run
        await pollRuns();

        // Switch to fast polling
        startPolling(POLL_ACTIVE);

        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setSubmitting(false);
        return null;
      }
    },
    [apiEndpoint, runs.length, pollRuns, startPolling],
  );

  const canSubmit = !submitting && runs.length < 5;

  return { runs, submitting, error, canSubmit, submit };
}
