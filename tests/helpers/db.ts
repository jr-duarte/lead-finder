import { MongoMemoryServer } from "mongodb-memory-server"

import { connectToDatabase, disconnectFromDatabase } from "@/lib/mongoose"

/**
 * Starts an in-memory MongoDB for one test file.
 *
 * Vitest may run files in the same process, where they would share
 * process.env.MONGODB_URI and the cached Mongoose connection. Giving each file
 * a unique database name keeps them from clobbering one another's data.
 */
export async function startTestDatabase(name: string) {
  const server = await MongoMemoryServer.create()
  const database = `${name}-${process.pid}-${Date.now()}`

  process.env.MONGODB_URI = server.getUri(database)
  await connectToDatabase()

  return {
    async stop() {
      await disconnectFromDatabase()
      await server.stop()
    },
  }
}
