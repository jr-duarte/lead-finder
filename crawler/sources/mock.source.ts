import { normalizePlace } from "@crawler/parsers/place.parser"
import type {
  PlaceSearchInput,
  PlaceSource,
  RawPlace,
} from "@crawler/sources/types"

/**
 * Deterministic offline source. Generates plausible establishments around the
 * requested coordinates so the whole pipeline is exercisable without network
 * access or paid API keys.
 *
 * Roughly 40% of generated places intentionally have no website, which is the
 * segment the product targets.
 */

const STREETS = [
  "Rua das Palmeiras",
  "Avenida Paulista",
  "Rua Sete de Setembro",
  "Avenida Brasil",
  "Rua XV de Novembro",
  "Alameda Santos",
  "Rua do Comércio",
  "Avenida Getúlio Vargas",
]

const NEIGHBORHOODS = [
  "Centro",
  "Jardim América",
  "Vila Nova",
  "Bela Vista",
  "Santa Cecília",
  "Moema",
  "Pinheiros",
]

const SUFFIXES = [
  "Silva",
  "Oliveira",
  "Santos",
  "Souza",
  "Pereira",
  "Costa",
  "Almeida",
  "Ribeiro",
  "Martins",
  "Carvalho",
  "Gomes",
  "Barbosa",
]

const PREFIXES = ["", "Casa ", "Espaço ", "Grupo ", "Studio ", "Center "]

/** Mulberry32: small deterministic PRNG so runs are reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(random: () => number, list: T[]): T {
  return list[Math.floor(random() * list.length)]
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export class MockPlaceSource implements PlaceSource {
  readonly name = "mock"

  async search(input: PlaceSearchInput): Promise<RawPlace[]> {
    // Coordinates are optional for text-based sources; the generator needs a
    // centre, so it falls back to São Paulo.
    const latitude = input.latitude ?? -23.5505
    const longitude = input.longitude ?? -46.6333

    const seed = hashString(
      `${input.category}|${input.location}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`
    )
    const random = createRandom(seed)
    const places: RawPlace[] = []

    // Convert the radius to a degree delta (~111km per degree of latitude).
    const delta = input.radiusMeters / 111_000

    const [city, state] = input.location.split(",").map((part) => part.trim())

    for (let index = 0; index < input.limit; index += 1) {
      const name = `${pick(random, PREFIXES)}${input.category} ${pick(random, SUFFIXES)}`
      const slug = slugify(name)
      const externalId = `mock-${seed.toString(36)}-${index}`

      const hasWebsite = random() > 0.4
      const hasPhone = random() > 0.15
      const hasRating = random() > 0.2

      places.push({
        externalId,
        source: this.name,
        name,
        category: input.category,
        phone: hasPhone
          ? `+55${Math.floor(10 + random() * 89)}9${Math.floor(10_000_000 + random() * 89_999_999)}`
          : undefined,
        website: hasWebsite ? `https://www.${slug}.com.br` : undefined,
        rating: hasRating ? 3 + random() * 2 : undefined,
        reviewsCount: hasRating ? Math.floor(random() * 900) : 0,
        address: {
          street: pick(random, STREETS),
          number: String(Math.floor(10 + random() * 1990)),
          neighborhood: pick(random, NEIGHBORHOODS),
          city: city || input.location,
          state: state || "SP",
          postalCode: `${Math.floor(10000 + random() * 89999)}-${Math.floor(100 + random() * 899)}`,
          country: "BR",
        },
        location: {
          latitude: latitude + (random() - 0.5) * delta * 2,
          longitude: longitude + (random() - 0.5) * delta * 2,
        },
      })
    }

    return places.map(normalizePlace)
  }
}
