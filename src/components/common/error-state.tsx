import { AlertCircle } from "lucide-react"
import type { ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Ocorreu um erro inesperado. Tente novamente."
}

/** Friendly error surface built on the shadcn Alert. */
export function ErrorState({
  title = "Não foi possível carregar os dados",
  error,
  action,
}: {
  title?: string
  error?: unknown
  action?: ReactNode
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{messageOf(error)}</span>
        {action}
      </AlertDescription>
    </Alert>
  )
}
