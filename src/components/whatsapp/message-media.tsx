"use client"

import { cn } from "cn"
import { ImageOff, Loader2, Mic } from "lucide-react"

import {
  WHATSAPP_MEDIA_PLACEHOLDERS,
  type WhatsAppMessageType,
} from "@/domain/whatsapp"
import type { WhatsAppMessageDTO } from "@/types/api"

/**
 * The file part of a message bubble: the image, video or audio player once the
 * file is stored, a placeholder while it is on its way or when it is gone.
 */
export function MessageMedia({ message }: { message: WhatsAppMessageDTO }) {
  const type = message.type as WhatsAppMessageType
  const placeholder = WHATSAPP_MEDIA_PLACEHOLDERS[type]
  const url = message.mediaUrl

  if (url && (type === "image" || type === "sticker")) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="-mx-1.5 -mt-0.5 mb-1 block"
        title="Abrir imagem"
      >
        {/* Signed S3 links: next/image would proxy and cache them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={message.body || placeholder}
          loading="lazy"
          className={cn(
            "rounded-md object-contain",
            type === "sticker" ? "size-32" : "max-h-80 w-auto max-w-full"
          )}
        />
      </a>
    )
  }

  if (url && type === "video") {
    return (
      <video
        controls
        preload="metadata"
        playsInline
        src={url}
        className="-mx-1.5 -mt-0.5 mb-1 block max-h-80 w-auto max-w-full rounded-md bg-black"
      />
    )
  }

  if (url && type === "audio") {
    return (
      <div className="flex items-center gap-2 py-1">
        {message.media?.voiceNote ? (
          <Mic className="size-4 shrink-0 opacity-70" aria-hidden />
        ) : null}
        <audio
          controls
          preload="metadata"
          src={url}
          className="h-9 w-64 max-w-full"
        />
      </div>
    )
  }

  if (!placeholder) return null

  const status = message.media?.status
  return (
    <p className="flex items-center gap-1.5 italic opacity-80">
      {status === "pending" ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : status === "failed" ? (
        <ImageOff className="size-3.5" aria-hidden />
      ) : null}
      {placeholder}
      {status === "failed" ? " indisponível" : null}
    </p>
  )
}
