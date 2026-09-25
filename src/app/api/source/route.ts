import { NextResponse } from "next/server"

import { apiError } from "@/lib/api"
import { getEnv } from "@/lib/env"
import { SOURCE_MAX_RESULTS, type PlaceSourceName } from "@crawler/sources"

export const dynamic = "force-dynamic"

const LABELS: Record<PlaceSourceName, string> = {
  mock: "Gerador local (offline)",
  osm: "OpenStreetMap",
  google: "Google Places",
}

/**
 * Describes the configured collection source so the search form can validate
 * against limits the source actually honours.
 */
export async function GET() {
  try {
    const source = getEnv().PLACES_SOURCE as PlaceSourceName

    return NextResponse.json({
      source,
      label: LABELS[source],
      maxResults: SOURCE_MAX_RESULTS[source],
      /** Only radius-based sources need coordinates. */
      requiresCoordinates: source === "osm",
      hasRatings: source !== "osm",
    })
  } catch (error) {
    return apiError(error)
  }
}
