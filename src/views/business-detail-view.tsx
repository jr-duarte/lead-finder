"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowLeft,
  AtSign,
  Briefcase,
  Building2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  KanbanSquare,
  Megaphone,
  Pencil,
  Phone,
  Share2,
  Sparkles,
  Star,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { LeadApproachPanel } from "@/components/approach/lead-approach-panel"
import { BusinessEditDialog } from "@/components/businesses/business-edit-dialog"
import { AddToCampaignDialog } from "@/components/campaigns/add-to-campaign-dialog"
import { BusinessStatusBadge } from "@/components/businesses/business-status-badge"
import { ErrorState } from "@/components/common/error-state"
import { BusinessNotes } from "@/components/notes/business-notes"
import { LeadWhatsAppPanel } from "@/components/whatsapp/lead-whatsapp-panel"
import { PipelineStageBadge } from "@/components/pipeline/pipeline-stage-badge"
import { PipelineStageSelect } from "@/components/pipeline/pipeline-stage-select"
import {
  formatCurrency,
  formatDateTime,
  formatIsoDay,
  formatNumber,
  formatPhone,
  formatRating,
  formatWebsiteLabel,
} from "@/lib/format"
import { OPERATIONAL_STATUS_LABELS } from "@/domain/business"
import { formatCnpj } from "@/domain/cnpj"
import type { BusinessDTO } from "@/types/api"
import { useBusiness, useEnrichBusinesses } from "@/viewmodels/use-businesses"
import { useAddToPipeline, useChangeStage } from "@/viewmodels/use-pipeline"

/** Label/value row used across the detail tabs. */
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children}</dd>
    </div>
  )
}

function Fallback() {
  return <span className="text-muted-foreground">—</span>
}

export function BusinessDetailView({ id }: { id: string }) {
  const { data, isPending, isError, error, refetch } = useBusiness(id)
  const enrich = useEnrichBusinesses()
  const addToPipeline = useAddToPipeline()
  const changeStage = useChangeStage(id)
  const [isEditing, setIsEditing] = React.useState(false)
  const [isAddingToCampaign, setIsAddingToCampaign] = React.useState(false)

  if (isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorState
          error={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    )
  }

  if (isPending || !data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const business: BusinessDTO = data
  const socials = business.enrichment?.socials ?? {}
  const address = business.address ?? {}
  const registry = business.registry

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {business.name}
              </h1>
              <BusinessStatusBadge status={business.status} />
              {business.pipeline ? (
                <PipelineStageBadge stage={business.pipeline.stage} />
              ) : null}
              {business.operationalStatus &&
              business.operationalStatus !== "OPERATIONAL" ? (
                <Badge
                  variant="outline"
                  className="border-destructive/40 text-destructive bg-destructive/10"
                >
                  {OPERATIONAL_STATUS_LABELS[business.operationalStatus]}
                </Badge>
              ) : null}
              {registry?.status && registry.status !== "ATIVA" ? (
                <Badge
                  variant="outline"
                  className="border-destructive/40 text-destructive bg-destructive/10"
                >
                  CNPJ {registry.status.toLowerCase()}
                </Badge>
              ) : null}
            </div>

            <p className="text-muted-foreground text-sm">
              {[business.category, address.city].filter(Boolean).join(" • ") ||
                "Sem categoria"}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              {business.rating ? (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <Star className="size-4 fill-current text-amber-500" />
                  <span className="tabular font-medium">
                    {formatRating(business.rating)}
                  </span>
                  <span className="text-muted-foreground tabular">
                    {formatNumber(business.reviewsCount)} avaliações
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">
                  Sem avaliações
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => enrich.mutate({ ids: [business.id] })}
                    disabled={!business.website || enrich.isPending}
                  >
                    <Sparkles className="size-4" />
                    {enrich.isPending ? "Enriquecendo..." : "Enriquecer"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!business.website ? (
                <TooltipContent>
                  Esta empresa não possui website para enriquecer.
                </TooltipContent>
              ) : null}
            </Tooltip>

            {business.pipeline ? (
              <PipelineStageSelect
                stage={business.pipeline.stage}
                onChange={(stage) => changeStage.mutate(stage)}
                disabled={changeStage.isPending}
              />
            ) : (
              <Button
                variant="outline"
                onClick={() => addToPipeline.mutate({ ids: [business.id] })}
                disabled={addToPipeline.isPending}
              >
                <KanbanSquare className="size-4" />
                Adicionar ao funil
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setIsAddingToCampaign(true)}
            >
              <Megaphone className="size-4" />
              Adicionar à campanha
            </Button>

            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="size-4" />
              Editar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="approach">Abordagem</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="contact">Contato</TabsTrigger>
          <TabsTrigger value="registry">Receita</TabsTrigger>
          <TabsTrigger value="location">Localização</TabsTrigger>
          <TabsTrigger value="enrichment">Enriquecimento</TabsTrigger>
          <TabsTrigger value="notes">Anotações</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Field label="Nome">{business.name}</Field>
                <Field label="CNPJ">
                  {business.cnpj ? (
                    <span className="tabular">{formatCnpj(business.cnpj)}</span>
                  ) : (
                    <Fallback />
                  )}
                </Field>
                <Field label="Categoria">
                  {business.category ?? <Fallback />}
                </Field>
                <Field label="Status">
                  <BusinessStatusBadge status={business.status} />
                </Field>
                <Field label="Rating">
                  {business.rating ? (
                    <span className="tabular">
                      {formatRating(business.rating)} (
                      {formatNumber(business.reviewsCount)} avaliações)
                    </span>
                  ) : (
                    <Fallback />
                  )}
                </Field>
                <Field label="Categoria (fonte)">
                  {business.primaryType ? (
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {business.primaryType}
                    </code>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="Ver no Google Maps">
                  {business.mapsUrl ? (
                    <a
                      href={business.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 hover:underline"
                    >
                      <MapPin className="size-3.5" />
                      Abrir ficha
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="Fonte">
                  <Badge variant="secondary">{business.source}</Badge>
                </Field>
                <Field label="ID externo">
                  <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                    {business.externalId}
                  </code>
                </Field>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approach" className="pt-4">
          <LeadApproachPanel business={business} />
        </TabsContent>

        <TabsContent value="whatsapp" className="pt-4">
          <LeadWhatsAppPanel business={business} />
        </TabsContent>

        <TabsContent value="contact" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canais de contato</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Field label="Telefone">
                  {business.phone ? (
                    <a
                      href={`tel:${business.phone}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Phone className="size-3.5" />
                      <span className="tabular">
                        {formatPhone(business.phone)}
                      </span>
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="Website">
                  {business.website ? (
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 hover:underline"
                    >
                      {formatWebsiteLabel(business.website)}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="Instagram">
                  {socials.instagram ? (
                    <a
                      href={`https://instagram.com/${socials.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 hover:underline"
                    >
                      <AtSign className="size-3.5" />@{socials.instagram}
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="Facebook">
                  {socials.facebook ? (
                    <a
                      href={`https://facebook.com/${socials.facebook}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Share2 className="size-3.5" />
                      {socials.facebook}
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="LinkedIn">
                  {socials.linkedin ? (
                    <a
                      href={`https://www.linkedin.com/${socials.linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Briefcase className="size-3.5" />
                      {socials.linkedin.replace(/^(company|in)\//, "")}
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="WhatsApp">
                  {socials.whatsapp ? (
                    <a
                      href={`https://wa.me/${socials.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary tabular hover:underline"
                    >
                      {formatPhone(socials.whatsapp)}
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>

                <Field label="E-mails">
                  {business.enrichment?.emails?.length ? (
                    <div className="flex flex-col gap-1">
                      {business.enrichment.emails.map((email) => (
                        <a
                          key={email}
                          href={`mailto:${email}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Mail className="size-3.5" />
                          {email}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <Fallback />
                  )}
                </Field>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registry" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Dados cadastrais (Receita Federal)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!business.cnpj ? (
                <p className="text-muted-foreground py-4 text-sm">
                  Nenhum CNPJ encontrado. Enriqueça a empresa para procurá-lo no
                  site ou informe-o em Editar.
                </p>
              ) : !registry?.fetchedAt ? (
                <p
                  className={
                    registry?.error
                      ? "text-destructive py-4 text-sm"
                      : "text-muted-foreground py-4 text-sm"
                  }
                >
                  {registry?.error ??
                    "O CNPJ ainda não foi consultado. Enriqueça a empresa ou salve-a em Editar para consultar."}
                </p>
              ) : (
                <dl className="divide-y">
                  <Field label="CNPJ">
                    <span className="tabular">
                      {formatCnpj(registry.cnpj ?? business.cnpj)}
                    </span>
                  </Field>
                  <Field label="Razão social">
                    {registry.legalName ?? <Fallback />}
                  </Field>
                  <Field label="Nome fantasia">
                    {registry.tradeName ?? <Fallback />}
                  </Field>
                  <Field label="Situação cadastral">
                    {registry.status ? (
                      <span className="inline-flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            registry.status === "ATIVA"
                              ? undefined
                              : "border-destructive/40 text-destructive bg-destructive/10"
                          }
                        >
                          {registry.status}
                        </Badge>
                        {registry.statusDate ? (
                          <span className="text-muted-foreground tabular text-xs">
                            desde {formatIsoDay(registry.statusDate)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="Abertura">
                    <span className="tabular">
                      {formatIsoDay(registry.openedAt)}
                    </span>
                  </Field>
                  <Field label="Porte">
                    {[
                      registry.size,
                      registry.mei ? "MEI" : null,
                      registry.simples ? "Simples Nacional" : null,
                    ]
                      .filter(Boolean)
                      .join(" • ") || <Fallback />}
                  </Field>
                  <Field label="Natureza jurídica">
                    {registry.legalNature ?? <Fallback />}
                  </Field>
                  <Field label="Capital social">
                    <span className="tabular">
                      {formatCurrency(registry.shareCapital)}
                    </span>
                  </Field>
                  <Field label="Atividade principal">
                    {registry.mainActivity ? (
                      <span>
                        <code className="bg-muted mr-1.5 rounded px-1.5 py-0.5 text-xs">
                          {registry.mainActivity.code}
                        </code>
                        {registry.mainActivity.description}
                      </span>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="Atividades secundárias">
                    {registry.secondaryActivities.length ? (
                      <ul className="space-y-1">
                        {registry.secondaryActivities.map((item) => (
                          <li key={item.code}>
                            <code className="bg-muted mr-1.5 rounded px-1.5 py-0.5 text-xs">
                              {item.code}
                            </code>
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="Sócios">
                    {registry.partners.length ? (
                      <ul className="space-y-1">
                        {registry.partners.map((partner) => (
                          <li key={`${partner.name}-${partner.role ?? ""}`}>
                            {partner.name}
                            {partner.role ? (
                              <span className="text-muted-foreground">
                                {" "}
                                — {partner.role}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="E-mail (Receita)">
                    {registry.email ? (
                      <a
                        href={`mailto:${registry.email}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <Mail className="size-3.5" />
                        {registry.email}
                      </a>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="Telefones (Receita)">
                    {registry.phones.length ? (
                      <div className="flex flex-col gap-1">
                        {registry.phones.map((phone) => (
                          <a
                            key={phone}
                            href={`tel:${phone}`}
                            className="tabular inline-flex items-center gap-1.5 hover:underline"
                          >
                            <Phone className="size-3.5" />
                            {formatPhone(phone)}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="Consultado em">
                    <span className="tabular">
                      {formatDateTime(registry.fetchedAt)}
                    </span>
                  </Field>
                  {registry.error ? (
                    <Field label="Última consulta">
                      <span className="text-destructive">{registry.error}</span>
                    </Field>
                  ) : null}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endereço</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Field label="Logradouro">
                  {[address.street, address.number]
                    .filter(Boolean)
                    .join(", ") || <Fallback />}
                </Field>
                <Field label="Bairro">
                  {address.neighborhood ?? <Fallback />}
                </Field>
                <Field label="Cidade">{address.city ?? <Fallback />}</Field>
                <Field label="Estado">{address.state ?? <Fallback />}</Field>
                <Field label="CEP">
                  <span className="tabular">
                    {address.postalCode ?? <Fallback />}
                  </span>
                </Field>
                <Field label="Coordenadas">
                  {business.location?.latitude &&
                  business.location?.longitude ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${business.location.latitude},${business.location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary tabular inline-flex items-center gap-1.5 hover:underline"
                    >
                      <MapPin className="size-3.5" />
                      {business.location.latitude.toFixed(5)},{" "}
                      {business.location.longitude.toFixed(5)}
                    </a>
                  ) : (
                    <Fallback />
                  )}
                </Field>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrichment" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Resultado do enriquecimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!business.enrichment?.enrichedAt ? (
                <div className="flex flex-col items-start gap-3 py-4">
                  <p className="text-muted-foreground text-sm">
                    Esta empresa ainda não foi enriquecida.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => enrich.mutate({ ids: [business.id] })}
                    disabled={!business.website || enrich.isPending}
                  >
                    <Sparkles className="size-4" />
                    Enriquecer agora
                  </Button>
                </div>
              ) : (
                <dl className="divide-y">
                  <Field label="Enriquecida em">
                    <span className="tabular">
                      {formatDateTime(business.enrichment.enrichedAt)}
                    </span>
                  </Field>
                  <Field label="Título do site">
                    {business.enrichment.websiteTitle ?? <Fallback />}
                  </Field>
                  <Field label="Status HTTP">
                    {business.enrichment.websiteStatus ? (
                      <Badge variant="secondary" className="tabular">
                        {business.enrichment.websiteStatus}
                      </Badge>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  <Field label="Site">
                    {business.enrichment.websiteBroken === undefined ? (
                      <Fallback />
                    ) : business.enrichment.websiteBroken ? (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 text-destructive bg-destructive/10"
                      >
                        Fora do ar
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success bg-success/10"
                      >
                        Funcionando
                      </Badge>
                    )}
                  </Field>
                  <Field label="Tecnologias">
                    {business.enrichment.technologies?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {business.enrichment.technologies.map((tech) => (
                          <Badge key={tech} variant="outline">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Fallback />
                    )}
                  </Field>
                  {business.enrichment.error ? (
                    <Field label="Erro">
                      <span className="text-destructive">
                        {business.enrichment.error}
                      </span>
                    </Field>
                  ) : null}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <BusinessNotes
            businessId={business.id}
            stage={business.pipeline?.stage}
            onStageChange={(stage) => changeStage.mutate(stage)}
            isChangingStage={changeStage.isPending}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Building2 className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Empresa coletada</p>
                    <p className="text-muted-foreground tabular text-xs">
                      {formatDateTime(business.collectedAt)}
                    </p>
                  </div>
                </li>

                {business.enrichment?.enrichedAt ? (
                  <li className="flex gap-3">
                    <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                      <Sparkles className="size-4" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        Enriquecimento executado
                      </p>
                      <p className="text-muted-foreground tabular text-xs">
                        {formatDateTime(business.enrichment.enrichedAt)}
                      </p>
                    </div>
                  </li>
                ) : null}

                <li className="flex gap-3">
                  <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Clock className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Última atualização</p>
                    <p className="text-muted-foreground tabular text-xs">
                      {formatDateTime(business.updatedAt)}
                    </p>
                  </div>
                </li>
              </ol>

              <Separator className="my-4" />

              <p className="text-muted-foreground text-xs">
                Vinculada a {business.searchIds?.length ?? 0}{" "}
                {business.searchIds?.length === 1 ? "busca" : "buscas"}.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BusinessEditDialog
        business={business}
        open={isEditing}
        onOpenChange={setIsEditing}
      />

      <AddToCampaignDialog
        open={isAddingToCampaign}
        onOpenChange={setIsAddingToCampaign}
        businessIds={[business.id]}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link href="/businesses">
        <ArrowLeft className="size-4" />
        Voltar para empresas
      </Link>
    </Button>
  )
}
