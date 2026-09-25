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
  CRAWLER_USER_AGENT: z
    .string()
    .default("LeadFinder/1.0 (+local research tool)"),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env)
  }
  return cached
}
