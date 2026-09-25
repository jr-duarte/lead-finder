import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@crawler": resolve(import.meta.dirname, "./crawler"),
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
