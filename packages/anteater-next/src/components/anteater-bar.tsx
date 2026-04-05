"use client";

import { useState, useRef, useEffect } from "react";
import { useAnteater } from "../hooks/use-anteater";
import type { PipelineStep } from "../hooks/use-anteater";
import type { AnteaterBarProps } from "../types";

const STEP_LABELS: Record<PipelineStep, string> = {
  initializing: "Initializing",
  working: "Working on changes",
  merging: "Merging changes",
  redeploying: "Redeploying",
};

function PipelineProgress({
  currentStep,
  steps,
}: {
  currentStep: PipelineStep;
  steps: readonly PipelineStep[];
}) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "12px 16px",
        marginBottom: "8px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {steps.map((step, i) => {
          const isActive = i === currentIndex;
          const isComplete = i < currentIndex;
          const isPending = i > currentIndex;

          return (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              {/* Step indicator */}
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: isComplete
                    ? "#22c55e"
                    : isActive
                      ? "transparent"
                      : "transparent",
                  border: isComplete
                    ? "2px solid #22c55e"
                    : isActive
                      ? "2px solid #22c55e"
                      : "2px solid #444",
                  transition: "all 0.3s ease",
                }}
              >
                {isComplete ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isActive ? (
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#22c55e",
                      animation: "anteater-pulse 1.5s ease-in-out infinite",
                    }}
                  />
                ) : null}
              </div>

              {/* Step label */}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  color: isComplete
                    ? "#22c55e"
                    : isActive
                      ? "#fff"
                      : "#555",
                  transition: "all 0.3s ease",
                }}
              >
                {STEP_LABELS[step]}
                {isActive && step === "redeploying" && (
                  <span style={{ color: "#888", fontWeight: 400 }}> — page will refresh</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes anteater-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>
    </div>
  );
}

export function AnteaterBar({
  apiEndpoint = "/api/anteater",
  mode = "prod",
  placeholder = "Describe a change...",
  branch,
}: AnteaterBarProps) {
  const [prompt, setPrompt] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, response, error, pipelineStep, pipelineSteps, submit, reset } =
    useAnteater(apiEndpoint);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || status === "submitting") return;

    await submit({
      prompt: prompt.trim(),
      mode,
      branch,
      context: {
        pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
      },
    });
  };

  const isPipelineActive = pipelineStep !== null;

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#22c55e",
          color: "#000",
          border: "none",
          borderRadius: "50px",
          padding: "12px 24px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: "0 4px 24px rgba(34, 197, 94, 0.3)",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 32px rgba(34, 197, 94, 0.5)";
          e.currentTarget.style.transform = "translateX(-50%) scale(1.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 4px 24px rgba(34, 197, 94, 0.3)";
          e.currentTarget.style.transform = "translateX(-50%) scale(1)";
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        Edit this page
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(560px, calc(100vw - 32px))",
        zIndex: 9999,
      }}
    >
      {/* Pipeline progress tab */}
      {isPipelineActive && (
        <PipelineProgress currentStep={pipelineStep} steps={pipelineSteps} />
      )}

      {/* Error message */}
      {status === "error" && error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "12px",
            padding: "10px 16px",
            marginBottom: "8px",
            fontSize: "13px",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#111",
          border: "1px solid #333",
          borderRadius: "16px",
          padding: "8px 8px 8px 16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            status === "submitting"
              ? "Sending to Anteater..."
              : status === "error"
                ? error ?? "Something went wrong"
                : isPipelineActive
                  ? STEP_LABELS[pipelineStep] + "..."
                  : placeholder
          }
          disabled={status === "submitting" || isPipelineActive}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: status === "error" ? "#ef4444" : isPipelineActive ? "#22c55e" : "#fff",
            fontSize: "14px",
            fontFamily: "inherit",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !isPipelineActive) {
              setIsExpanded(false);
              reset();
              setPrompt("");
            }
          }}
        />
        {!isPipelineActive && (
          <button
            type="button"
            onClick={() => {
              setIsExpanded(false);
              reset();
              setPrompt("");
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#666",
              cursor: "pointer",
              padding: "8px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <button
          type="submit"
          disabled={!prompt.trim() || status === "submitting" || isPipelineActive}
          style={{
            background: prompt.trim() && status !== "submitting" && !isPipelineActive ? "#22c55e" : "#333",
            color: prompt.trim() && status !== "submitting" && !isPipelineActive ? "#000" : "#666",
            border: "none",
            borderRadius: "10px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: prompt.trim() && status !== "submitting" && !isPipelineActive ? "pointer" : "default",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          {status === "submitting" ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
