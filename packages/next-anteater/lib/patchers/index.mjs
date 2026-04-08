/**
 * Patcher/utility functions extracted from scaffold.mjs.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { buildRunsDeleteHandler } from "../generators/runs-route.mjs";

export async function writeIfNotExists(path, content) {
  try {
    await readFile(path);
    return false; // already exists
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    return true;
  }
}

export async function patchRunsRouteDeleteIfMissing(path, isTypeScript) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("export async function DELETE(")) {
      return false;
    }
    const patched = `${existing.trimEnd()}\n\n${buildRunsDeleteHandler(isTypeScript)}\n`;
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function patchApiRouteMutationGuardIfMissing(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("Same-origin guard for mutating Anteater requests")) {
      return false;
    }

    const guardBlock = [
      "    // Same-origin guard for mutating Anteater requests (no app auth integration required)",
      "    const requestOrigin = request.nextUrl.origin;",
      '    const fetchSite = request.headers.get("sec-fetch-site");',
      '    const origin = request.headers.get("origin");',
      '    const referer = request.headers.get("referer");',
      "    const hasMatchingOrigin = origin === requestOrigin;",
      "    const hasMatchingReferer = (() => {",
      "      if (!referer) return false;",
      "      try {",
      "        return new URL(referer).origin === requestOrigin;",
      "      } catch {",
      "        return false;",
      "      }",
      "    })();",
      '    const hasSameOriginBrowserSignal = fetchSite === "same-origin";',
      "    const hasValidSameOriginSignal = hasSameOriginBrowserSignal || hasMatchingOrigin || hasMatchingReferer;",
      "    const secret = process.env.ANTEATER_SECRET;",
      '    const hasValidSecret = !!secret && request.headers.get("x-anteater-secret") === secret;',
      "    if (!hasValidSameOriginSignal && !hasValidSecret) {",
      "      return NextResponse.json(",
      '        { requestId: "", branch: "", status: "error", error: "Forbidden" },',
      "        { status: 403 }",
      "      );",
      "    }",
      "",
    ].join("\n");

    const contentTypeBlock = [
      '    const contentType = request.headers.get("content-type") || "";',
      '    if (!contentType.toLowerCase().includes("application/json")) {',
      "      return NextResponse.json(",
      '        { requestId: "", branch: "", status: "error", error: "Content-Type must be application/json" },',
      "        { status: 415 }",
      "      );",
      "    }",
      "",
    ].join("\n");

    let patched = existing;

    patched = patched.replace(
      "  try {\n    const body",
      `  try {\n${contentTypeBlock}    const body`,
    );

    const oldAuthPattern = /    \/\/ Auth: sec-fetch-site for same-origin \(AnteaterBar\), x-anteater-secret for external[\s\S]*?    const repo = getRepo\(\);/;
    if (oldAuthPattern.test(patched)) {
      patched = patched.replace(oldAuthPattern, `${guardBlock}    const repo = getRepo();`);
    } else {
      patched = patched.replace(
        "    const repo = getRepo();",
        `${guardBlock}    const repo = getRepo();`,
      );
    }

    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function patchRunsRouteMutationGuardIfMissing(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (
      existing.includes("Same-origin guard for mutating runs endpoint") &&
      existing.includes("export async function DELETE(request") &&
      existing.indexOf("Same-origin guard for mutating runs endpoint") >
        existing.indexOf("export async function DELETE(request")
    ) {
      return false;
    }

    const guardBlock = [
      "  // Same-origin guard for mutating runs endpoint (no app auth integration required)",
      "  const requestOrigin = new URL(request.url).origin;",
      '  const fetchSite = request.headers.get("sec-fetch-site");',
      '  const origin = request.headers.get("origin");',
      '  const referer = request.headers.get("referer");',
      "  const hasMatchingOrigin = origin === requestOrigin;",
      "  const hasMatchingReferer = (() => {",
      "    if (!referer) return false;",
      "    try {",
      "      return new URL(referer).origin === requestOrigin;",
      "    } catch {",
      "      return false;",
      "    }",
      "  })();",
      '  const hasSameOriginBrowserSignal = fetchSite === "same-origin";',
      "  const hasValidSameOriginSignal = hasSameOriginBrowserSignal || hasMatchingOrigin || hasMatchingReferer;",
      "  const secret = process.env.ANTEATER_SECRET;",
      '  const hasValidSecret = !!secret && request.headers.get("x-anteater-secret") === secret;',
      "  if (!hasValidSameOriginSignal && !hasValidSecret) {",
      '    return NextResponse.json({ error: "Forbidden" }, { status: 403 });',
      "  }",
      "",
    ].join("\n");

    const deleteFnPattern =
      /(export async function DELETE\(request[^\n]*\) \{[\s\S]*?if \(!requestId\) \{[\s\S]*?\n  \}\n\s*)/;
    let patched = existing;

    if (deleteFnPattern.test(existing)) {
      patched = existing.replace(deleteFnPattern, `$1${guardBlock}`);
    } else {
      return false;
    }

    // Clean up buggy older patch where guard was accidentally inserted in GET.
    const getGuardPattern =
      /(export async function GET\(\) \{[\s\S]*?)\n  \/\/ Same-origin guard for mutating runs endpoint[\s\S]*?  const gh = \(url/g;
    if (getGuardPattern.test(patched)) {
      patched = patched.replace(getGuardPattern, "$1\n  const gh = (url");
    }

    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function patchRunsRouteFailedTtlIfMissing(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("failedCutoffMs")) {
      return false;
    }

    const replacement = [
      "    // Sort newest first, cap at 5",
      "    // Drop stale failed runs (>1h) so old errors don't clutter the bar",
      "    const failedCutoffMs = 60 * 60 * 1000;",
      "    const freshRuns = runs.filter((r) => {",
      '      if (r.step !== "error") return true;',
      "      const startedAtMs = new Date(r.startedAt).getTime();",
      "      if (Number.isNaN(startedAtMs)) return true;",
      "      return Date.now() - startedAtMs <= failedCutoffMs;",
      "    });",
      "",
      "    freshRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());",
      "",
      '    return NextResponse.json' + (existing.includes("<AnteaterRunsResponse>") ? "<AnteaterRunsResponse>" : "") + "(",
      "      { runs: freshRuns.slice(0, 5), deploymentId: process.env.VERCEL_DEPLOYMENT_ID }",
      "    );",
    ].join("\n");

    const sortAndReturnPattern =
      /    \/\/ Sort newest first, cap at 5[\s\S]*?    return NextResponse\.json(?:<AnteaterRunsResponse>)?\([\s\S]*?\n    \);/;
    if (!sortAndReturnPattern.test(existing)) {
      return false;
    }

    const patched = existing.replace(sortAndReturnPattern, replacement);
    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function patchWorkflowModelInputIfPresent(path) {
  try {
    const existing = await readFile(path, "utf-8");
    const modelInputPattern = /^\s*model:\s*".*"\s*\r?\n/m;
    if (!modelInputPattern.test(existing)) {
      return false;
    }
    const patched = existing.replace(modelInputPattern, "");
    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function patchRunsRouteDeploymentCompletionIfNeeded(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("merge_commit_sha")) {
      return false;
    }

    const oldBlockPattern =
      /if \(pr\?\.merged_at\) \{\r?\n\s*const mergedAgo = Date\.now\(\) - new Date\(pr\.merged_at\)\.getTime\(\);\r?\n\s*if \(mergedAgo > 300000\) continue; \/\/ >5 min ago, done\r?\n\s*runs\.push\(\{ \.\.\.base, step: "deploying" \}\);\r?\n\s*continue;\r?\n\s*\}/;

    if (!oldBlockPattern.test(existing)) {
      return false;
    }

    const replacementBlock = `if (pr?.merged_at) {
        const mergedAtMs = new Date(pr.merged_at).getTime();
        if (!Number.isFinite(mergedAtMs)) continue;

        // Detect deploy completion using the merge commit deployment state.
        const mergeSha = pr.merge_commit_sha;
        if (mergeSha) {
          try {
            const depRes = await gh(
              \`https://api.github.com/repos/\${repo}/deployments?sha=\${mergeSha}&per_page=1\`
            );
            if (depRes.ok) {
              const deployments = await depRes.json();
              if (deployments.length > 0) {
                const depId = deployments[0]?.id;
                if (depId) {
                  const depStatusRes = await gh(
                    \`https://api.github.com/repos/\${repo}/deployments/\${depId}/statuses?per_page=1\`
                  );
                  if (depStatusRes.ok) {
                    const depStatuses = await depStatusRes.json();
                    const depState = depStatuses?.[0]?.state;
                    if (depState === "success") continue;
                    if (depState === "failure" || depState === "error" || depState === "inactive") {
                      runs.push({ ...base, step: "error", failedStep: "Deployment failed" });
                      continue;
                    }
                  }
                }
              }
            }
          } catch {
            // Fall through to heuristic below.
          }
        }

        // PR merged — no deployment found after 10 min means Vercel likely not connected
        const mergeAge = Date.now() - mergedAtMs;
        if (mergeAge > 10 * 60 * 1000) {
          runs.push({ ...base, step: "error", failedStep: "No deployment detected. Connect your Vercel project to GitHub at vercel.com/new" });
          continue;
        }
        runs.push({ ...base, step: "deploying" });
        continue;
      }`;

    const patched = existing.replace(oldBlockPattern, replacementBlock);
    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch the layout file to include AnteaterBar.
 */
export async function patchLayout(layoutPath, cwd) {
  const fullPath = join(cwd, layoutPath);
  let content = await readFile(fullPath, "utf-8");

  // Don't patch if already has AnteaterBar
  if (content.includes("AnteaterBar")) {
    return false;
  }

  // Add import at the top (after last import line)
  const importLine = `import { AnteaterBar } from "next-anteater";\n`;
  const lastImportIdx = content.lastIndexOf("import ");
  if (lastImportIdx !== -1) {
    const endOfLine = content.indexOf("\n", lastImportIdx);
    content = content.slice(0, endOfLine + 1) + importLine + content.slice(endOfLine + 1);
  }

  // Add <AnteaterBar /> before closing </body>
  content = content.replace(
    /([ \t]*)<\/body>/,
    `$1  <AnteaterBar />\n$1</body>`
  );

  await writeFile(fullPath, content, "utf-8");
  return true;
}
