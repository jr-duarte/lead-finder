"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "cn"
import { ArrowLeft, MessagesSquare } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChatPanel } from "@/components/whatsapp/chat-panel"
import { ConversationList } from "@/components/whatsapp/conversation-list"
import { LeadLinkPanel } from "@/components/whatsapp/lead-link-panel"
import { WhatsAppConnectionPanel } from "@/components/whatsapp/whatsapp-connection-panel"
import { WhatsAppStatusBadge } from "@/components/whatsapp/whatsapp-status-badge"
import { isWhatsAppOnline, type WhatsAppStatus } from "@/domain/whatsapp"
import { useWhatsAppEvents, useWhatsAppStatus } from "@/viewmodels/use-whatsapp"

const LIST_COLLAPSED_KEY = "lead-finder:whatsapp-list-collapsed"
const collapseListeners = new Set<() => void>()

function readListCollapsed(): boolean {
  try {
    return localStorage.getItem(LIST_COLLAPSED_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Whether the conversation list is collapsed, remembered in this browser.
 * The server always renders it open, so hydration never mismatches.
 */
function useListCollapsed() {
  const collapsed = React.useSyncExternalStore(
    (listener) => {
      collapseListeners.add(listener)
      return () => collapseListeners.delete(listener)
    },
    readListCollapsed,
    () => false
  )
  const setCollapsed = React.useCallback((next: boolean) => {
    try {
      localStorage.setItem(LIST_COLLAPSED_KEY, next ? "1" : "0")
    } catch {
      // Storage blocked: the choice just lasts until the next reload.
    }
    collapseListeners.forEach((listener) => listener())
  }, [])
  return [collapsed, setCollapsed] as const
}

/** Debounces the search box so each keystroke is not a request. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function WhatsAppView() {
  useWhatsAppEvents()
  const status = useWhatsAppStatus()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // The open conversation lives in the URL, so a refresh keeps it.
  const selectedId = searchParams.get("c")
  // A prefilled message (e.g. the AI approach). It seeds the composer when
  // the chat mounts, then leaves the URL so a refresh does not bring it back.
  const draftParam = searchParams.get("draft")

  React.useEffect(() => {
    if (!draftParam) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("draft")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [draftParam, searchParams, router, pathname])

  const [search, setSearch] = React.useState("")
  const [listCollapsed, setListCollapsed] = useListCollapsed()
  // Only with a chat open: without one (and on phones) the list is the page.
  const collapsed = listCollapsed && Boolean(selectedId)
  const debouncedSearch = useDebounced(search, 300)

  const select = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set("c", id)
    else params.delete("c")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const snapshot = status.data
  const current = (snapshot?.status ?? "DISCONNECTED") as WhatsAppStatus
  const online = isWhatsAppOnline(current)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title="WhatsApp"
        description="Conversas da sua conta, salvas no CRM."
        actions={snapshot ? <WhatsAppStatusBadge status={current} /> : null}
      />

      {status.isError ? (
        <ErrorState
          error={status.error}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => status.refetch()}
            >
              Tentar novamente
            </Button>
          }
        />
      ) : snapshot ? (
        <WhatsAppConnectionPanel snapshot={snapshot} />
      ) : (
        <Skeleton className="h-20 w-full" />
      )}

      {/* History stays readable even while disconnected: it lives in MongoDB. */}
      <Card
        className={cn(
          "grid h-[calc(100svh-16rem)] min-h-[480px] grid-cols-1 gap-0 overflow-hidden p-0",
          collapsed
            ? "md:grid-cols-[56px_1fr] xl:grid-cols-[56px_1fr_280px]"
            : "md:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr_280px]"
        )}
      >
        <div
          className={cn(
            "min-h-0 border-r md:flex md:flex-col",
            selectedId ? "hidden" : "flex flex-col"
          )}
        >
          <ConversationList
            search={search}
            query={debouncedSearch}
            onSearchChange={setSearch}
            selectedId={selectedId}
            onSelect={select}
            collapsed={collapsed}
            onCollapsedChange={selectedId ? setListCollapsed : undefined}
          />
        </div>

        {selectedId ? (
          <div className="flex min-h-0 flex-col">
            <div className="border-b p-2 md:hidden">
              <Button variant="ghost" size="sm" onClick={() => select(null)}>
                <ArrowLeft className="size-4" />
                Conversas
              </Button>
            </div>
            <ChatPanel
              key={selectedId}
              conversationId={selectedId}
              online={online}
              initialDraft={draftParam ?? undefined}
            />
          </div>
        ) : (
          <div className="hidden items-center justify-center md:flex">
            <EmptyState
              icon={MessagesSquare}
              title="Selecione uma conversa"
              description="Escolha uma conversa ao lado para ver o histórico e responder."
            />
          </div>
        )}

        <div className="hidden min-h-0 overflow-y-auto border-l xl:block">
          {selectedId ? <LeadLinkPanel conversationId={selectedId} /> : null}
        </div>
      </Card>
    </div>
  )
}
