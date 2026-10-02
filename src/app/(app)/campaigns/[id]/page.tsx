import { CampaignDetailView } from "@/views/campaign-detail-view"

export const metadata = { title: "Campanha" }

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CampaignDetailView id={id} />
}
