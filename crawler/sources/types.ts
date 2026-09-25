/** A raw place as returned by a collection source, before persistence. */
export type RawPlace = {
  externalId: string
  source: string
  name: string
  category?: string
  phone?: string
  website?: string
  rating?: number
  reviewsCount?: number
  /** Whether the place is operational, closed temporarily or for good. */
  businessStatus?: string
  /** Canonical category id from the source, stable across languages. */
  primaryType?: string
  /** Link to the place's own page on the source (Google Maps). */
  mapsUrl?: string
  address: {
    street?: string
    number?: string
    neighborhood?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    formatted?: string
  }
  location: {
    latitude?: number
    longitude?: number
  }
}

export type PlaceSearchInput = {
  category: string
  location: string
  /**
   * Optional. Sources that search by text (Google) derive the area from
   * `location`; sources that search by radius (OSM, mock) require a point and
   * fall back to a default when these are absent.
   */
  latitude?: number
  longitude?: number
  radiusMeters: number
  limit: number
}

export interface PlaceSource {
  readonly name: string
  search(input: PlaceSearchInput): Promise<RawPlace[]>
}
