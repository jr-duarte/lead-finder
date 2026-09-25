/**
 * Optional JavaScript rendering for sites that build their content on the
 * client (React, Vue, Angular), which return an almost empty HTML document to
 * a plain fetch.
 *
 * Playwright is imported lazily so it stays a development dependency: when it
 * is unavailable the caller falls back to plain HTML fetching instead of
 * failing.
 */

type BrowserLike = {
  newPage: (options?: unknown) => Promise<PageLike>
  close: () => Promise<void>
}

type PageLike = {
  goto: (url: string, options?: unknown) => Promise<unknown>
  content: () => Promise<string>
  close: () => Promise<void>
}

type ChromiumLike = {
  launch: (options?: unknown) => Promise<BrowserLike>
}

let chromiumPromise: Promise<ChromiumLike | null> | null = null

/** Resolves Playwright once per process, or null when it is not installed. */
async function loadChromium(): Promise<ChromiumLike | null> {
  if (!chromiumPromise) {
    chromiumPromise = import("playwright")
      .then(
        (module) => (module as unknown as { chromium: ChromiumLike }).chromium
      )
      .catch(() => null)
  }
  return chromiumPromise
}

export async function isRendererAvailable(): Promise<boolean> {
  return (await loadChromium()) !== null
}

export class BrowserRenderer {
  private browser: BrowserLike | null = null

  constructor(
    private readonly userAgent: string,
    private readonly timeoutMs: number
  ) {}

  /**
   * Starts the shared browser. Returns false when Playwright or its browser
   * binary is missing, so the caller can degrade to plain fetching.
   */
  async start(): Promise<boolean> {
    if (this.browser) return true

    const chromium = await loadChromium()
    if (!chromium) return false

    try {
      this.browser = await chromium.launch({ headless: true })
      return true
    } catch {
      // Playwright is installed but the browser binary was never downloaded.
      this.browser = null
      return false
    }
  }

  /** Renders a page and returns its HTML after scripts have run. */
  async render(url: string): Promise<string | null> {
    if (!this.browser) return null

    let page: PageLike | null = null

    try {
      page = await this.browser.newPage({
        userAgent: this.userAgent,
        javaScriptEnabled: true,
      })

      // "domcontentloaded" plus a settle delay is more reliable than
      // "networkidle" on sites with long-polling or analytics beacons.
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.timeoutMs,
      })

      await new Promise((resolve) => setTimeout(resolve, 1200))

      return await page.content()
    } catch {
      return null
    } finally {
      await page?.close().catch(() => {})
    }
  }

  async stop(): Promise<void> {
    await this.browser?.close().catch(() => {})
    this.browser = null
  }
}
