import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
  test: {
    include: ["benchmarks/*.bench.ts"],
    environment: "node",
    testTimeout: 360000,
    maxConcurrency: 2,
  },
});
