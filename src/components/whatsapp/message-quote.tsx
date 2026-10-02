"use client"

import { cn } from "cn"

import { quotePreview, type WhatsAppQuote } from "@/domain/whatsapp"

/**
 * The quoted message as WhatsApp shows it: a colored bar, who wrote it and
 * one or two lines of it. Used inside reply bubbles and above the composer.
 */
export function MessageQuote({
  quote,
  contactName,
  onBubble,
  onClick,
  className,
}: {
  quote: Pick<WhatsAppQuote, "fromMe" | "type" | "body">
  contactName: string
  /** Which bubble it sits in, so it stays readable on either color. */
  onBubble?: "mine" | "theirs"
  onClick?: () => void
  className?: string
}) {
  const content = (
    <>
      <span
        className={cn(
          "block truncate text-xs font-semibold",
          onBubble === "mine"
            ? "text-primary-foreground"
            : quote.fromMe
              ? "text-primary"
              : "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {quote.fromMe ? "Você" : contactName}
      </span>
      <span
        className={cn(
          "line-clamp-2 text-xs wrap-break-word",
          onBubble === "mine"
            ? "text-primary-foreground/80"
            : "text-muted-foreground"
        )}
      >
        {quotePreview(quote) || "Mensagem"}
      </span>
    </>
  )

  const classes = cn(
    "block w-full min-w-0 rounded-md border-l-4 px-2 py-1 text-left",
    onBubble === "mine"
      ? "border-primary-foreground/70 bg-primary-foreground/15"
      : quote.fromMe
        ? "border-primary bg-background/70"
        : "border-emerald-500 bg-background/70",
    className
  )

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(classes, "cursor-pointer hover:opacity-90")}
      title="Ir para a mensagem"
    >
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  )
}
