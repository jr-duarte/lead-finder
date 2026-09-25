import { Types } from "mongoose"

import { computeProgress } from "@/domain/search"
import { connectToDatabase } from "@/lib/mongoose"
import { BusinessModel } from "@/models/business.model"
import { searchRepository } from "@/repositories/search.repository"
import { createPlaceSource, type SourceConfig } from "@crawler/sources"
import type { PlaceSearchInput, RawPlace } from "@crawler/sources/types"

export type CollectResult = {
  found: number
  created: number
  updated: number
  duplicated: number
}

/**
 * Persists every place found, regardless of whether it has a website
 * (requirement 13). Identity is (source, externalId); re-collecting the same
 * place updates it and is reported as "updated".
 */
export async function persistPlaces(
  places: RawPlace[],
  searchId: string
): Promise<CollectResult> {
  await connectToDatabase()

  const result: CollectResult = {
    found: places.length,
    created: 0,
    updated: 0,
    duplicated: 0,
  }

  const seen = new Set<string>()
  const searchObjectId = Types.ObjectId.isValid(searchId)
    ? new Types.ObjectId(searchId)
    : undefined

  for (const place of places) {
    const key = `${place.source}:${place.externalId}`

    // Duplicates inside the same payload are counted, not written twice.
    if (seen.has(key)) {
      result.duplicated += 1
      continue
    }
    seen.add(key)

    const existing = await BusinessModel.findOne({
      source: place.source,
      externalId: place.externalId,
    })
      .select("_id")
      .lean<{ _id: Types.ObjectId }>()
      .exec()

    const update = {
      $set: {
        source: place.source,
        externalId: place.externalId,
        name: place.name,
        category: place.category,
        phone: place.phone,
        website: place.website,
        rating: place.rating,
        reviewsCount: place.reviewsCount,
        operationalStatus: place.businessStatus,
        primaryType: place.primaryType,
        mapsUrl: place.mapsUrl,
        address: place.address,
        location: place.location,
      },
      $setOnInsert: {
        collectedAt: new Date(),
        status: "NEW" as const,
      },
      ...(searchObjectId ? { $addToSet: { searchIds: searchObjectId } } : {}),
    }

    await BusinessModel.updateOne(
      { source: place.source, externalId: place.externalId },
      update,
      { upsert: true }
    ).exec()

    if (existing) {
      result.updated += 1
    } else {
      result.created += 1
    }
  }

  return result
}

/**
 * Runs a search end to end, keeping the Search document in sync so the UI can
 * poll progress.
 */
export async function runCollectSearch(
  searchId: string,
  input: PlaceSearchInput,
  config: SourceConfig
): Promise<CollectResult> {
  await searchRepository.update(searchId, {
    status: "RUNNING",
    startedAt: new Date(),
    progress: 0,
  })

  try {
    const source = createPlaceSource(config)
    const places = await source.search(input)

    const current = await searchRepository.findById(searchId)
    if (current?.status === "CANCELLED") {
      return { found: 0, created: 0, updated: 0, duplicated: 0 }
    }

    const stats = await persistPlaces(places, searchId)

    await searchRepository.update(searchId, {
      status: "COMPLETED",
      stats,
      progress: computeProgress(stats.found, input.limit) || 100,
      finishedAt: new Date(),
    })

    return stats
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido na coleta"

    await searchRepository.update(searchId, {
      status: "FAILED",
      error: message,
      finishedAt: new Date(),
    })

    throw error
  }
}
