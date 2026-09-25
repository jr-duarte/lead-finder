import { SearchDetailView } from "@/views/search-detail-view"

export const metadata = { title: "Detalhes da busca" }

export default async function SearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <SearchDetailView id={id} />
}
