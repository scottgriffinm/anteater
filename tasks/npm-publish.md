# npm Publish Skill — next-anteater

Use this guide whenever publishing a new version of the `next-anteater` package to npm.

## Pre-flight Checklist

1. **Bump version** in `packages/next-anteater/package.json`
   - Patch (`x.x.+1`) for bug fixes
   - Minor (`x.+1.0`) for new features
   - Major (`+1.0.0`) for breaking changes
   - Ask the user which bump they want if unclear

2. **Verify bin entries have NO `./` prefix**
   - Correct: `"next-anteater": "bin/cli.mjs"`
   - Wrong: `"next-anteater": "./bin/cli.mjs"` (npm v10+ silently strips these)

3. **Verify all bin files have shebangs**
   - First line must be exactly: `#!/usr/bin/env node`
   - Check all files in `packages/next-anteater/bin/`

4. **Verify `files` array includes all needed directories**
   - Currently: `["bin/", "lib/"]`
   - If new directories are added to the package, update this array

5. **Check current npm version** to avoid republishing the same version:
   ```bash
   npm view next-anteater version
   ```

## Publish Steps

```bash
cd packages/next-anteater \
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

# Test install works
npx next-anteater --help
```

## Known Gotchas

| Issue | Cause | Fix |
|-------|-------|-----|
| bin entries silently removed on publish | `./` prefix on bin paths | Remove `./` prefix |
| `--token` flag ignored | Deprecated in npm v10+ | Use `.npmrc` file method |
| `npm warn publish npm auto-corrected some errors` | Invalid bin paths | Check bin paths have no `./` prefix |
| Package installs but commands don't work | Missing shebang in bin files | Add `#!/usr/bin/env node` as first line |

## Package Structure

```
packages/next-anteater/
  package.json        # version, bin, files
  bin/
    cli.mjs           # npx next-anteater <command>
    setup-anteater.mjs    # npx anteater (alias)
    uninstall-anteater.mjs # npx anteater-uninstall (alias)
  lib/
    detect.mjs
    scaffold.mjs
    secrets.mjs
    setup.mjs
    ui.mjs
    uninstall.mjs
```
