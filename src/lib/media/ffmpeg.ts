import { spawn } from "node:child_process"

import { getEnv } from "@/lib/env"

/** The ffmpeg binary: FFMPEG_PATH when set, else the one ffmpeg-static ships. */
export async function ffmpegPath(): Promise<string> {
  const configured = getEnv().FFMPEG_PATH
  if (configured) return configured
  const bundled = (await import("ffmpeg-static")).default as unknown
  if (typeof bundled !== "string" || !bundled) {
    throw new Error(
      "ffmpeg não encontrado. Instale o ffmpeg ou defina FFMPEG_PATH."
    )
  }
  return bundled
}

/**
 * Runs ffmpeg, feeding `input` on stdin when given, and resolves to what it
 * wrote on stdout. Rejects with the last line of stderr, prefixed by
 * `failure` ("Não foi possível converter o áudio").
 */
export async function runFfmpeg(
  args: string[],
  failure: string,
  input?: Buffer
): Promise<Buffer> {
  const binary = await ffmpegPath()

  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      ["-hide_banner", "-loglevel", "error", ...args],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    )

    const chunks: Buffer[] = []
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", (error) =>
      reject(new Error(`Não foi possível rodar o ffmpeg: ${error.message}`))
    )
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else {
        reject(
          new Error(
            `${failure}${stderr ? `: ${stderr.trim().split("\n").pop()}` : "."}`
          )
        )
      }
    })
    // ffmpeg may exit before reading everything (bad input); that surfaces
    // through the exit code, not as an unhandled EPIPE.
    child.stdin.on("error", () => {})
    child.stdin.end(input)
  })
}
