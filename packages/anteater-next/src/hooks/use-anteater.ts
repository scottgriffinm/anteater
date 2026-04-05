"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "../types";

type Status = "idle" | "submitting" | "success" | "error";

export type PipelineStep = "initializing" | "working" | "merging" | "redeploying" | "done";

const PIPELINE_STEPS: PipelineStep[] = ["initializing", "working", "merging", "redeploying"];

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function useAnteater(apiEndpoint: string = "/api/anteater") {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<AnteaterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const branchRef = useRef<string | null>(null);
  const pollingStartRef = useRef<number>(0);

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

    // Timeout after 5 minutes of polling
    const elapsed = Date.now() - pollingStartRef.current;
    if (pollingStartRef.current > 0 && elapsed > POLL_TIMEOUT) {
      console.error(`[anteater] Polling timed out after ${Math.round(elapsed / 1000)}s`, { branch });
      stopPolling();
      setStatus("error");
      setError("Request timed out — check GitHub Actions for details");
      setPipelineStep(null);
      return;
    }

    try {
      const res = await fetch(`${apiEndpoint}?branch=${encodeURIComponent(branch)}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        console.warn(`[anteater] Poll failed: ${res.status} ${res.statusText}`, { branch });
        return;
      }

      const data: AnteaterStatusResponse = await res.json();
      console.log(`[anteater] Poll status: step=${data.step}, branch=${branch}`, data);

      if (data.step === "error") {
        console.error(`[anteater] Pipeline error: ${data.error}`, { branch });
        stopPolling();
        setStatus("error");
        setError(data.error || "Workflow failed");
        setPipelineStep(null);
        return;
      }

      if (data.step === "done") {
        console.log(`[anteater] Pipeline complete — reloading in 2s`, { branch });
        stopPolling();
        setPipelineStep("done");
        // Force reload to pick up the new deployment (cache-bust)
        setTimeout(() => {
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("_anteater", Date.now().toString());
            window.location.replace(url.toString());
          }
        }, 2000);
        return;
      }

      // Update the visible step (error and done already handled above)
      setPipelineStep(data.step);
    } catch (err) {
      console.warn(`[anteater] Poll network error (will retry):`, err);
      // Network error — keep polling, don't fail
    }
  }, [apiEndpoint, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingStartRef.current = Date.now();
    // Initial poll immediately
    pollStatus();
    // Then poll on interval
    pollingRef.current = setInterval(pollStatus, POLL_INTERVAL);
  }, [stopPolling, pollStatus]);

  const submit = useCallback(
    async (request: AnteaterRequest) => {
      console.log(`[anteater] Submitting request: prompt="${request.prompt}", mode=${request.mode}`);
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
          console.error(`[anteater] Submit failed: ${data.error}`, { status: res.status, data });
          setStatus("error");
          setError(data.error || `Request failed (${res.status})`);
          setPipelineStep(null);
          return null;
        }

        console.log(`[anteater] Request queued: requestId=${data.requestId}, branch=${data.branch}`);
        setStatus("success");
        setResponse(data);
        branchRef.current = data.branch;
        startPolling();
        return data;
      } catch (err) {
        console.error(`[anteater] Submit error:`, err);
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
