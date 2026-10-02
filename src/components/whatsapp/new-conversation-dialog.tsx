"use client"

import * as React from "react"
import { AlertCircle, Loader2, MessageSquarePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isWhatsAppOnline, type WhatsAppStatus } from "@/domain/whatsapp"
import {
  useStartConversationWithNumber,
  useWhatsAppStatus,
} from "@/viewmodels/use-whatsapp"

/**
 * Starts a chat with any number, like "new chat" in WhatsApp. The server
 * checks the number has WhatsApp before anything is created.
 */
export function NewConversationDialog({
  open,
  onOpenChange,
  initialPhone = "",
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefilled when the user was searching for a number. */
  initialPhone?: string
  onStarted: (conversationId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted per opening, so every time starts from a clean form. */}
        <NewConversationForm
          initialPhone={initialPhone}
          onCancel={() => onOpenChange(false)}
          onStarted={(id) => {
            onOpenChange(false)
            onStarted(id)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function NewConversationForm({
  initialPhone,
  onCancel,
  onStarted,
}: {
  initialPhone: string
  onCancel: () => void
  onStarted: (conversationId: string) => void
}) {
  const start = useStartConversationWithNumber()
  const status = useWhatsAppStatus().data?.status as WhatsAppStatus | undefined
  const online = status ? isWhatsAppOnline(status) : false

  const [phone, setPhone] = React.useState(initialPhone)
  const [name, setName] = React.useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!phone.trim() || !online) return
    const conversation = await start
      .mutateAsync({ phone, name: name.trim() || undefined })
      // The error is shown in the form.
      .catch(() => null)
    if (conversation) onStarted(conversation.id)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova conversa</DialogTitle>
        <DialogDescription>
          Informe o número com DDD. Para outro país, comece com + e o código do
          país.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="new-conversation-phone">Número</Label>
        <Input
          id="new-conversation-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="(11) 99999-8888"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          disabled={start.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-conversation-name">Nome (opcional)</Label>
        <Input
          id="new-conversation-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Como o contato aparece no CRM"
          disabled={start.isPending}
        />
        <p className="text-muted-foreground text-xs">
          Usado só se o número ainda não for um contato salvo. Se o número for
          de um lead, a conversa é vinculada a ele.
        </p>
      </div>

      {start.error ? (
        <p className="text-destructive flex items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {start.error.message}
        </p>
      ) : !online ? (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Conecte o WhatsApp para iniciar conversas.
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={start.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!online || !phone.trim() || start.isPending}
        >
          {start.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="size-4" />
          )}
          {start.isPending ? "Verificando número..." : "Iniciar conversa"}
        </Button>
      </DialogFooter>
    </form>
  )
}
