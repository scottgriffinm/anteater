"use client";

import { useState, useRef, useEffect } from "react";
import { useAnteater } from "../hooks/use-anteater";
import type { AnteaterBarProps } from "../types";

export function AnteaterBar({
  apiEndpoint = "/api/anteater",
  mode = "prod",
  placeholder = "Describe a change...",
  branch,
}: AnteaterBarProps) {
  const [prompt, setPrompt] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, response, error, submit, reset } =
    useAnteater(apiEndpoint);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        reset();
        setPrompt("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [status, reset]);

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
              : status === "success"
                ? `Queued on branch ${response?.branch ?? ""}`
                : status === "error"
                  ? error ?? "Something went wrong"
                  : placeholder
          }
          disabled={status === "submitting"}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: status === "error" ? "#ef4444" : status === "success" ? "#22c55e" : "#fff",
            fontSize: "14px",
            fontFamily: "inherit",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsExpanded(false);
              reset();
              setPrompt("");
            }
          }}
        />
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
        <button
          type="submit"
          disabled={!prompt.trim() || status === "submitting"}
          style={{
            background: prompt.trim() && status !== "submitting" ? "#22c55e" : "#333",
            color: prompt.trim() && status !== "submitting" ? "#000" : "#666",
            border: "none",
            borderRadius: "10px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: prompt.trim() && status !== "submitting" ? "pointer" : "default",
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
