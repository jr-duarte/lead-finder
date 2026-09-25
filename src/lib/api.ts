import { NextResponse } from "next/server"
import { ZodError } from "zod"

export type ApiError = {
  message: string
  issues?: { path: string; message: string }[]
}

/** Uniform error responses, so the client always gets { message }. */
export function apiError(error: unknown): NextResponse<ApiError> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        message: "Dados inválidos.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 }
    )
  }

  const message =
    error instanceof Error ? error.message : "Erro interno inesperado."

  // Surface a friendly message when MongoDB is unreachable.
  if (/ECONNREFUSED|ServerSelection|connect ETIMEDOUT/i.test(message)) {
    return NextResponse.json(
      {
        message:
          "Não foi possível conectar ao MongoDB. Verifique se o banco está em execução e a variável MONGODB_URI.",
      },
      { status: 503 }
    )
  }

  console.error("[api]", error)
  return NextResponse.json({ message }, { status: 500 })
}

export function searchParamsToObject(url: string): Record<string, string> {
  const { searchParams } = new URL(url)
  const result: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    if (value !== "") result[key] = value
  })
  return result
}
