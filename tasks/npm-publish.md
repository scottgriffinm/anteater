# npm Publish Skill — next-anteater

Use this guide whenever publishing a new version of the `next-anteater` package to npm.

## Pre-flight Checklist

1. **Bump version** in `packages/next-anteater/package.json`
   - Patch (`x.x.+1`) for bug fixes
   - Minor (`x.+1.0`) for new features
   - Major (`+1.0.0`) for breaking changes
   - Ask the user which bump they want if unclear

2. **Build the package** — REQUIRED before every publish:
   ```bash
   cd packages/next-anteater && npm run build
   ```
   This compiles `src/` (React components, hooks, types) into `dist/`.
   If you skip this, users get stale or missing component exports.

3. **Verify bin entries have NO `./` prefix**
   - Correct: `"next-anteater": "bin/cli.mjs"`
   - Wrong: `"next-anteater": "./bin/cli.mjs"` (npm v10+ silently strips these)

4. **Verify all bin files have shebangs**
   - First line must be exactly: `#!/usr/bin/env node`
   - Check all files in `packages/next-anteater/bin/`

5. **Verify `files` array includes all needed directories**
   - Must be: `["bin/", "lib/", "dist/", "src/"]`
   - `dist/` = compiled JS + .d.ts (what consumers import)
   - `src/` = TypeScript source (for source maps / debugging)
   - `bin/` = CLI entry points
   - `lib/` = CLI logic (setup, scaffold, etc.)

6. **Check current npm version** to avoid republishing the same version:
   ```bash
   npm view next-anteater version
   ```

## Publish Steps

```bash
cd packages/next-anteater \
  && npm run build \
  && export NODE_AUTH_TOKEN=$(grep NPM_TOKEN ../../.env | cut -d= -f2-) \
  && echo "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" > .npmrc \
  && npm publish \
  && rm .npmrc
```

Key points:
- NPM_TOKEN lives in the root `.env` file — never read or log it directly
- The `.npmrc` is created temporarily and deleted immediately after publish
- Never use `--token` flag (broken in newer npm versions)

## Post-publish Verification

```bash
# Confirm version is live
npm view next-anteater version

# Confirm bin entries are registered
npm view next-anteater bin

# Confirm exports work (components + types)
npm view next-anteater exports

# Test install works
npx next-anteater --help
```

## Known Gotchas

| Issue | Cause | Fix |
|-------|-------|-----|
| bin entries silently removed on publish | `./` prefix on bin paths | Remove `./` prefix |
| `--token` flag ignored | Deprecated in npm v10+ | Use `.npmrc` file method |
| `AnteaterBar` import fails for users | Forgot to run `npm run build` before publish | Always build first |
| TypeScript types missing for users | `dist/` not included in `files` array | Ensure `dist/` is in `files` |
| Package installs but commands don't work | Missing shebang in bin files | Add `#!/usr/bin/env node` as first line |

## Package Structure

```
packages/next-anteater/
  package.json          # version, bin, exports, files
  tsconfig.build.json   # TypeScript config for component build
  bin/
    cli.mjs             # npx next-anteater <command>
    setup-anteater.mjs  # npx anteater (alias)
    uninstall-anteater.mjs # npx anteater-uninstall (alias)
  lib/
    detect.mjs          # Project detection
    scaffold.mjs        # File generation (API routes, config, workflow)
    secrets.mjs         # Token validation, env management
    setup.mjs           # Interactive setup wizard
    ui.mjs              # Terminal UI helpers
    uninstall.mjs       # Uninstall logic
  src/
    index.ts            # Public exports
    types.ts            # Type definitions
    components/
      anteater-bar.tsx  # AnteaterBar React component
    hooks/
      use-anteater.ts   # Single-run hook
      use-anteater-runs.ts # Multi-run hook
  dist/                 # Compiled output (built from src/)
    index.js + .d.ts
    types.js + .d.ts
    components/
    hooks/
```
