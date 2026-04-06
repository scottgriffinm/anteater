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
  done: "Done!",
};

const BUTTON_SIZE = 48;

function AnteaterLogo({ size = 22, color = "#888" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 3815 2340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(3814.6667, 0) scale(-1, 1)">
        <path
          fill={color}
          d="m 182.30276,2338.6321 c -25.23821,-3.9691 -53.21149,-19.3932 -71.53764,-39.4449 -13.958656,-15.273 -31.281076,-45.4993 -43.329612,-75.6069 C 52.348006,2185.8788 29.948821,2089.765 18.127022,2012 7.3503548,1941.11 0.73193799,1854.4643 0.8640631,1786 1.0197659,1705.3183 11.290219,1581.6276 24.113397,1506 30.594022,1467.7791 50.859424,1371.4946 59.192438,1339.3333 96.466833,1195.4729 140.26877,1078.0772 204.82439,949.01802 234.917,888.85707 267.6281,829.37112 289.33502,795.33333 c 4.20902,-6.6 13.23217,-21 20.05146,-32 C 383.13932,644.36468 486.57803,519.01711 592.66668,420.05291 707.66832,312.77428 808.75523,240.06773 940.66669,169.75465 1053.8863,109.40491 1197.5613,57.586132 1326.6667,30.537289 1389.3841,17.397383 1444.5277,9.6398893 1522,3.0581926 c 40.3889,-3.43125434 165.6731,-3.43383441 208,-0.00428 86.5824,7.0153529 144.3217,15.3103319 224.6667,32.2762279 46.2392,9.764011 48.2291,10.254819 84.6667,20.883785 89.2233,26.026725 181.5133,59.145248 240,86.124668 148.7124,68.59982 251.3358,128.12635 387.3333,224.67201 42.4068,30.10491 111.1713,84.97179 169.3334,135.11039 94.3341,81.32076 147.4322,130.97142 199.1713,186.24012 26.4556,28.26029 38.5537,36.88163 51.8413,36.94294 7.2142,0.0333 5.685,1.70153 22.5745,-24.62685 11.8797,-18.51872 26.3758,-33.27502 38.4129,-39.10256 21.0954,-10.21294 36.9789,-10.09015 58.0843,0.44904 32.0231,15.99101 52.1473,47.14976 59.404,91.97632 2.5551,15.78384 2.0125,50.89765 -1.4836,96 -2.7234,35.13499 -2.9004,41.61027 -1.4552,53.23957 1.791,14.41207 6.4964,30.93707 11.7961,41.4271 7.3083,14.46577 35.5048,61.76003 62.7562,105.26143 5.4879,8.7605 20.7702,33.9605 33.9604,56 13.1903,22.0395 26.7921,44.2719 30.2262,49.4052 23.9784,35.8436 78.5028,134.7578 125.3127,227.3334 9.6618,19.1081 57.4784,121.0759 69.7155,148.6666 18.2937,41.2466 52.8121,125.6082 70.3775,172 2.7766,7.3334 10.2659,27.1334 16.6428,44 20.2143,53.4658 59.5797,173.6147 77.3228,236 21.7424,76.4472 33.8635,125.4051 45.225,182.6667 12.3599,62.293 11.6558,91.916 -2.8836,121.3333 -11.3715,23.0076 -34.9808,40.9392 -64.3504,48.8753 -16.36,4.4207 -44.053,4.3897 -59.3174,-0.066 -22.7272,-6.6345 -41.0676,-18.1321 -61.6208,-38.63 -19.7205,-19.6675 -35.9701,-48.2657 -56.1645,-98.8456 -23.7503,-59.4865 -62.7745,-141.33 -99.4954,-208.6667 -19.372,-35.5234 -47.4287,-82.7649 -70.476,-118.6667 -80.6181,-125.5823 -149.8956,-212.5934 -244.7823,-307.4418 -67.7099,-67.6825 -115.4814,-109.3553 -173.5361,-151.3819 -72.1222,-52.2103 -125.5361,-82.0843 -185.2585,-103.6139 -46.372,-16.7169 -74.0174,-22.5684 -106.6664,-22.5772 -30.3448,-0.01 -50.7167,4.3738 -73.8901,15.8939 -35.4623,17.6292 -60.7334,41.8224 -75.7704,72.5383 -7.6337,15.5933 -10.9677,27.6339 -13.8214,49.916 -1.8862,14.7272 -1.9861,19.7356 -0.6641,33.3115 3.8149,39.1788 15.2694,75.2852 38.7847,122.2554 13.9901,27.9443 45.5244,81.9949 68.7074,117.7664 29.3149,45.2329 65.1262,102.2906 92.8946,148.0076 40.7262,67.0504 77.6292,149.3023 97.0141,216.2314 11.2209,38.7419 16.0654,69.2928 17.0107,107.2753 1.0563,42.4406 -2.4824,66.343 -13.6816,92.412 -12.7939,29.7815 -31.6056,49.7294 -59.8662,63.4822 -39.6598,19.3002 -84.8134,17.0969 -119.0616,-5.8097 -23.407,-15.6555 -40.5848,-35.6295 -75.3361,-87.5988 -30.0517,-44.9414 -46.1877,-67.9888 -63.4778,-90.6667 -43.4808,-57.0299 -91.4949,-111.2316 -147.0681,-166.0207 -63.3788,-62.4845 -111.4374,-102.9115 -300.4087,-252.7041 -12.449,-9.868 -29.249,-23.2776 -37.3333,-29.7991 -67.985,-54.8425 -108.8275,-86.783 -143.1167,-111.9229 -74.1598,-54.3719 -153.9841,-97.1415 -232.1162,-124.3668 -87.7162,-30.565 -183.514,-45.1992 -266.4136,-40.6976 -147.2011,7.9933 -289.3273,57.5801 -425.34015,148.3982 -77.33395,51.6372 -160.45976,129.6244 -229.28678,215.113 -11.78586,14.639 -33.01899,43.8999 -71.11349,98 -13.68395,19.4334 -30.45614,43.1334 -37.27153,52.6667 -6.81539,9.5333 -21.07762,30.5333 -31.69385,46.6667 -26.09105,39.6502 -71.55779,105.6268 -113.23957,164.3214 -37.90541,53.3769 -91.58196,110.1984 -136.14021,144.1165 -23.84606,18.1519 -50.91697,33.7338 -74.81857,43.0654 -22.03271,8.6019 -54.52798,13.2904 -72.51209,10.4621 z"
        />
      </g>
    </svg>
  );
}

function SendIcon({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

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
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {steps.map((step, i) => {
          const isActive = i === currentIndex;
          const isComplete = i < currentIndex;

          return (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: isComplete ? "#22c55e" : "transparent",
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
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (!isMobile) {
        inputRef.current.focus();
      }
    }
  }, [isExpanded]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  const handleButtonClick = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }
    if (prompt.trim() && status !== "submitting" && !isPipelineActive) {
      handleSubmit();
      return;
    }
    setIsExpanded(false);
    reset();
    setPrompt("");
  };

  const isPipelineActive = pipelineStep !== null;
  const hasText = prompt.trim().length > 0;
  const canSend = hasText && status !== "submitting" && !isPipelineActive;

  return (
    <>
      <style>{`
        @keyframes anteater-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
        @keyframes anteater-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        {/* Stacked: progress behind input, button overlapping */}
        <div style={{ position: "relative" }}>
          {/* Progress/error panel — sits behind the input bar, narrower, slides up */}
          {isExpanded && (isPipelineActive || (status === "error" && error)) && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: "40px",
                right: `${BUTTON_SIZE / 2 + 40}px`,
                zIndex: 0,
                background: "#111",
                border: "1px solid #444",
                borderBottom: "none",
                borderRadius: "12px 12px 0 0",
                boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.3)",
                animation: "anteater-slide-up 0.25s ease-out",
                paddingBottom: `${BUTTON_SIZE + 4}px`,
              }}
            >
              {isPipelineActive && (
                <PipelineProgress currentStep={pipelineStep} steps={pipelineSteps} />
              )}
              {status === "error" && error && (
                <div
                  style={{
                    padding: "10px 16px",
                    fontSize: "13px",
                    color: "#ef4444",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Input bar + circle button row */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <form
              onSubmit={handleSubmit}
              style={{
                overflow: "hidden",
                width: isExpanded ? "min(360px, calc(100vw - 100px))" : "0px",
                opacity: isExpanded ? 1 : 0,
                marginRight: `${BUTTON_SIZE / 2}px`,
                transition: "width 0.3s ease, opacity 0.2s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "8px 16px",
                  height: `${BUTTON_SIZE}px`,
                  boxSizing: "border-box",
                  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)",
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
                    fontSize: "16px",
                    fontFamily: "inherit",
                    minWidth: 0,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && !isPipelineActive) {
                      setIsExpanded(false);
                      reset();
                      setPrompt("");
                    }
                  }}
                />
              </div>
            </form>

            {/* Anteater circle button */}
            <button
              type="button"
              onClick={handleButtonClick}
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                zIndex: 2,
                width: `${BUTTON_SIZE}px`,
                height: `${BUTTON_SIZE}px`,
                borderRadius: "50%",
                border: "none",
                background: canSend ? "#22c55e" : "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: canSend
                  ? "0 4px 24px rgba(34, 197, 94, 0.4)"
                  : "0 4px 24px rgba(0, 0, 0, 0.3)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.08)";
                e.currentTarget.style.boxShadow = canSend
                  ? "0 4px 32px rgba(34, 197, 94, 0.6)"
                  : "0 4px 32px rgba(0, 0, 0, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = canSend
                  ? "0 4px 24px rgba(34, 197, 94, 0.4)"
                  : "0 4px 24px rgba(0, 0, 0, 0.3)";
              }}
            >
              {canSend ? (
                <SendIcon size={20} color="#000" />
              ) : (
                <span style={{ marginTop: "-3px" }}><AnteaterLogo size={34} color="#111" /></span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
