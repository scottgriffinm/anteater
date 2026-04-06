"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "../types";

type Status = "idle" | "submitting" | "success" | "error";

export type PipelineStep = "initializing" | "working" | "merging" | "redeploying" | "done";

const PIPELINE_STEPS: PipelineStep[] = ["initializing", "working", "merging", "redeploying"];

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 6 * 60 * 60 * 1000; // 6 hours

export function useAnteater(apiEndpoint: string = "/api/anteater") {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<AnteaterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const branchRef = useRef<string | null>(null);
  const pollingStartRef = useRef<number>(0);
  const initialDeploymentIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const triggerReload = useCallback(() => {
    console.log(`[anteater] New deployment detected, reloading...`);
    stopPolling();
    setPipelineStep("done");
    // Wait for CDN propagation, then reload with a cache-busted prefetch
    // so the browser picks up fresh content without a visible query param
    setTimeout(async () => {
      if (typeof window === "undefined") return;
      try {
        await fetch(window.location.href, { cache: "no-store" });
      } catch {}
      window.location.reload();
    }, 4000);
  }, [stopPolling]);

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
      console.log(`[anteater] Poll: step=${data.step}, deployId=${data.deploymentId ?? "n/a"}`, { branch });

      // Track the initial deployment ID from the first response
      if (data.deploymentId && !initialDeploymentIdRef.current) {
        initialDeploymentIdRef.current = data.deploymentId;
        console.log(`[anteater] Initial deployment ID: ${data.deploymentId}`);
      }

      if (data.step === "error") {
        console.error(`[anteater] Pipeline error: ${data.error}`, { branch });
        stopPolling();
        setStatus("error");
        setError(data.error || "Workflow failed");
        setPipelineStep(null);
        return;
      }

      // Detect new deployment: if deployment ID changed, new code is live
      if (
        data.step === "redeploying" &&
        data.deploymentId &&
        initialDeploymentIdRef.current &&
        data.deploymentId !== initialDeploymentIdRef.current
      ) {
        console.log(`[anteater] New deployment detected: ${initialDeploymentIdRef.current} → ${data.deploymentId}`);
        triggerReload();
        return;
      }

      // Server-side "done" fallback (150s timer for non-Vercel environments)
      if (data.step === "done") {
        console.log(`[anteater] Pipeline complete (server fallback)`);
        triggerReload();
        return;
      }

      setPipelineStep(data.step);
    } catch (err) {
      console.warn(`[anteater] Poll network error (will retry):`, err);
    }
  }, [apiEndpoint, stopPolling, triggerReload]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingStartRef.current = Date.now();
    initialDeploymentIdRef.current = null;
    pollStatus();
    pollingRef.current = setInterval(pollStatus, POLL_INTERVAL);
  }, [stopPolling, pollStatus]);

  const submit = useCallback(
    async (request: AnteaterRequest) => {
      console.log(`[anteater] Submitting: prompt="${request.prompt}", mode=${request.mode}`);
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

        console.log(`[anteater] Queued: requestId=${data.requestId}, branch=${data.branch}`);
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
    [apiEndpoint, startPolling],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResponse(null);
    setError(null);
    setPipelineStep(null);
    branchRef.current = null;
    initialDeploymentIdRef.current = null;
    stopPolling();
  }, [stopPolling]);

  return { status, response, error, pipelineStep, pipelineSteps: PIPELINE_STEPS, submit, reset };
}
