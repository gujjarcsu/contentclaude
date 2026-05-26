import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/utils/**/*.js"],
      exclude: ["app/utils/startup.server.js"],
    },
  },
});
