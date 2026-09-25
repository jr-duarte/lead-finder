import { GooglePlaceSource } from "@crawler/sources/google.source"
import { MockPlaceSource } from "@crawler/sources/mock.source"
import { OsmPlaceSource } from "@crawler/sources/osm.source"
import type { PlaceSource } from "@crawler/sources/types"

export type PlaceSourceName = "mock" | "osm" | "google"

export type SourceConfig = {
  source: PlaceSourceName
  overpassEndpoint: string
  userAgent: string
  timeoutMs: number
  googleApiKey?: string
  googleEndpoint?: string
}

const GOOGLE_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"

/**
 * Most results each source can return in one search. Google Places paginates
 * at 60; the others are bounded by our own query.
 */
export const SOURCE_MAX_RESULTS: Record<PlaceSourceName, number> = {
  mock: 500,
  osm: 500,
  google: 60,
}

export function createPlaceSource(config: SourceConfig): PlaceSource {
  if (config.source === "google") {
    return new GooglePlaceSource(
      config.googleApiKey ?? "",
      config.googleEndpoint ?? GOOGLE_ENDPOINT,
      config.timeoutMs
    )
  }

  if (config.source === "osm") {
    return new OsmPlaceSource(
      config.overpassEndpoint,
      config.userAgent,
      config.timeoutMs
    )
  }

  return new MockPlaceSource()
}

export { GooglePlaceSource, MockPlaceSource, OsmPlaceSource }
export type { PlaceSource }
