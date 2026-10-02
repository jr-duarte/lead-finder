import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { WhatsAppView } from "@/views/whatsapp-view"

export const metadata = { title: "WhatsApp" }

export default function WhatsAppPage() {
  // useSearchParams (inside the view) requires a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WhatsAppView />
    </Suspense>
  )
}
