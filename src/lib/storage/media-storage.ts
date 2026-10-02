import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { getEnv } from "@/lib/env"

/**
 * Where WhatsApp media lives: a private S3 bucket. Objects are never public;
 * the browser gets short-lived signed URLs through the CRM's own route.
 */

export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** A temporary URL the browser can load the object from. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>
}

let client: S3Client | null = null
let override: MediaStorage | null | undefined

function s3(): S3Client {
  if (!client) {
    const env = getEnv()
    client = new S3Client({
      region: env.AWS_REGION,
      ...(env.AWS_S3_ENDPOINT
        ? { endpoint: env.AWS_S3_ENDPOINT, forcePathStyle: true }
        : {}),
    })
  }
  return client
}

const s3Storage: MediaStorage = {
  async put(key, body, contentType) {
    await s3().send(
      new PutObjectCommand({
        Bucket: getEnv().AWS_S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
  },

  signedUrl(key, expiresInSeconds) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: getEnv().AWS_S3_BUCKET, Key: key }),
      { expiresIn: expiresInSeconds }
    )
  },
}

/** The configured storage, or null when no bucket is set. */
export function getMediaStorage(): MediaStorage | null {
  if (override !== undefined) return override
  return getEnv().AWS_S3_BUCKET ? s3Storage : null
}

/** Test seam: swaps the storage; undefined restores the real one. */
export function configureMediaStorage(next: MediaStorage | null | undefined) {
  override = next
}

/** Object key for a message's file, grouped by conversation. */
export function mediaObjectKey(
  conversationId: string,
  whatsappMessageId: string,
  extension: string
): string {
  const prefix = getEnv().AWS_S3_PREFIX
  const safeId = whatsappMessageId.replace(/[^\w-]/g, "_")
  const name = `${conversationId}/${safeId}.${extension}`
  return prefix ? `${prefix}/${name}` : name
}
