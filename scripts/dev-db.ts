/**
 * Starts a disposable in-memory MongoDB on a fixed port, for trying the app
 * without installing MongoDB locally. Data is lost when the process exits.
 */
import { MongoMemoryServer } from "mongodb-memory-server"

const PORT = Number(process.env.DEV_DB_PORT ?? 27017)

async function main(): Promise<void> {
  const server = await MongoMemoryServer.create({
    instance: { port: PORT, dbName: "lead-finder" },
  })

  console.log(`[dev-db] MongoDB em memória rodando em ${server.getUri()}`)
  console.log("[dev-db] Ctrl+C para encerrar.")

  const stop = async () => {
    await server.stop()
    process.exit(0)
  }

  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}

main().catch((error) => {
  console.error("[dev-db] falhou:", error)
  process.exit(1)
})
