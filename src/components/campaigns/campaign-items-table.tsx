"use client"

import * as React from "react"
import Link from "next/link"
import {
  Check,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SkipForward,
  Undo2,
} from "lucide-react"

import { CampaignItemStatusBadge } from "@/components/campaigns/campaign-status-badge"
import { Button } from "@/components/ui/button"
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
import type { CampaignItemStatus } from "@/domain/campaign"
import { formatDateTime } from "@/lib/format"
import type { CampaignItemDTO } from "@/types/api"
import {
  useRegenerateCampaignItem,
  useRestoreCampaignItem,
  useUpdateCampaignItem,
} from "@/viewmodels/use-campaigns"
import { whatsappInboxHref } from "@/viewmodels/use-whatsapp"

const EDITABLE: CampaignItemStatus[] = ["READY", "APPROVED", "FAILED"]
const SKIPPABLE: CampaignItemStatus[] = [
  "PENDING",
  "READY",
  "APPROVED",
  "FAILED",
]

function EditMessageDialog({
  item,
  campaignId,
  onClose,
}: {
  item: CampaignItemDTO
  campaignId: string
  onClose: () => void
}) {
  const update = useUpdateCampaignItem(campaignId)
  const [message, setMessage] = React.useState(item.message ?? "")

  const save = async (approve: boolean) => {
    await update.mutateAsync({
      itemId: item.id,
      message,
      ...(approve ? { status: "APPROVED" as const } : {}),
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mensagem para {item.businessName}</DialogTitle>
          <DialogDescription>
            É exatamente o que o lead vai receber no WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={8}
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

function ItemActions({
  item,
  campaignId,
  disabled,
  onEdit,
}: {
  item: CampaignItemDTO
  campaignId: string
  disabled?: boolean
  onEdit: () => void
}) {
  const update = useUpdateCampaignItem(campaignId)
  const regenerate = useRegenerateCampaignItem(campaignId)
  const status = item.status as CampaignItemStatus
  const restore = useRestoreCampaignItem(campaignId)

  if (item.conversationId) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href={whatsappInboxHref(item.conversationId)}>
          <MessageCircle className="size-4" />
          Conversa
        </Link>
      </Button>
    )
  }

  if (status === "SKIPPED" && !disabled) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => restore.mutate(item.id)}
        disabled={restore.isPending}
      >
        <Undo2 className="size-4" />
        Desfazer
      </Button>
    )
  }

  if (disabled || !SKIPPABLE.includes(status)) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Ações para ${item.businessName}`}
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
        {status === "READY" ? (
          <DropdownMenuItem
            onSelect={() =>
              update.mutate({ itemId: item.id, status: "APPROVED" })
            }
          >
            <Check className="size-4" />
            Aprovar
          </DropdownMenuItem>
        ) : null}
        {EDITABLE.includes(status) ? (
          <DropdownMenuItem onSelect={() => regenerate.mutate(item.id)}>
            <RefreshCw className="size-4" />
            Escrever de novo com IA
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => update.mutate({ itemId: item.id, status: "SKIPPED" })}
        >
          <SkipForward className="size-4" />
          Pular este lead
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Every lead of the campaign, in send order, with its message. */
export function CampaignItemsTable({
  campaignId,
  items,
  disabled,
}: {
  campaignId: string
  items: CampaignItemDTO[]
  /** True once the campaign is closed: nothing is editable any more. */
  disabled?: boolean
}) {
  const [editing, setEditing] = React.useState<CampaignItemDTO | null>(null)

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-72">Mensagem</TableHead>
              <TableHead>Enviada</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground tabular">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/businesses/${item.businessId}`}
                    className="font-medium hover:underline"
                  >
                    {item.businessName}
                  </Link>
                </TableCell>
                <TableCell className="space-y-1">
                  <CampaignItemStatusBadge
                    status={item.status as CampaignItemStatus}
                  />
                  {item.reason ? (
                    <p className="text-muted-foreground max-w-56 text-xs">
                      {item.reason}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {item.message ? (
                    <button
                      type="button"
                      onClick={() =>
                        !disabled &&
                        EDITABLE.includes(item.status as CampaignItemStatus) &&
                        setEditing(item)
                      }
                      className="line-clamp-2 max-w-md text-left text-sm whitespace-pre-wrap"
                      title={item.message}
                    >
                      {item.message}
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground tabular text-xs whitespace-nowrap">
                  {item.sentAt ? formatDateTime(item.sentAt) : ""}
                </TableCell>
                <TableCell className="text-right">
                  <ItemActions
                    item={item}
                    campaignId={campaignId}
                    disabled={disabled}
                    onEdit={() => setEditing(item)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing ? (
        <EditMessageDialog
          item={editing}
          campaignId={campaignId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
