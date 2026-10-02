"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/format"
import type { BusinessDTO } from "@/types/api"
import {
  useGenerateApproach,
  useIsGeneratingApproach,
} from "@/viewmodels/use-businesses"
import {
  useStartConversation,
  whatsappInboxHref,
} from "@/viewmodels/use-whatsapp"

/** wa.me wants the full international number, digits only. */
function whatsappNumber(business: BusinessDTO): string | undefined {
  const raw = business.enrichment?.socials?.whatsapp ?? business.phone
  const digits = raw?.replace(/\D/g, "")
  if (!digits) return undefined
  return digits.length <= 11 ? `55${digits}` : digits
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Não foi possível copiar.")
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  )
}

function Block({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-1">
          {action}
          <CopyButton text={text} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </CardContent>
    </Card>
  )
}

/**
 * Opens the lead's conversation in the CRM inbox with the approach already
 * typed in. Nothing is sent until the user reviews it and presses send.
 */
function SendViaCrmButton({
  businessId,
  text,
}: {
  businessId: string
  text: string
}) {
  const router = useRouter()
  const start = useStartConversation()

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={start.isPending}
      onClick={async () => {
        const conversation = await start.mutateAsync(businessId)
        router.push(whatsappInboxHref(conversation.id, text))
      }}
    >
      {start.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <MessageCircle className="size-4" />
      )}
      Enviar pelo CRM
    </Button>
  )
}

export function LeadApproachPanel({ business }: { business: BusinessDTO }) {
  const generate = useGenerateApproach(business.id)
  const isGenerating = useIsGeneratingApproach(business.id)
  const approach = business.approach

  if (isGenerating) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          O Claude está analisando o lead e escrevendo a abordagem. Isso leva de
          1 a 2 minutos.
        </p>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!approach) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abordagem com IA</CardTitle>
          <CardDescription>
            O Claude lê tudo o que o app sabe sobre este lead (avaliações, site,
            redes, dados da Receita e anotações) e escreve mensagens de
            WhatsApp, e-mail e um roteiro de ligação com base no que você
            oferece.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={() => generate.mutate()}>
            <Sparkles className="size-4" />
            Gerar abordagem
          </Button>
          <Button variant="link" asChild className="px-0">
            <Link href="/settings">Configurar o que eu ofereço</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const phone = whatsappNumber(business)
  const email = business.enrichment?.emails?.[0] ?? business.registry?.email

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Diagnóstico</CardTitle>
            <CardDescription className="tabular">
              Gerada em {formatDateTime(approach.generatedAt)}
              {approach.model ? ` com ${approach.model}` : ""}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => generate.mutate()}>
            <RefreshCw className="size-4" />
            Gerar novamente
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{approach.diagnosis}</p>
          <p className="bg-muted rounded-md px-3 py-2 text-sm">
            <span className="font-medium">Gancho: </span>
            {approach.hook}
          </p>
        </CardContent>
      </Card>

      <Block
        title="WhatsApp"
        text={approach.whatsapp}
        action={
          phone ? (
            <>
              <SendViaCrmButton
                businessId={business.id}
                text={approach.whatsapp}
              />
              <Button variant="ghost" size="sm" asChild>
                <a
                  href={`https://wa.me/${phone}?text=${encodeURIComponent(approach.whatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Abrir
                </a>
              </Button>
            </>
          ) : null
        }
      />

      <Block
        title="E-mail"
        text={`Assunto: ${approach.emailSubject}\n\n${approach.emailBody}`}
        action={
          email ? (
            <Button variant="ghost" size="sm" asChild>
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(approach.emailSubject)}&body=${encodeURIComponent(approach.emailBody)}`}
              >
                <ExternalLink className="size-4" />
                Abrir
              </a>
            </Button>
          ) : null
        }
      />

      <Block title="Roteiro de ligação" text={approach.callScript} />
      <Block title="Follow-up" text={approach.followUp} />

      {approach.objections.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Objeções prováveis</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {approach.objections.map((item) => (
                <div key={item.objection} className="space-y-1">
                  <dt className="text-sm font-medium">“{item.objection}”</dt>
                  <dd className="text-muted-foreground text-sm leading-relaxed">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
