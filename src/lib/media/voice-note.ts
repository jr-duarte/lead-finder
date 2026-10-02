import { spawn } from "node:child_process"

import { getEnv } from "@/lib/env"

/**
 * WhatsApp only plays voice notes reliably as mono Ogg/Opus. Browsers record
 * WebM (Chrome, Firefox) or MP4 (Safari), so every outgoing audio goes
 * through ffmpeg first.
 */

async function ffmpegPath(): Promise<string> {
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

export async function toVoiceNote(input: Buffer): Promise<Buffer> {
  const binary = await ffmpegPath()

  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-avoid_negative_ts",
        "make_zero",
        "-f",
        "ogg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
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
      const output = Buffer.concat(chunks)
      if (code === 0 && output.length > 0) resolve(output)
      else {
        reject(
          new Error(
            `Não foi possível converter o áudio${stderr ? `: ${stderr.trim().split("\n").pop()}` : "."}`
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
