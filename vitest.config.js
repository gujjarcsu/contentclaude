import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Phase 1 item 10 — this used to be `app/utils/**` only, which reported
      // healthy coverage while every route was unmeasured. Routes are where the
      // merchant-visible decisions live: what a first-run shop sees, how many
      // products an action takes when quota is short, whether a paying shop is
      // shown Free. Measuring only the helpers made all of that invisible.
      include: ["app/utils/**/*.js", "app/routes/**/*.jsx", "app/queues/**/*.js"],
      exclude: [
        // Boot sequencing. Exercised by processRole and the deep health check;
        // not meaningfully unit-testable on its own.
        "app/utils/startup.server.js",
      ],
    },
  },
});
