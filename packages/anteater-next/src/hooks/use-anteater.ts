"use client";

import { useState, useCallback } from "react";
import type { AnteaterRequest, AnteaterResponse } from "../types";

type Status = "idle" | "submitting" | "success" | "error";

export function useAnteater(apiEndpoint: string = "/api/anteater") {
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<AnteaterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (request: AnteaterRequest) => {
      setStatus("submitting");
      setError(null);
      setResponse(null);

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
          return null;
        }

        setStatus("success");
        setResponse(data);
        return data;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [apiEndpoint]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResponse(null);
    setError(null);
  }, []);

  return { status, response, error, submit, reset };
}
