import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@anteater/next"],
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
};

export default nextConfig;
