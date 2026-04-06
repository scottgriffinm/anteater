#!/usr/bin/env node

const command = process.argv[2];

if (command === "uninstall") {
  const { main } = await import("../lib/uninstall.mjs");
  await main();
} else {
  // Default to setup (handles "setup" arg or no arg)
  const { main } = await import("../lib/setup.mjs");
  await main();
}
