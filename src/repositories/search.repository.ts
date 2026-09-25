import { Types } from "mongoose"

import type {
  Search,
  SearchParams,
  SearchStats,
  SearchStatus,
} from "@/domain/search"
import { connectToDatabase } from "@/lib/mongoose"
import { SearchModel, type SearchDocument } from "@/models/search.model"
import type { Paginated } from "@/repositories/business.repository"

type RawSearch = SearchDocument & {
  _id: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

function toSearch(raw: RawSearch): Search {
  return {
    id: String(raw._id),
    code: raw.code,
    params: {
      category: raw.params.category,
      location: raw.params.location,
      latitude: raw.params.latitude ?? undefined,
      longitude: raw.params.longitude ?? undefined,
      radiusMeters: raw.params.radiusMeters,
      limit: raw.params.limit,
    },
    status: raw.status as SearchStatus,
    stats: {
      found: raw.stats?.found ?? 0,
      created: raw.stats?.created ?? 0,
      updated: raw.stats?.updated ?? 0,
      duplicated: raw.stats?.duplicated ?? 0,
    },
    progress: raw.progress ?? 0,
    source: raw.source ?? "mock",
    error: raw.error ?? undefined,
    startedAt: raw.startedAt ?? undefined,
    finishedAt: raw.finishedAt ?? undefined,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  }
}

export const searchRepository = {
  async create(params: SearchParams, source: string): Promise<Search> {
    await connectToDatabase()

    // Human-friendly sequential code ("Busca #123") independent of ObjectId.
    const last = await SearchModel.findOne()
      .sort({ code: -1 })
      .select("code")
      .lean<{ code: number }>()
      .exec()

    const created = await SearchModel.create({
      code: (last?.code ?? 0) + 1,
      params,
      source,
      status: "PENDING",
    })

    return toSearch(created.toObject() as RawSearch)
  },

  async findById(id: string): Promise<Search | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await SearchModel.findById(id).lean<RawSearch>().exec()
    return raw ? toSearch(raw) : null
  },

  async list(page: number, pageSize: number): Promise<Paginated<Search>> {
    await connectToDatabase()

    const [items, total] = await Promise.all([
      SearchModel.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<RawSearch[]>()
        .exec(),
      SearchModel.countDocuments().exec(),
    ])

    return {
      items: items.map(toSearch),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  },

  async update(
    id: string,
    patch: Partial<{
      status: SearchStatus
      stats: SearchStats
      progress: number
      error: string
      startedAt: Date
      finishedAt: Date
    }>
  ): Promise<Search | null> {
    await connectToDatabase()
    if (!Types.ObjectId.isValid(id)) return null

    const raw = await SearchModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { returnDocument: "after" }
    )
      .lean<RawSearch>()
      .exec()

    return raw ? toSearch(raw) : null
  },

  async count(): Promise<number> {
    await connectToDatabase()
    return SearchModel.countDocuments().exec()
  },

  async recent(limit = 5): Promise<Search[]> {
    await connectToDatabase()
    const raw = await SearchModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<RawSearch[]>()
      .exec()
    return raw.map(toSearch)
  },
}

export { toSearch }
