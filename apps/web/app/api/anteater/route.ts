import { NextRequest, NextResponse } from "next/server";
import type { AnteaterRequest, AnteaterResponse } from "@anteater/next";

export async function POST(request: NextRequest) {
  try {
    const body: AnteaterRequest = await request.json();

    if (!body.prompt?.trim()) {
      return NextResponse.json<AnteaterResponse>(
        {
          requestId: "",
          branch: "",
          status: "error",
          error: "Prompt is required",
        },
        { status: 400 }
      );
    }

    // Auth check
    const secret = process.env.ANTEATER_SECRET;
    if (secret) {
      const authHeader = request.headers.get("x-anteater-secret");
      if (authHeader !== secret) {
        return NextResponse.json<AnteaterResponse>(
          {
            requestId: "",
            branch: "",
            status: "error",
            error: "Unauthorized",
          },
          { status: 401 }
        );
      }
    }

    const repo = process.env.ANTEATER_GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    if (!repo || !token) {
      return NextResponse.json<AnteaterResponse>(
        {
          requestId: "",
          branch: "",
          status: "error",
          error: "Server misconfigured: missing ANTEATER_GITHUB_REPO or GITHUB_TOKEN",
        },
        { status: 500 }
      );
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    const branch =
      body.mode === "copy"
        ? `anteater/friend-${requestId}`
        : `anteater/run-${requestId}`;

    // Dispatch GitHub Actions workflow
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            requestId,
            prompt: body.prompt,
            mode: body.mode || "prod",
            branch,
            baseBranch: "main",
            autoMerge: String(body.mode !== "copy"),
          },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const err = await dispatchRes.text();
      return NextResponse.json<AnteaterResponse>(
        {
          requestId,
          branch,
          status: "error",
          error: `GitHub dispatch failed: ${dispatchRes.status} ${err}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json<AnteaterResponse>({
      requestId,
      branch,
      status: "queued",
    });
  } catch {
    return NextResponse.json<AnteaterResponse>(
      {
        requestId: "",
        branch: "",
        status: "error",
        error: "Invalid request body",
      },
      { status: 400 }
    );
  }
}
