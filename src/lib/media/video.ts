import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { runFfmpeg } from "@/lib/media/ffmpeg"

/**
 * WhatsApp plays videos everywhere only as MP4 with H.264 video and AAC
 * audio. Phones record HEVC (iPhone .mov) or other codecs, so every outgoing
 * video is re-encoded, capped at 720p-ish and with the index up front so it
 * starts playing before it finishes downloading.
 *
 * Files instead of pipes: MP4/MOV often keep their index at the end, which
 * ffmpeg cannot reach on stdin, and `+faststart` needs a seekable output.
 */

const MAX_SIDE = 1280
const THUMBNAIL_WIDTH = 160

export type PreparedVideo = {
  data: Buffer
  mimeType: string
  /** Small JPEG of the first frame, shown while the video downloads. */
  thumbnail?: Buffer
  seconds?: number
}

/**
 * `thumbnail: false` skips the preview frame, for copies that are only
 * stored, never sent.
 */
export async function toWhatsAppVideo(
  input: Buffer,
  { thumbnail: withThumbnail = true }: { thumbnail?: boolean } = {}
): Promise<PreparedVideo> {
  const dir = await mkdtemp(join(tmpdir(), "lead-finder-video-"))
  const source = join(dir, randomUUID())
  const target = join(dir, "out.mp4")

  try {
    await writeFile(source, input)
    await runFfmpeg(
      [
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        `scale='min(${MAX_SIDE},iw)':'min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-profile:v",
        "main",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        "-y",
        target,
      ],
      "Não foi possível converter o vídeo"
    )
    const data = await readFile(target)
    if (data.length === 0)
      throw new Error("Não foi possível converter o vídeo.")

    // The thumbnail is a nicety: the video still goes without it.
    const thumbnail = withThumbnail
      ? await runFfmpeg(
          [
            "-i",
            target,
            "-frames:v",
            "1",
            "-vf",
            `scale=${THUMBNAIL_WIDTH}:-2`,
            "-c:v",
            "mjpeg",
            "-q:v",
            "6",
            "-f",
            "image2",
            "pipe:1",
          ],
          "Não foi possível gerar a miniatura"
        ).catch(() => undefined)
      : undefined

    return {
      data,
      mimeType: "video/mp4",
      thumbnail: thumbnail?.length ? thumbnail : undefined,
      seconds: mp4Seconds(data),
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Length of an MP4, from its movie header box (near the start after faststart). */
export function mp4Seconds(data: Buffer): number | undefined {
  const at = data.indexOf("mvhd")
  if (at < 0 || at + 36 > data.length) return undefined
  const version = data[at + 4]
  const [timescale, duration] =
    version === 1
      ? [data.readUInt32BE(at + 24), Number(data.readBigUInt64BE(at + 28))]
      : [data.readUInt32BE(at + 16), data.readUInt32BE(at + 20)]
  if (!timescale) return undefined
  return Math.round(duration / timescale)
}
