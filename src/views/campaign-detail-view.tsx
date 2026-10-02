"use client"

import Link from "next/link"
import {
  ArrowLeft,
  CheckCheck,
  Clock,
  Pause,
  Play,
  RotateCcw,
  WifiOff,
  XCircle,
} from "lucide-react"

import { CampaignItemsTable } from "@/components/campaigns/campaign-items-table"
import { CampaignSettingsCard } from "@/components/campaigns/campaign-settings-card"
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge"
import { ErrorState } from "@/components/common/error-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { isCampaignOpen, type CampaignStatus } from "@/domain/campaign"
import { isWhatsAppOnline, type WhatsAppStatus } from "@/domain/whatsapp"
import { formatDateTime } from "@/lib/format"
import type { CampaignDTO } from "@/types/api"
import { useCampaign, useCampaignAction } from "@/viewmodels/use-campaigns"
import { useWhatsAppStatus } from "@/viewmodels/use-whatsapp"

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="tabular text-xl font-semibold">{value}</p>
    </div>
  )
}

/** What happens next, in one line: next send, why it waits, why it paused. */
function NextStep({ campaign }: { campaign: CampaignDTO }) {
  const status = campaign.status as CampaignStatus
  if (status === "PAUSED") {
    return (
      <p className="text-warning flex items-center gap-2 text-sm">
        <Pause className="size-4" />
        {campaign.pauseReason ?? "Pausada."}
      </p>
    )
  }
  if (status !== "RUNNING") return null
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <Clock className="size-4" />
      {campaign.waitReason ??
        (campaign.nextSendAt
          ? `Próximo envio por volta de ${formatDateTime(campaign.nextSendAt)}.`
          : "Preparando o próximo envio.")}
    </p>
  )
}

function Actions({ campaign }: { campaign: CampaignDTO }) {
  const status = campaign.status as CampaignStatus
  const { counts } = campaign
  const approveAll = useCampaignAction(
    campaign.id,
    "approve-all",
    "Mensagens aprovadas."
  )
  const start = useCampaignAction(campaign.id, "start", "Envio iniciado.")
  const pause = useCampaignAction(campaign.id, "pause", "Campanha pausada.")
  const cancel = useCampaignAction(campaign.id, "cancel", "Campanha cancelada.")
  const retry = useCampaignAction(
    campaign.id,
    "retry-failed",
    "Leads com falha voltaram para a fila."
  )

  if (!isCampaignOpen(status)) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {counts.READY > 0 ? (
        <Button
          variant={status === "RUNNING" ? "outline" : "default"}
          onClick={() => approveAll.mutate()}
          disabled={approveAll.isPending}
        >
          <CheckCheck className="size-4" />
          Aprovar todas ({counts.READY})
        </Button>
      ) : null}

      {status === "RUNNING" ? (
        <Button
          variant="outline"
          onClick={() => pause.mutate()}
          disabled={pause.isPending}
        >
          <Pause className="size-4" />
          Pausar
        </Button>
      ) : (
        <Button
          onClick={() => start.mutate()}
          disabled={start.isPending || counts.APPROVED + counts.READY === 0}
        >
          <Play className="size-4" />
          {status === "PAUSED" ? "Retomar envio" : "Iniciar envio"}
        </Button>
      )}

      {counts.FAILED > 0 ? (
        <Button
          variant="outline"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
        >
          <RotateCcw className="size-4" />
          Tentar de novo ({counts.FAILED})
        </Button>
      ) : null}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" disabled={cancel.isPending}>
            <XCircle className="size-4" />
            Cancelar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Nada mais será enviado. Os leads que ainda não receberam mensagem
              ficam livres para outra campanha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancel.mutate()}>
              Cancelar campanha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function CampaignDetailView({ id }: { id: string }) {
  const detail = useCampaign(id)
  const whatsapp = useWhatsAppStatus()

  if (detail.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorState error={detail.error} />
      </div>
    )
  }
  if (detail.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const { campaign, items, dailyLimit } = detail.data
  const status = campaign.status as CampaignStatus
  const open = isCampaignOpen(status)
  const { counts } = campaign
  const contactable = items.length - counts.SKIPPED - counts.INELIGIBLE
  const done = counts.SENT + counts.REPLIED
  const online = isWhatsAppOnline(
    (whatsapp.data?.status ?? "DISCONNECTED") as WhatsAppStatus
  )

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {campaign.name}
                </h1>
                <CampaignStatusBadge status={status} />
              </div>
              <p className="text-muted-foreground text-sm">
                Limite da conta: {dailyLimit} primeiros contatos por dia,
                somando todas as campanhas.
              </p>
            </div>
            <Actions campaign={campaign} />
          </div>

          {contactable > 0 ? (
            <div className="space-y-1.5">
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>
                  {done} de {contactable} contatados
                </span>
                <span>{counts.REPLIED} responderam</span>
              </div>
              <Progress value={(done / contactable) * 100} />
            </div>
          ) : null}

          <NextStep campaign={campaign} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Counter
              label="Gerando"
              value={counts.PENDING + counts.GENERATING}
            />
            <Counter label="A aprovar" value={counts.READY} />
            <Counter label="Na fila" value={counts.APPROVED + counts.SENDING} />
            {/* Replied leads were sent a message too. */}
            <Counter label="Enviadas" value={counts.SENT + counts.REPLIED} />
            <Counter label="Responderam" value={counts.REPLIED} />
            <Counter
              label="Fora / falhas"
              value={counts.SKIPPED + counts.INELIGIBLE + counts.FAILED}
            />
          </div>
        </CardContent>
      </Card>

      {open ? (
        online ? (
          <p className="text-muted-foreground text-sm">
            A fila só anda com o CRM aberto. Se ele estiver fechado no horário
            de um envio, a fila continua quando você abrir, sem mandar tudo de
            uma vez.
          </p>
        ) : (
          <Alert>
            <WifiOff className="size-4" />
            <AlertTitle>WhatsApp desconectado</AlertTitle>
            <AlertDescription>
              Nada é enviado enquanto o WhatsApp não estiver conectado.{" "}
              <Link href="/whatsapp" className="underline">
                Conectar
              </Link>
            </AlertDescription>
          </Alert>
        )
      ) : null}

      <CampaignSettingsCard
        // Resets only when the saved settings change, never mid-edit while
        // the page refreshes during sending.
        key={`${campaign.intervalMinutes}|${campaign.window.days.join()}|${campaign.window.startHour}|${campaign.window.endHour}|${campaign.startAt ?? ""}`}
        campaign={campaign}
        disabled={!open}
      />

      <CampaignItemsTable
        campaignId={campaign.id}
        items={items}
        disabled={!open}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link href="/campaigns">
        <ArrowLeft className="size-4" />
        Voltar para campanhas
      </Link>
    </Button>
  )
}
