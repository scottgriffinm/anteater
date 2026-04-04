"use client";

import { useState, useCallback, useRef } from "react";
import type { AnteaterRequest, AnteaterResponse } from "../types";

type Status = "idle" | "submitting" | "success" | "error";

export type PipelineStep = "initializing" | "working" | "merging" | "redeploying";

const PIPELINE_STEPS: PipelineStep[] = ["initializing", "working", "merging", "redeploying"];

export function useAnteater(apiEndpoint: string = "/api/anteater") {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<AnteaterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const startPipeline = useCallback(() => {
    clearTimers();
    setPipelineStep("initializing");

    // Progress through steps after API success
    const t1 = setTimeout(() => setPipelineStep("working"), 3000);
    const t2 = setTimeout(() => setPipelineStep("merging"), 8000);
    const t3 = setTimeout(() => setPipelineStep("redeploying"), 13000);
    const t4 = setTimeout(() => {
      // Reload the page to pick up redeployment
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }, 17000);

    timersRef.current = [t1, t2, t3, t4];
  }, [clearTimers]);

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
        startPipeline();
        return data;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
        setPipelineStep(null);
        return null;
      }
    },
    [apiEndpoint, startPipeline]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResponse(null);
    setError(null);
    setPipelineStep(null);
    clearTimers();
  }, [clearTimers]);

  return { status, response, error, pipelineStep, pipelineSteps: PIPELINE_STEPS, submit, reset };
}
