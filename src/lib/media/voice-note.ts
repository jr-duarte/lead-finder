import { runFfmpeg } from "@/lib/media/ffmpeg"

/**
 * WhatsApp only plays voice notes reliably as mono Ogg/Opus. Browsers record
 * WebM (Chrome, Firefox) or MP4 (Safari), so every outgoing audio goes
 * through ffmpeg first.
 */
export async function toVoiceNote(input: Buffer): Promise<Buffer> {
  const output = await runFfmpeg(
    [
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
    "Não foi possível converter o áudio",
    input
  )
  if (output.length === 0)
    throw new Error("Não foi possível converter o áudio.")
  return output
}
