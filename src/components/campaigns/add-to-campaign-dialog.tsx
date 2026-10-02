"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Megaphone } from "lucide-react"

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AddLeadsResultDTO } from "@/types/api"
import {
  describeAddResult,
  useAddLeadsToCampaign,
  useCreateCampaign,
  useOpenCampaigns,
} from "@/viewmodels/use-campaigns"

type Result = AddLeadsResultDTO & { campaignId: string }

/**
 * Puts leads in a campaign: an open one, or a new one created here. Only
 * leads never contacted join; the result explains who was left out.
 */
export function AddToCampaignDialog({
  open,
  onOpenChange,
  businessIds,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessIds: string[]
  /** Called after leads were added, e.g. to clear a table selection. */
  onDone?: () => void
}) {
  const campaigns = useOpenCampaigns(open)
  const create = useCreateCampaign()
  const addLeads = useAddLeadsToCampaign()

  const openCampaigns = campaigns.data?.campaigns
  // Defaults derive from the list: an existing campaign when there is one.
  // They only become state once the user picks something.
  const [modeChoice, setModeChoice] = React.useState<"existing" | "new" | null>(
    null
  )
  const [campaignChoice, setCampaignChoice] = React.useState("")
  const [name, setName] = React.useState("")
  const [result, setResult] = React.useState<Result | null>(null)

  const hasOpen = (openCampaigns?.length ?? 0) > 0
  const mode = modeChoice ?? (hasOpen ? "existing" : "new")
  const campaignId = campaignChoice || openCampaigns?.[0]?.id || ""

  const reset = () => {
    setResult(null)
    setName("")
    setCampaignChoice("")
    setModeChoice(null)
  }

  const isPending = create.isPending || addLeads.isPending
  const canSubmit =
    businessIds.length > 0 &&
    (mode === "new" ? name.trim().length > 0 : Boolean(campaignId))

  const submit = async () => {
    if (mode === "new") {
      const created = await create.mutateAsync({
        name: name.trim(),
        businessIds,
      })
      setResult({ ...created, campaignId: created.campaign.id })
    } else {
      const added = await addLeads.mutateAsync({ id: campaignId, businessIds })
      setResult({ ...added, campaignId })
    }
    onDone?.()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar à campanha</DialogTitle>
          <DialogDescription>
            {businessIds.length === 1
              ? "Só leads que nunca foram contatados entram."
              : `${businessIds.length} leads selecionados. Só os que nunca foram contatados entram.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">{describeAddResult(result)}</p>
            {result.added > 0 ? (
              <p className="text-muted-foreground">
                O Claude está escrevendo as abordagens. Revise e aprove na
                página da campanha.
              </p>
            ) : null}
            {result.rejected.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {result.rejected.map((lead) => (
                  <li key={lead.businessId} className="flex gap-2">
                    <span className="truncate font-medium">{lead.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {lead.reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <RadioGroup
            value={mode}
            onValueChange={(value) =>
              setModeChoice(value as "existing" | "new")
            }
            className="space-y-3"
          >
            {hasOpen ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="existing" id="campaign-existing" />
                  <Label htmlFor="campaign-existing">Campanha existente</Label>
                </div>
                <Select
                  value={campaignId}
                  onValueChange={setCampaignChoice}
                  disabled={mode !== "existing"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha a campanha" />
                  </SelectTrigger>
                  <SelectContent>
                    {openCampaigns?.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="new" id="campaign-new" />
                <Label htmlFor="campaign-new">Nova campanha</Label>
              </div>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onFocus={() => setModeChoice("new")}
                placeholder="Ex.: Padarias sem site, Zona Norte"
                maxLength={120}
                aria-label="Nome da nova campanha"
              />
            </div>
          </RadioGroup>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button asChild>
                <Link href={`/campaigns/${result.campaignId}`}>
                  Ver campanha
                </Link>
              </Button>
            </>
          ) : (
            <Button onClick={submit} disabled={!canSubmit || isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Megaphone className="size-4" />
              )}
              {mode === "new" ? "Criar campanha" : "Adicionar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
