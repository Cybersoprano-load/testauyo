import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
});
