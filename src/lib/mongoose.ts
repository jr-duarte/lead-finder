import mongoose, { type Mongoose } from "mongoose"

import { getEnv } from "@/lib/env"

/**
 * Next.js dev mode reloads modules on every change, so the connection is
 * cached on globalThis to avoid exhausting the MongoDB connection pool.
 */
type MongooseCache = {
  conn: Mongoose | null
  promise: Promise<Mongoose> | null
}

const globalForMongoose = globalThis as typeof globalThis & {
  __leadFinderMongoose?: MongooseCache
}

const cache: MongooseCache = globalForMongoose.__leadFinderMongoose ?? {
  conn: null,
  promise: null,
}

globalForMongoose.__leadFinderMongoose = cache

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) {
    return cache.conn
  }

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI ?? getEnv().MONGODB_URI

    mongoose.set("strictQuery", true)

    cache.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    })
  }

  try {
    cache.conn = await cache.promise
  } catch (error) {
    cache.promise = null
    throw error
  }

  return cache.conn
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.conn) {
    await cache.conn.disconnect()
    cache.conn = null
    cache.promise = null
  }
}
