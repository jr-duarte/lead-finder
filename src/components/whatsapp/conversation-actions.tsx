"use client"

import * as React from "react"
import { Loader2, MoreVertical, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDeleteConversation } from "@/viewmodels/use-whatsapp"

/** The chat header's "⋮" menu. */
export function ConversationActions({
  conversationId,
  title,
  onDeleted,
}: {
  conversationId: string
  title: string
  /** Called once the conversation is gone, e.g. to close the chat. */
  onDeleted?: () => void
}) {
  const remove = useDeleteConversation()
  // Controlled, so the dialog outlives the menu that opened it.
  const [confirming, setConfirming] = React.useState(false)

  const confirm = async () => {
    const deleted = await remove
      .mutateAsync(conversationId)
      .then(() => true)
      .catch(() => false)
    if (!deleted) return
    setConfirming(false)
    onDeleted?.()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0"
            aria-label="Mais opções"
            title="Mais opções"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
            Excluir conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !remove.isPending && setConfirming(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a conversa com {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens e os arquivos desta conversa serão apagados do CRM. O
              contato, o lead e as notas continuam salvos, e nada é apagado no
              seu WhatsApp. Se o contato mandar uma mensagem nova, a conversa
              volta a aparecer, só com as mensagens novas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancelar
            </AlertDialogCancel>
            {/* A plain button: the dialog stays open until the delete ends. */}
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
