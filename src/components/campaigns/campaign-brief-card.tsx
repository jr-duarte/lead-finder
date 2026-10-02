"use client"

import * as React from "react"
import { RefreshCw, Save } from "lucide-react"

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { CampaignDTO } from "@/types/api"
import {
  useCampaignAction,
  useUpdateCampaign,
} from "@/viewmodels/use-campaigns"

export const BRIEF_PLACEHOLDER =
  "Ex.: Dentistas sem site. Puxe pelo número de avaliações no Google e diga que um site simples ajudaria quem pesquisa a marcar consulta. Nada de preço na primeira mensagem."

/**
 * The campaign's angle, sent to Claude with every lead, and the button that
 * writes the unsent messages again after it changes.
 */
export function CampaignBriefCard({
  campaign,
  disabled,
}: {
  campaign: CampaignDTO
  disabled?: boolean
}) {
  const update = useUpdateCampaign(campaign.id)
  const rewrite = useCampaignAction(
    campaign.id,
    "rewrite",
    "O Claude está reescrevendo as mensagens. Revise e aprove de novo."
  )
  const [brief, setBrief] = React.useState(campaign.brief ?? "")

  const saved = campaign.brief ?? ""
  const dirty = brief.trim() !== saved
  const unsent = campaign.counts.READY + campaign.counts.APPROVED

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ângulo da mensagem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Vai junto com cada lead para o Claude: público, o que destacar, o que
          evitar. Vazio, ele escreve só a partir da sua oferta e dos dados do
          lead.
        </p>
        <Textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={BRIEF_PLACEHOLDER}
          maxLength={2000}
          disabled={disabled}
          aria-label="Ângulo da campanha"
          className="min-h-24"
        />
        <div className="flex flex-wrap justify-end gap-2">
          {unsent > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || dirty || rewrite.isPending}
                  title={
                    dirty ? "Salve o ângulo antes de reescrever" : undefined
                  }
                >
                  <RefreshCw className="size-4" />
                  Reescrever não enviadas ({unsent})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Reescrever {unsent} mensage{unsent === 1 ? "m" : "ns"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    As mensagens que ainda não foram enviadas, inclusive as já
                    aprovadas e as que você editou, são escritas de novo com o
                    ângulo atual e voltam para aprovação. As já enviadas não
                    mudam.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => rewrite.mutate()}>
                    Reescrever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button
            size="sm"
            onClick={() => update.mutate({ brief: brief.trim() })}
            disabled={disabled || !dirty || update.isPending}
          >
            <Save className="size-4" />
            {update.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
