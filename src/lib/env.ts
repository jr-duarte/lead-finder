import { z } from "zod"

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1)
    .default("mongodb://127.0.0.1:27017/lead-finder"),
  PLACES_SOURCE: z.enum(["mock", "osm", "google"]).default("mock"),
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GOOGLE_PLACES_ENDPOINT: z
    .string()
    .default("https://places.googleapis.com/v1/places:searchText"),
  OVERPASS_ENDPOINT: z
    .string()
    .default("https://overpass-api.de/api/interpreter"),
  CRAWLER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  CRAWLER_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(1200),
  CRAWLER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  /** Contact pages visited per site when the home page yields no e-mail. */
  CRAWLER_MAX_CONTACT_PAGES: z.coerce.number().int().min(0).max(5).default(2),
  /** Minha Receita base URL for CNPJ lookups; empty disables them. */
  CNPJ_LOOKUP_ENDPOINT: z.string().default("https://minhareceita.org"),
  /** Claude Code executable used to generate sales approaches. */
  CLAUDE_CLI_PATH: z.string().default("claude"),
  CLAUDE_CLI_MODEL: z.string().default("opus"),
  CLAUDE_CLI_TIMEOUT_MS: z.coerce.number().int().min(10000).default(180000),
  CRAWLER_USER_AGENT: z
    .string()
    .default("LeadFinder/1.0 (+local research tool)"),
  /** Turns the WhatsApp inbox (Baileys) on or off. */
  WHATSAPP_ENABLED: z.stringbool().default(true),
  WHATSAPP_SESSION_NAME: z
    .string()
    .regex(/^[\w-]+$/, "Use apenas letras, números, _ e -")
    .default("lead-finder"),
  /** Folder holding the session credentials. Never commit it. */
  WHATSAPP_SESSION_DIR: z.string().min(1).default(".whatsapp-session"),
  /** History window imported on the very first connection. */
  WHATSAPP_INITIAL_SYNC_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Overlap with the previous sync, so clock skew never opens a gap. */
  WHATSAPP_SYNC_SAFETY_WINDOW_MIN: z.coerce.number().int().min(0).default(1440),
  WHATSAPP_INCLUDE_GROUPS: z.stringbool().default(false),
  /** First contacts sent by campaigns per day, across the whole account. */
  WHATSAPP_CAMPAIGN_DAILY_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(5),
  WHATSAPP_CAMPAIGN_DEFAULT_INTERVAL_MIN: z.coerce
    .number()
    .int()
    .min(2)
    .max(24 * 60)
    .default(10),
  /** How much each interval varies (±%), so sends never look robotic. */
  WHATSAPP_CAMPAIGN_JITTER_PERCENT: z.coerce
    .number()
    .int()
    .min(0)
    .max(90)
    .default(30),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env)
  }
  return cached
}
