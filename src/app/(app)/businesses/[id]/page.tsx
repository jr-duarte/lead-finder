import { BusinessDetailView } from "@/views/business-detail-view"

export const metadata = { title: "Detalhes da empresa" }

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <BusinessDetailView id={id} />
}
