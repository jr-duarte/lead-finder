import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { BusinessesView } from "@/views/businesses-view"

export const metadata = { title: "Empresas" }

export default function BusinessesPage() {
  // useSearchParams (inside the view) requires a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BusinessesView />
    </Suspense>
  )
}
