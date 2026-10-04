"use client"

import * as React from "react"
import Link from "next/link"
import {
  Bot,
  CheckCheck,
  MessageCircle,
  Repeat,
  ScanSearch,
  ThumbsDown,
  UserCheck,
  WifiOff,
} from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import {
  AutoRepliesList,
  FollowUpTable,
} from "@/components/follow-ups/follow-up-table"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FOLLOW_UP_AFTER_DAYS,
  NO_REPLY_AFTER_DAYS,
  type FollowUpStatus,
} from "@/domain/follow-up"
import { isWhatsAppOnline, type WhatsAppStatus } from "@/domain/whatsapp"
import type { AutoReplyReviewItemDTO, FollowUpDTO } from "@/types/api"
import {
  useAnalyzeAutoReplies,
  useApproveAllFollowUps,
  useAutoReplyReview,
  useFollowUps,
  useMarkFollowUpsLost,
  useResolveAutoReply,
  useScanFollowUps,
} from "@/viewmodels/use-follow-ups"
import { useWhatsAppStatus, whatsappInboxHref } from "@/viewmodels/use-whatsapp"

type Tab = {
  value: string
  label: string
  statuses: FollowUpStatus[]
  empty: string
}

const TABS: Tab[] = [
  {
    value: "review",
    label: "Para aprovar",
    statuses: ["PENDING", "GENERATING", "READY", "FAILED"],
    empty: `Nenhum follow-up para aprovar. Leads em Contatado sem resposta há ${FOLLOW_UP_AFTER_DAYS} dias aparecem aqui.`,
  },
  {
    value: "queue",
    label: "Na fila",
    statuses: ["APPROVED", "SENDING"],
    empty: "Nada na fila de envio.",
  },
  {
    value: "waiting",
    label: "Aguardando resposta",
    statuses: ["SENT"],
    empty: "Nenhum follow-up aguardando resposta.",
  },
  {
    value: "no-reply",
    label: "Sem resposta",
    statuses: ["NO_REPLY"],
    empty: `Nenhum lead sem resposta. Quem não responder ${NO_REPLY_AFTER_DAYS} dias depois do follow-up aparece aqui.`,
  },
  {
    value: "history",
    label: "Histórico",
    statuses: ["REPLIED", "LOST", "CLOSED", "CANCELLED", "SKIPPED"],
    empty: "Nada por aqui ainda.",
  },
]

function TabCount({ value }: { value: number }) {
  if (value === 0) return null
  return (
    <Badge variant="secondary" className="tabular ml-1.5 h-5 px-1.5">
      {value}
    </Badge>
  )
}

function NoReplyTab({ followUps }: { followUps: FollowUpDTO[] }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const lost = useMarkFollowUpsLost()
  // Rows that left the list are no longer selectable.
  const ids = new Set(followUps.map((followUp) => followUp.id))
  const picked = [...selected].filter((id) => ids.has(id))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Não responderam ao follow-up. Mova para Perdido ou mantenha em
          Contatado; nada muda sem você.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={picked.length === 0 || lost.isPending}
          onClick={() =>
            lost.mutate(picked, { onSuccess: () => setSelected(new Set()) })
          }
        >
          <ThumbsDown className="size-4" />
          Mover {picked.length > 0 ? picked.length : ""} para Perdido
        </Button>
      </div>
      <FollowUpTable
        followUps={followUps}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
      />
    </div>
  )
}

function AutoReplyRow({ item }: { item: AutoReplyReviewItemDTO }) {
  const resolve = useResolveAutoReply()
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <Link
            href={`/businesses/${item.businessId}`}
            className="font-medium hover:underline"
          >
            {item.businessName}
          </Link>
          <AutoRepliesList replies={item.autoReplies} />
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          <Button
            size="sm"
            onClick={() =>
              resolve.mutate({
                businessId: item.businessId,
                action: "contacted",
              })
            }
            disabled={resolve.isPending}
          >
            <Repeat className="size-4" />
            Voltar para Contatado
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              resolve.mutate({ businessId: item.businessId, action: "human" })
            }
            disabled={resolve.isPending}
          >
            <UserCheck className="size-4" />É resposta real
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={whatsappInboxHref(item.conversationId)}>
              <MessageCircle className="size-4" />
              Conversa
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AutoRepliesTab() {
  const review = useAutoReplyReview()
  const analyze = useAnalyzeAutoReplies()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Leads em Respondeu que só receberam respostas automáticas. Volte para
          Contatado para que recebam o follow-up.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => analyze.mutate()}
          disabled={analyze.isPending}
        >
          <ScanSearch className="size-4" />
          Analisar de novo
        </Button>
      </div>
      {review.isError ? (
        <ErrorState error={review.error} />
      ) : review.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : review.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="Nenhuma resposta automática para revisar"
            description="Quando um lead for para Respondeu só com uma saudação automática, ele aparece aqui."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {review.data.items.map((item) => (
            <AutoReplyRow key={item.businessId} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FollowUpsView() {
  const followUps = useFollowUps()
  const review = useAutoReplyReview()
  const whatsapp = useWhatsAppStatus()
  const scan = useScanFollowUps()
  const approveAll = useApproveAllFollowUps()

  const counts = followUps.data?.counts
  const count = (statuses: FollowUpStatus[]) =>
    statuses.reduce((sum, status) => sum + (counts?.[status] ?? 0), 0)
  const online = isWhatsAppOnline(
    (whatsapp.data?.status ?? "DISCONNECTED") as WhatsAppStatus
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        description={`Mais uma mensagem para quem está em Contatado e não respondeu em ${FOLLOW_UP_AFTER_DAYS} dias. Nada sai sem a sua aprovação.`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => scan.mutate()}
              disabled={scan.isPending}
            >
              <ScanSearch className="size-4" />
              Procurar agora
            </Button>
            {(counts?.READY ?? 0) > 0 ? (
              <Button
                onClick={() => approveAll.mutate()}
                disabled={approveAll.isPending}
              >
                <CheckCheck className="size-4" />
                Aprovar todos ({counts?.READY})
              </Button>
            ) : null}
          </>
        }
      />

      {!online && count(["APPROVED", "SENDING"]) > 0 ? (
        <Alert>
          <WifiOff className="size-4" />
          <AlertTitle>WhatsApp desconectado</AlertTitle>
          <AlertDescription>
            Os follow-ups aprovados saem quando o WhatsApp estiver conectado.{" "}
            <Link href="/whatsapp" className="underline">
              Conectar
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {followUps.isError ? (
        <ErrorState error={followUps.error} />
      ) : followUps.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="review">
          <div className="overflow-x-auto">
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  {tab.value !== "history" ? (
                    <TabCount value={count(tab.statuses)} />
                  ) : null}
                </TabsTrigger>
              ))}
              <TabsTrigger value="auto-replies">
                Respostas automáticas
                <TabCount value={review.data?.items.length ?? 0} />
              </TabsTrigger>
            </TabsList>
          </div>

          {TABS.map((tab) => {
            const rows = followUps.data.followUps.filter((followUp) =>
              tab.statuses.includes(followUp.status as FollowUpStatus)
            )
            return (
              <TabsContent key={tab.value} value={tab.value} className="pt-4">
                {rows.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={Repeat}
                      title="Nada aqui"
                      description={tab.empty}
                    />
                  </Card>
                ) : tab.value === "no-reply" ? (
                  <NoReplyTab followUps={rows} />
                ) : (
                  <FollowUpTable followUps={rows} />
                )}
              </TabsContent>
            )
          })}

          <TabsContent value="auto-replies" className="pt-4">
            <AutoRepliesTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
