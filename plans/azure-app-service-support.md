# Plan: Azure App Service Support

**Status:** Not started
**Estimated scope:** ~200 lines of new code, mostly in setup/scaffold. No changes to React components or hooks.

---

## Context

Anteater currently assumes Vercel as the hosting platform. The core pipeline (prompt -> GitHub Actions -> Claude Code -> PR -> auto-merge) is already platform-agnostic. Vercel only matters in two places: deployment detection and setup. Adding Azure App Service support is straightforward because the hard parts are already portable.

## Vercel-Specific Touch Points (What Needs to Change)

| Location | What's Hardcoded | File | Lines |
|----------|-----------------|------|-------|
| Repo detection | `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG` | `scaffold.mjs` | ~364-366, ~941-942 |
| Deployment ID | `process.env.VERCEL_DEPLOYMENT_ID` | `scaffold.mjs` | ~384, ~948, ~1204 |
| Error messages | "Connect your Vercel project to GitHub at vercel.com/new" | `scaffold.mjs` | ~279, 282, 675, 1054, 1057 |
| Preflight check | Checks for `vercel` CLI | `setup.mjs` | ~103-108 |
| Env var setup | `setVercelEnv()` uses Vercel CLI | `secrets.mjs` | ~120-136 |
| Unrestricted mode warning | Mentions "Vercel CLI" | `setup.mjs` | ~246-267 |
| Final instructions | "Make sure your Vercel project is connected" | `setup.mjs` | ~457-459 |

## What Stays the Same (No Changes Needed)

- `AnteaterBar` component
- `useAnteaterRuns` hook (already uses generic `deploymentId`)
- `useAnteater` hook
- Types (`types.ts`)
- GitHub Actions core workflow (Claude Code action, PR creation, auto-merge)
- Concurrency/queue logic
- Status model (5 statuses)
- PR lifecycle

## Key Technical Decisions

### 1. Deployment trigger: Rely on Azure Deployment Center (not workflow-driven deploy)

Most Azure App Service users already have Deployment Center connected to their GitHub repo. When a PR merges to `main`, Azure auto-deploys, same as Vercel. This means:
- The Anteater workflow doesn't need Azure deploy steps
- No Azure credentials needed in the workflow
- Simpler setup, same behavior as Vercel

If a user doesn't have Deployment Center, they'll need to set it up themselves (we document this). A future enhancement could add `azure/login` + `azure/webapps-deploy` steps to the workflow.

### 2. Deployment ID: Custom `DEPLOYMENT_ID` env var set by Azure's deploy workflow

Azure has no built-in equivalent to `VERCEL_DEPLOYMENT_ID`. The solution:
- Azure's auto-generated deploy workflow (from Deployment Center) can be modified to set a `DEPLOYMENT_ID` app setting to `${{ github.sha }}` or `${{ github.run_id }}`
- OR: the Anteater setup CLI sets an initial `DEPLOYMENT_ID` app setting, and the user's deploy workflow updates it
- The scaffolded API routes read `process.env.DEPLOYMENT_ID` on Azure instead of `VERCEL_DEPLOYMENT_ID`
- Client-side reload logic works the same way (compare IDs across polls)

### 3. Deployment status: GitHub Deployments API (already works)

Both Vercel and Azure (via GitHub Actions) create GitHub Deployment records on the merge commit. The runs route already queries this API. No change needed for status detection.

### 4. Credentials: Publish profile for simplest DX

| Method | Secrets | Setup Effort | Security |
|--------|---------|-------------|----------|
| **Publish profile** | 1 XML blob | Download from Portal, paste | Weakest (doesn't expire) |
| **Service principal** | 1 JSON blob | `az ad sp create-for-rbac` | Medium |
| **OIDC** | 3 read-only IDs | App registration + federated cred | Strongest |

Start with publish profile (simplest, matches Vercel's "one secret" DX). Can add OIDC support later.

### 5. Env var setup: Azure CLI

```bash
az webapp config appsettings set \
  --name <app> \
  --resource-group <rg> \
  --settings GITHUB_TOKEN=<token> GITHUB_REPOSITORY=<owner/repo>
```

Requires: Azure CLI installed, user logged in, app name + resource group known.

## Implementation Steps

### Step 1: Add `platform` field to config (`anteater.config.ts`)

Add a `platform` field: `"vercel" | "azure" | "other"`. Default: `"vercel"` (backward compatible).

**Files:** `scaffold.mjs` (config generation), `types.ts` (add to AnteaterConfig type)

### Step 2: Platform prompt in setup CLI

After path configuration, ask:
```
Where is this app deployed?
  1. Vercel (default)
  2. Azure App Service
  3. Other / self-hosted
```

Store choice in config. Skip Vercel CLI check if Azure. Skip Azure CLI check if Vercel.

**Files:** `setup.mjs`

### Step 3: Platform-aware repo detection in scaffolded routes

Current: reads `VERCEL_GIT_REPO_OWNER` + `VERCEL_GIT_REPO_SLUG`
New: add fallback chain:
1. `VERCEL_GIT_REPO_OWNER`/`VERCEL_GIT_REPO_SLUG` (Vercel)
2. `GITHUB_REPOSITORY` env var (Azure, set as app setting during setup)
3. Config file `repo` field (already exists as fallback)

**Files:** `scaffold.mjs` (getRepo function in generated routes)

### Step 4: Platform-aware deployment ID in scaffolded routes

Current: `process.env.VERCEL_DEPLOYMENT_ID`
New:
```js
const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.DEPLOYMENT_ID || null;
```

This works for both platforms. Azure users set `DEPLOYMENT_ID` via their deploy workflow or as an app setting.

**Files:** `scaffold.mjs` (status route, runs route — ~3 lines each)

### Step 5: Platform-aware error messages

Replace hardcoded "Connect your Vercel project..." with platform-conditional messages:
- Vercel: "Connect your Vercel project to GitHub at vercel.com/new"
- Azure: "Ensure Azure Deployment Center is connected to your GitHub repo"
- Other: "Ensure your hosting platform deploys on push to main"

**Files:** `scaffold.mjs` (~5 error message locations)

### Step 6: Azure env var setup (`setAzureEnv`)

New function in `secrets.mjs`:
```js
async function setAzureEnv(appName, resourceGroup, vars) {
  // az webapp config appsettings set --name <app> --resource-group <rg> --settings KEY=VAL
}
```

Setup CLI prompts for app name and resource group, then sets `GITHUB_TOKEN` and `GITHUB_REPOSITORY`.

**Files:** `secrets.mjs` (~40 lines), `setup.mjs` (call it when platform is azure)

### Step 7: Azure credential setup for deploy (optional enhancement)

If the user wants Anteater's workflow to deploy directly (instead of relying on Deployment Center):
- Prompt for publish profile XML
- Store as `AZURE_WEBAPP_PUBLISH_PROFILE` GitHub secret
- Add `azure/webapps-deploy` step to workflow YAML after auto-merge

This is optional — most users will rely on Deployment Center.

**Files:** `scaffold.mjs` (workflow generation), `setup.mjs` (credential prompt)

### Step 8: Platform-aware preflight checks

- Vercel: check for `vercel` CLI (existing)
- Azure: check for `az` CLI, check login status (`az account show`)
- Other: skip platform checks

**Files:** `setup.mjs` (~20 lines)

### Step 9: Platform-aware final instructions

After setup completes, show platform-specific next steps:
- Vercel: "Make sure your Vercel project is connected to your GitHub repo"
- Azure: "Make sure Azure Deployment Center is connected to your GitHub repo. Set DEPLOYMENT_ID in your deploy workflow for automatic page reloads."
- Other: "Make sure your hosting platform deploys on push to your main branch"

**Files:** `setup.mjs` (~15 lines)

## Testing Plan

1. **Unit tests:** Add platform parameter to existing scaffold tests, verify generated code differs per platform
2. **Setup flow:** Run `npx next-anteater setup` with piped inputs for each platform choice
3. **Generated routes:** Verify Azure routes compile in strict TypeScript
4. **End-to-end (Vercel):** Existing flow, regression test
5. **End-to-end (Azure):** Deploy a test Next.js app on Azure App Service, run setup, submit a prompt, verify full lifecycle

## Future Enhancements (Not in V1)

- OIDC credential support (more secure than publish profile)
- Workflow-driven deploy with `azure/webapps-deploy` step
- Azure Static Web Apps support (if it exits preview)
- AWS Amplify / Netlify / Railway support (same pattern)
- Auto-detect platform from environment (skip the prompt)
