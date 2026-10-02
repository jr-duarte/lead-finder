import { mediaExtension, outgoingMediaKind } from "@/domain/whatsapp"
import { getEnv } from "@/lib/env"
import { optimizeImage } from "@/lib/media/image"
import { toWhatsAppVideo } from "@/lib/media/video"
import { toVoiceNote } from "@/lib/media/voice-note"
import { getMediaStorage, mediaObjectKey } from "@/lib/storage/media-storage"
import { whatsappMessageRepository } from "@/repositories/whatsapp-message.repository"
import type { WaOutgoingMedia } from "@/lib/whatsapp/client"
import type { PendingMedia } from "@/services/whatsapp/ingest.service"

/**
 * Copies message files from WhatsApp into the media bucket. Downloads run a
 * few at a time so a history sync full of photos never floods the network.
 */

const MAX_PARALLEL = 3

/** How long a signed link stays valid; the redirect is cached for less. */
export const MEDIA_URL_TTL_SECONDS = 60 * 60

/** Sniffs the real type of a file, since WhatsApp's mimetype may lie. */
function imageTypeOf(data: Buffer): string | undefined {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg"
  if (data.subarray(0, 4).toString("hex") === "89504e47") return "image/png"
  if (
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp"
  return undefined
}

/**
 * Video encoding is CPU-heavy and already multi-threaded: one at a time, so
 * a history sync full of videos does not stall the server.
 */
let videoQueue: Promise<unknown> = Promise.resolve()

/**
 * Re-encodes a received video for storage, keeping the original when the
 * new copy is not smaller (WhatsApp already compresses most videos) or the
 * conversion fails.
 */
async function compressForStorage(
  data: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string }> {
  const run = videoQueue.then(() => toWhatsAppVideo(data, { thumbnail: false }))
  videoQueue = run.catch(() => {})
  try {
    const video = await run
    return video.data.length < data.length ? video : { data, mimeType }
  } catch (error) {
    console.warn("[whatsapp] vídeo salvo sem compressão", error)
    return { data, mimeType }
  }
}

/** Stores one file. Returns false when it could not be fetched or saved. */
async function storeOne(item: PendingMedia): Promise<boolean> {
  const storage = getMediaStorage()
  if (!storage) return false

  try {
    let data = await item.media.download()
    let mimeType = item.media.mimeType.startsWith("image/")
      ? (imageTypeOf(data) ?? item.media.mimeType)
      : item.media.mimeType
    if (mimeType.startsWith("video/") && !item.media.optimized) {
      ;({ data, mimeType } = await compressForStorage(data, mimeType))
    }
    const storageKey = mediaObjectKey(
      item.conversationId,
      item.whatsappMessageId,
      mediaExtension(mimeType)
    )
    await storage.put(storageKey, data, mimeType)
    await whatsappMessageRepository.setMediaStored(item.whatsappMessageId, {
      storageKey,
      size: data.length,
      mimeType,
    })
    return true
  } catch (error) {
    console.error(
      `[whatsapp] não foi possível salvar a mídia ${item.whatsappMessageId}`,
      error
    )
    await whatsappMessageRepository
      .setMediaFailed(item.whatsappMessageId)
      .catch(() => {})
    return false
  }
}

/**
 * Stores every file and resolves to the conversations whose messages changed
 * (stored or failed), so the inbox can refresh them. A no-op without storage.
 */
export async function storeMedia(items: PendingMedia[]): Promise<string[]> {
  if (items.length === 0 || !getMediaStorage()) return []

  const touched = new Set<string>()
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      await storeOne(item)
      touched.add(item.conversationId)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL, items.length) }, worker)
  )
  return [...touched]
}

/** A temporary link to a message's file, or null when it has none stored. */
export async function mediaSignedUrl(
  messageId: string
): Promise<string | null> {
  const storage = getMediaStorage()
  if (!storage) return null
  const media = await whatsappMessageRepository.findStoredMedia(messageId)
  if (!media) return null
  return storage.signedUrl(media.storageKey, MEDIA_URL_TTL_SECONDS)
}

/** A file the user tried to send that cannot be sent as it is. */
export class MediaInputError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "MediaInputError"
  }
}

/**
 * Turns an uploaded file into something WhatsApp accepts: images are shrunk
 * and recompressed as JPEG, videos re-encoded as MP4 (H.264/AAC), every audio
 * is converted to Ogg/Opus. `voiceNote` marks a recording made in the CRM,
 * sent as a voice message rather than an audio file.
 */
export async function prepareOutgoingMedia(input: {
  data: Buffer
  mimeType: string
  caption?: string
  voiceNote?: boolean
}): Promise<WaOutgoingMedia> {
  const maxMb = getEnv().WHATSAPP_MEDIA_MAX_MB
  if (input.data.length === 0) {
    throw new MediaInputError("O arquivo está vazio.", 422)
  }
  if (input.data.length > maxMb * 1024 * 1024) {
    throw new MediaInputError(`O arquivo passa do limite de ${maxMb} MB.`, 413)
  }

  const kind = outgoingMediaKind(input.mimeType)
  if (kind === "image") {
    let image: { data: Buffer; mimeType: string }
    try {
      image = await optimizeImage(input.data)
    } catch {
      throw new MediaInputError("Não foi possível ler a imagem.", 422)
    }
    return {
      kind,
      ...image,
      caption: input.caption?.trim() || undefined,
    }
  }
  if (kind === "video") {
    try {
      const video = await toWhatsAppVideo(input.data)
      return { kind, ...video, caption: input.caption?.trim() || undefined }
    } catch (error) {
      throw new MediaInputError(
        error instanceof Error ? error.message : "Vídeo inválido.",
        422
      )
    }
  }
  if (kind === "audio") {
    let data: Buffer
    try {
      data = await toVoiceNote(input.data)
    } catch (error) {
      throw new MediaInputError(
        error instanceof Error ? error.message : "Áudio inválido.",
        422
      )
    }
    return {
      kind,
      data,
      mimeType: "audio/ogg; codecs=opus",
      voiceNote: Boolean(input.voiceNote),
    }
  }
  throw new MediaInputError(
    "Envie uma imagem (JPG, PNG ou WebP), um vídeo ou um áudio.",
    415
  )
}
