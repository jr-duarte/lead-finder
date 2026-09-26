import type { BusinessRegistry } from "@/domain/business"
import { lookupCnpj } from "@crawler/lookups/cnpj.lookup"
import {
  extractFromHtml,
  findContactLinks,
  mergeExtractions,
  type WebsiteExtraction,
} from "@crawler/parsers/website.parser"
import { TaskQueue } from "@crawler/queue/task-queue"
import { BrowserRenderer } from "@crawler/workers/browser-renderer"

export type EnrichmentTarget = {
  id: string
  name: string
  website?: string
  /** A CNPJ already on record (e.g. typed by the user) wins over the site's. */
  cnpj?: string
}

export type EnrichmentOutcome = {
  id: string
  ok: boolean
  enrichedAt: Date
  emails: string[]
  socials: {
    instagram?: string
    facebook?: string
    whatsapp?: string
    linkedin?: string
  }
  websiteStatus?: number
  websiteTitle?: string
  technologies: string[]
  /** CNPJ on record or found on the site; absent when neither had one. */
  cnpj?: string
  /** Receita record for `cnpj`, when the lookup succeeded. */
  registry?: BusinessRegistry
  /** Why the Receita lookup failed; the enrichment itself still counts. */
  registryError?: string
  error?: string
  /** Set when the run was cancelled before this target was attempted. */
  cancelled?: boolean
  /**
   * Set when the business could never be enriched (no website). It still
   * counts as processed, but not as a failure.
   */
  skipped?: boolean
}

export type EnrichConfig = {
  concurrency: number
  delayMs: number
  timeoutMs: number
  userAgent: string
  /**
   * How many contact pages to visit when the home page yields no e-mail.
   * 0 disables following links entirely.
   */
  maxContactPages?: number
  /**
   * Renders pages in a headless browser so client-rendered sites (React, Vue)
   * expose their content. Slower, so it is opt-in per run.
   */
  renderJavaScript?: boolean
  /** Shared renderer supplied by enrichMany; absent for a single fetch. */
  renderer?: { render: (url: string) => Promise<string | null> }
  /**
   * Called as each target finishes, so a long run can report progress and
   * persist results incrementally instead of only at the end.
   */
  onProgress?: (outcome: EnrichmentOutcome) => Promise<void> | void
  /**
   * Checked before each target; returning true stops the run. Used to honour
   * a cancellation requested from the UI.
   */
  shouldStop?: () => Promise<boolean> | boolean
  /**
   * Minha Receita base URL used to look up the CNPJ found on the site.
   * Absent or empty disables the lookup.
   */
  cnpjLookupEndpoint?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Detects a document that arrived without its content, which is what a plain
 * fetch gets from a client-rendered site. Text is measured after stripping
 * scripts and tags, since such pages are mostly bundle markup.
 */
export function looksClientRendered(html: string): boolean {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (text.length > 600) return false

  // A root mount node alongside little text is the clearest signal.
  const hasMountNode = /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i.test(
    html
  )

  return hasMountNode || text.length < 200
}

/**
 * Turns an HTTP status into a reason the user can act on: whether the site is
 * broken, blocking us, or simply gone.
 */
export function describeHttpFailure(status: number): string {
  if (status === 404) {
    return "Página não encontrada (404). O endereço cadastrado pode estar desatualizado."
  }
  if (status === 403 || status === 401) {
    return `O site bloqueou o acesso automatizado (${status}). Consulte os contatos manualmente.`
  }
  if (status === 429) {
    return "O site limitou as requisições (429). Tente novamente mais tarde."
  }
  if (status >= 500) {
    return `O site está fora do ar (erro ${status} no servidor dele). Tente novamente mais tarde.`
  }
  return `O site respondeu com status ${status}.`
}

/** Network-level failures rarely carry a message a user can act on. */
function describeNetworkFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : ""

  if (/ENOTFOUND|getaddrinfo|dns/i.test(raw)) {
    return "Domínio não encontrado. O site pode ter saído do ar ou o endereço estar incorreto."
  }
  if (/ECONNREFUSED|ECONNRESET|socket hang up/i.test(raw)) {
    return "O servidor do site recusou a conexão. Ele pode estar fora do ar."
  }
  if (/certificate|SSL|TLS/i.test(raw)) {
    return "O site tem problema no certificado de segurança (HTTPS)."
  }

  return "Não foi possível acessar o site. Ele pode estar fora do ar."
}

/**
 * Fetches a secondary page, returning null on any failure: a contact page that
 * cannot be read must not fail the whole enrichment.
 */
async function fetchHtml(
  url: string,
  config: EnrichConfig
): Promise<string | null> {
  const doFetch = config.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await doFetch(url, {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    })

    if (!response.ok) return null

    const html = await response.text()

    // Only pay for a browser render when the plain fetch came up thin.
    if (config.renderer && looksClientRendered(html)) {
      const rendered = await config.renderer.render(url)
      if (rendered) return rendered
    }

    return html
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches a single website and mines it for contact data. */
export async function enrichOne(
  target: EnrichmentTarget,
  config: EnrichConfig
): Promise<EnrichmentOutcome> {
  // `error` is declared explicitly so a successful run always carries the key
  // (as undefined) and clears any error stored by a previous attempt.
  const base: EnrichmentOutcome = {
    id: target.id,
    ok: false,
    enrichedAt: new Date(),
    emails: [],
    socials: {},
    technologies: [],
    error: undefined,
  }

  if (!target.website) {
    return {
      ...base,
      // Not a failure: there was never a site to read. Marking it skipped
      // keeps the failure count meaningful.
      skipped: true,
      error: "Empresa sem website para enriquecer",
    }
  }

  const doFetch = config.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await doFetch(target.website, {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        ...base,
        websiteStatus: response.status,
        error: describeHttpFailure(response.status),
      }
    }

    let html = await response.text()

    // The home page gets the same treatment as secondary pages: render only
    // when the plain response looks client-rendered.
    if (config.renderer && looksClientRendered(html)) {
      const rendered = await config.renderer.render(
        response.url || target.website
      )
      if (rendered) html = rendered
    }

    const extractions: WebsiteExtraction[] = [extractFromHtml(html)]

    // Many sites keep the e-mail on a "Contato" page rather than the home, so
    // those links are followed only when the home page came up short.
    const maxContactPages = config.maxContactPages ?? 2

    if (maxContactPages > 0 && extractions[0].emails.length === 0) {
      const finalUrl = response.url || target.website
      const links = findContactLinks(html, finalUrl, maxContactPages)

      for (const link of links) {
        const page = await fetchHtml(link, config)
        if (page) extractions.push(extractFromHtml(page))

        // Stop as soon as an e-mail turns up; extra requests cost time and
        // politeness budget.
        if (extractions.some((item) => item.emails.length > 0)) break
      }
    }

    const extraction = mergeExtractions(extractions)

    const cnpj = target.cnpj ?? extraction.cnpj
    const lookup =
      cnpj && config.cnpjLookupEndpoint
        ? await lookupCnpj(cnpj, {
            endpoint: config.cnpjLookupEndpoint,
            timeoutMs: config.timeoutMs,
            userAgent: config.userAgent,
            fetchImpl: config.fetchImpl,
          })
        : undefined

    return {
      ...base,
      ok: true,
      cnpj,
      registry: lookup?.ok ? lookup.registry : undefined,
      registryError: lookup && !lookup.ok ? lookup.error : undefined,
      websiteStatus: response.status,
      websiteTitle: extraction.title,
      emails: extraction.emails,
      socials: {
        instagram: extraction.instagram,
        facebook: extraction.facebook,
        whatsapp: extraction.whatsapp,
        linkedin: extraction.linkedin,
      },
      technologies: extraction.technologies,
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return {
      ...base,
      error: aborted
        ? "Tempo limite excedido ao acessar o site. Ele pode estar lento ou fora do ar."
        : describeNetworkFailure(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Enriches many targets with bounded concurrency. */
export async function enrichMany(
  targets: EnrichmentTarget[],
  config: EnrichConfig
): Promise<EnrichmentOutcome[]> {
  const queue = new TaskQueue(config.concurrency, config.delayMs)

  // One browser is shared by the whole batch; launching per site would be
  // prohibitively slow. An injected renderer (tests) is used as given.
  let owned: BrowserRenderer | null = null
  let renderer = config.renderer ?? null

  if (!renderer && config.renderJavaScript) {
    const candidate = new BrowserRenderer(config.userAgent, config.timeoutMs)
    // A missing Playwright install degrades to plain fetching rather than
    // failing the run.
    if (await candidate.start()) {
      owned = candidate
      renderer = candidate
    }
  }

  const runConfig: EnrichConfig = { ...config, renderer: renderer ?? undefined }

  try {
    return await queue.addAll(
      targets.map((target) => async () => {
        if (await config.shouldStop?.()) {
          return {
            id: target.id,
            ok: false,
            enrichedAt: new Date(),
            emails: [],
            socials: {},
            technologies: [],
            error: "Execução cancelada",
            cancelled: true,
          } satisfies EnrichmentOutcome
        }

        const outcome = await enrichOne(target, runConfig)
        await config.onProgress?.(outcome)
        return outcome
      })
    )
  } finally {
    // Only a browser this function launched is ours to close.
    await owned?.stop()
  }
}
