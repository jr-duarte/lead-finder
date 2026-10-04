"use client"

import * as React from "react"
import Link from "next/link"
import {
  Archive,
  Bot,
  Check,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SkipForward,
  ThumbsDown,
  Undo2,
} from "lucide-react"

import { FollowUpStatusBadge } from "@/components/follow-ups/follow-up-status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { FollowUpStatus } from "@/domain/follow-up"
import { formatDateTime } from "@/lib/format"
import type { FollowUpDTO } from "@/types/api"
import {
  useKeepFollowUp,
  useMarkFollowUpsLost,
  useRegenerateFollowUp,
  useRestoreFollowUp,
  useUpdateFollowUp,
} from "@/viewmodels/use-follow-ups"
import { whatsappInboxHref } from "@/viewmodels/use-whatsapp"

const EDITABLE: FollowUpStatus[] = ["READY", "APPROVED", "FAILED"]
const SKIPPABLE: FollowUpStatus[] = ["PENDING", "READY", "APPROVED", "FAILED"]

function EditMessageDialog({
  followUp,
  onClose,
}: {
  followUp: FollowUpDTO
  onClose: () => void
}) {
  const update = useUpdateFollowUp()
  const [message, setMessage] = React.useState(followUp.message ?? "")

  const save = async (approve: boolean) => {
    await update.mutateAsync({
      id: followUp.id,
      message,
      ...(approve ? { status: "APPROVED" as const } : {}),
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow-up para {followUp.businessName}</DialogTitle>
          <DialogDescription>
            É exatamente o que o lead vai receber no WhatsApp.
          </DialogDescription>
        </DialogHeader>
        {followUp.autoReplies.length > 0 ? (
          <AutoRepliesList replies={followUp.autoReplies} />
        ) : null}
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          aria-label="Mensagem"
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => save(false)}
            disabled={!message.trim() || update.isPending}
          >
            Salvar
          </Button>
          <Button
            onClick={() => save(true)}
            disabled={!message.trim() || update.isPending}
          >
            <Check className="size-4" />
            Salvar e aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The automatic replies the lead's number sent, quoted for the user. */
export function AutoRepliesList({ replies }: { replies: string[] }) {
  return (
    <div className="bg-muted/50 space-y-1 rounded-md border p-3">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Bot className="size-3.5" />
        Resposta automática do lead
      </p>
      {replies.map((reply, index) => (
        <p key={index} className="line-clamp-4 text-sm whitespace-pre-wrap">
          {reply}
        </p>
      ))}
    </div>
  )
}

function AutoReplyBadge({ replies }: { replies: string[] }) {
  if (replies.length === 0) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Bot className="size-3" />
          Resposta automática
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap">
        {replies.join("\n\n")}
      </TooltipContent>
    </Tooltip>
  )
}

function RowActions({
  followUp,
  onEdit,
}: {
  followUp: FollowUpDTO
  onEdit: () => void
}) {
  const update = useUpdateFollowUp()
  const regenerate = useRegenerateFollowUp()
  const restore = useRestoreFollowUp()
  const lost = useMarkFollowUpsLost()
  const keep = useKeepFollowUp()
  const status = followUp.status as FollowUpStatus

  if (status === "NO_REPLY") {
    return (
      <div className="flex justify-end gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => lost.mutate([followUp.id])}
          disabled={lost.isPending}
        >
          <ThumbsDown className="size-4" />
          Mover para Perdido
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Manter ${followUp.businessName} em Contatado`}
              onClick={() => keep.mutate(followUp.id)}
              disabled={keep.isPending}
            >
              <Archive className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Manter em Contatado</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  if (status === "SKIPPED") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => restore.mutate(followUp.id)}
        disabled={restore.isPending}
      >
        <Undo2 className="size-4" />
        Desfazer
      </Button>
    )
  }

  if (!SKIPPABLE.includes(status)) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href={whatsappInboxHref(followUp.conversationId)}>
          <MessageCircle className="size-4" />
          Conversa
        </Link>
      </Button>
    )
  }

  return (
    <div className="flex justify-end gap-1">
      {status === "READY" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => update.mutate({ id: followUp.id, status: "APPROVED" })}
          disabled={update.isPending}
        >
          <Check className="size-4" />
          Aprovar
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Ações para ${followUp.businessName}`}
            disabled={regenerate.isPending}
          >
            {regenerate.isPending ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {EDITABLE.includes(status) ? (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" />
              Editar mensagem
            </DropdownMenuItem>
          ) : null}
          {EDITABLE.includes(status) ? (
            <DropdownMenuItem onSelect={() => regenerate.mutate(followUp.id)}>
              <RefreshCw className="size-4" />
              Escrever de novo com IA
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={whatsappInboxHref(followUp.conversationId)}>
              <MessageCircle className="size-4" />
              Abrir conversa
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              update.mutate({ id: followUp.id, status: "SKIPPED" })
            }
          >
            <SkipForward className="size-4" />
            Pular este lead
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The moment that matters for each status: sent, or last contact. */
function whenLabel(followUp: FollowUpDTO): string {
  if (followUp.sentAt) return `Enviado ${formatDateTime(followUp.sentAt)}`
  return `Último contato ${formatDateTime(followUp.anchorAt)}`
}

/** Follow-ups with their message, status and actions. */
export function FollowUpTable({
  followUps,
  selectable,
  selected,
  onSelectedChange,
}: {
  followUps: FollowUpDTO[]
  /** Rows can be ticked, for "Mover para Perdido" in bulk. */
  selectable?: boolean
  selected?: Set<string>
  onSelectedChange?: (next: Set<string>) => void
}) {
  const [editing, setEditing] = React.useState<FollowUpDTO | null>(null)

  const allSelected =
    selectable &&
    followUps.length > 0 &&
    followUps.every((followUp) => selected?.has(followUp.id))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    onSelectedChange?.(next)
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(on) =>
                      onSelectedChange?.(
                        on
                          ? new Set(followUps.map((followUp) => followUp.id))
                          : new Set()
                      )
                    }
                    aria-label="Selecionar todos"
                  />
                </TableHead>
              ) : null}
              <TableHead>Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-72">Mensagem</TableHead>
              <TableHead>Quando</TableHead>
              <TableHead className="w-44 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {followUps.map((followUp) => {
              const status = followUp.status as FollowUpStatus
              const editable = EDITABLE.includes(status)
              return (
                <TableRow key={followUp.id}>
                  {selectable ? (
                    <TableCell>
                      <Checkbox
                        checked={selected?.has(followUp.id) ?? false}
                        onCheckedChange={(on) =>
                          toggle(followUp.id, on === true)
                        }
                        aria-label={`Selecionar ${followUp.businessName}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="space-y-1">
                    <Link
                      href={`/businesses/${followUp.businessId}`}
                      className="block font-medium hover:underline"
                    >
                      {followUp.businessName}
                    </Link>
                    {followUp.campaignName ? (
                      <p className="text-muted-foreground text-xs">
                        {followUp.campaignId ? (
                          <Link
                            href={`/campaigns/${followUp.campaignId}`}
                            className="hover:underline"
                          >
                            {followUp.campaignName}
                          </Link>
                        ) : (
                          followUp.campaignName
                        )}
                      </p>
                    ) : null}
                    <AutoReplyBadge replies={followUp.autoReplies} />
                  </TableCell>
                  <TableCell className="space-y-1">
                    <FollowUpStatusBadge status={status} />
                    {followUp.reason ? (
                      <p className="text-muted-foreground max-w-56 text-xs">
                        {followUp.reason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {followUp.message ? (
                      <button
                        type="button"
                        onClick={() => editable && setEditing(followUp)}
                        className="line-clamp-3 max-w-md text-left text-sm whitespace-pre-wrap"
                        title={followUp.message}
                      >
                        {followUp.message}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {status === "PENDING" || status === "GENERATING"
                          ? "Escrevendo…"
                          : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular text-xs whitespace-nowrap">
                    {whenLabel(followUp)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      followUp={followUp}
                      onEdit={() => setEditing(followUp)}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {editing ? (
        <EditMessageDialog
          followUp={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
