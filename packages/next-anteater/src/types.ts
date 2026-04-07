export interface AnteaterConfig {
  /** GitHub repo in "owner/repo" format */
  repo: string;
  /** Branch to target for production changes */
  productionBranch?: string;
  /** Enabled modes */
  modes?: Array<"prod" | "copy">;
  /** Auto-merge safe PRs */
  autoMerge?: boolean;
  /** Glob patterns the AI may edit */
  allowedGlobs?: string[];
  /** Glob patterns the AI must never edit */
  blockedGlobs?: string[];
  /** Keywords that require human review */
  requireReviewFor?: string[];
  /** Max files the AI can change in one run */
  maxFilesChanged?: number;
  /** Max diff size in bytes */
  maxDiffBytes?: number;
}

export interface AnteaterRequest {
  prompt: string;
  mode: "prod" | "copy";
  route?: string;
  branch?: string;
  context?: {
    pathname?: string;
    userId?: string;
    role?: string;
  };
}

export interface AnteaterResponse {
  requestId: string;
  branch: string;
  status: "queued" | "busy" | "error";
  error?: string;
}

export type AnteaterStep = "queued" | "starting" | "working" | "merging" | "deploying" | "error";

export interface AnteaterStatusResponse {
  /** Current pipeline step */
  step: AnteaterStep;
  /** Whether the workflow has completed */
  completed: boolean;
  /** Error message if failed */
  error?: string;
  /** Vercel deployment ID for the current deployment instance */
  deploymentId?: string;
}

/** A single active run in the multi-run list */
export interface AnteaterRun {
  branch: string;
  requestId: string;
  prompt: string;
  step: AnteaterStep;
  mode: "prod" | "copy";
  /** ISO timestamp when the workflow run started (for elapsed time display) */
  startedAt: string;
  /** Name of the step that failed (only set when step === "error") */
  failedStep?: string;
  /** Position in the queue (only set when step === "queued") */
  queuePosition?: number;
}

/** Response from GET /api/anteater/runs */
export interface AnteaterRunsResponse {
  runs: AnteaterRun[];
  deploymentId?: string;
  error?: string;
}

export interface AnteaterBarProps {
  /** API endpoint to submit prompts to */
  apiEndpoint?: string;
  /** Default mode */
  mode?: "prod" | "copy";
  /** Placeholder text */
  placeholder?: string;
  /** Branch override (for invite/copy mode) */
  branch?: string;
}
