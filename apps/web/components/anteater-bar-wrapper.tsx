"use client";

import { AnteaterBar } from "@anteater/next";

export function AnteaterBarWrapper() {
  return (
    <AnteaterBar
      apiEndpoint="/api/anteater"
      mode="prod"
      placeholder="Describe a change to this page..."
    />
  );
}
