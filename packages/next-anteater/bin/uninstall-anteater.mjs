#!/usr/bin/env node
import { main } from "../lib/uninstall.mjs";

main().catch((err) => {
  console.error(`\n  \x1b[31mError:\x1b[39m ${err.message}\n`);
  process.exit(1);
});
