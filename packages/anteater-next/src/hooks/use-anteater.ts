"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "../types";

type Status = "idle" | "submitting" | "success" | "error";

export type PipelineStep = "initializing" | "working" | "merging" | "redeploying" | "done";

const PIPELINE_STEPS: PipelineStep[] = ["initializing", "working", "merging", "redeploying"];

const POLL_INTERVAL = 3000;

export function useAnteater(apiEndpoint: string = "/api/anteater") {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<AnteaterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const branchRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const pollStatus = useCallback(async () => {
    const branch = branchRef.current;
    if (!branch) return;

    try {
      const res = await fetch(`${apiEndpoint}?branch=${encodeURIComponent(branch)}`, {
        cache: "no-store",
      });

      if (!res.ok) return;

      const data: AnteaterStatusResponse = await res.json();

      if (data.step === "error") {
        stopPolling();
        setStatus("error");
        setError(data.error || "Workflow failed");
        setPipelineStep(null);
        return;
      }

      if (data.step === "done") {
        stopPolling();
        setPipelineStep("done");
        // Reload to pick up the new deployment
        setTimeout(() => {
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        }, 2000);
        return;
      }

      // Update the visible step (error and done already handled above)
      setPipelineStep(data.step);
    } catch {
      // Network error — keep polling, don't fail
    }
  }, [apiEndpoint, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    // Initial poll immediately
    pollStatus();
    // Then poll on interval
    pollingRef.current = setInterval(pollStatus, POLL_INTERVAL);
  }, [stopPolling, pollStatus]);

  const submit = useCallback(
    async (request: AnteaterRequest) => {
      setStatus("submitting");
      setError(null);
      setResponse(null);
      setPipelineStep("initializing");

      try {
        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        const data: AnteaterResponse = await res.json();

        if (!res.ok || data.status === "error") {
          setStatus("error");
          setError(data.error || `Request failed (${res.status})`);
          setPipelineStep(null);
          return null;
        }

        setStatus("success");
        setResponse(data);
        branchRef.current = data.branch;
        startPolling();
        return data;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
        setPipelineStep(null);
        return null;
      }
    },
    [apiEndpoint, startPolling]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResponse(null);
    setError(null);
    setPipelineStep(null);
    branchRef.current = null;
    stopPolling();
  }, [stopPolling]);

  return { status, response, error, pipelineStep, pipelineSteps: PIPELINE_STEPS, submit, reset };
}
