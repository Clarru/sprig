import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/canvas/**/*.test.{ts,tsx}", "apps/canvas/**/*.test.ts"],
    environment: "node",
  },
});
