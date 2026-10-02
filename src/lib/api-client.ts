/** Thin fetch wrapper that surfaces the API's { message } as an Error. */
export async function apiFetch<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      // FormData sets its own multipart boundary.
      ...(typeof init?.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = `Falha na requisição (${response.status})`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) message = payload.message
    } catch {
      // Response had no JSON body; keep the status-based message.
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/** Builds a querystring, dropping empty and default-ish values. */
export function toQueryString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }

  return search.toString()
}
