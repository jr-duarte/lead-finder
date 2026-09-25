import { config as loadEnv } from "dotenv"
import { defineConfig, devices } from "@playwright/test"

// Mirrors the app's env so tests can tell which source is configured.
loadEnv({ path: ".env.local" })

const PORT = Number(process.env.PORT ?? 3100)
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
