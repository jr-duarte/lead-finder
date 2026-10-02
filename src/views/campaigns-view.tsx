"use client"

import Link from "next/link"
import { Megaphone } from "lucide-react"

import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { CampaignStatus } from "@/domain/campaign"
import { formatDateTime } from "@/lib/format"
import type { CampaignDTO } from "@/types/api"
import { useCampaigns } from "@/viewmodels/use-campaigns"

function total(campaign: CampaignDTO): number {
  return Object.values(campaign.counts).reduce((sum, value) => sum + value, 0)
}

function CampaignRow({ campaign }: { campaign: CampaignDTO }) {
  const { counts } = campaign
  const sent = counts.SENT + counts.REPLIED
  const queued = counts.APPROVED + counts.SENDING
  const waiting = counts.PENDING + counts.GENERATING + counts.READY

  return (
    <Link href={`/campaigns/${campaign.id}`} className="block">
      <Card className="hover:bg-muted/40 py-4 transition-colors">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{campaign.name}</span>
              <CampaignStatusBadge status={campaign.status as CampaignStatus} />
            </div>
            <p className="text-muted-foreground text-xs">
              {total(campaign)} leads · a cada {campaign.intervalMinutes} min ·
              criada em {formatDateTime(campaign.createdAt)}
            </p>
          </div>
          <div className="text-muted-foreground tabular flex gap-4 text-sm">
            <span>
              <strong className="text-foreground">{sent}</strong> enviadas
            </span>
            <span>
              <strong className="text-foreground">{counts.REPLIED}</strong>{" "}
              responderam
            </span>
            {queued > 0 ? <span>{queued} na fila</span> : null}
            {waiting > 0 ? <span>{waiting} a revisar</span> : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export function CampaignsView() {
  const campaigns = useCampaigns()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        description="Primeiro contato com leads novos pelo WhatsApp, um por vez, no ritmo que você escolher."
      />

      {campaigns.isError ? (
        <ErrorState error={campaigns.error} />
      ) : campaigns.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : campaigns.data.campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha ainda"
            description="Selecione leads na página Empresas, ou abra um lead, e use “Adicionar à campanha”."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.data.campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  )
}
