"use client"

import * as React from "react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query"
import { toast } from "sonner"

import { isWhatsAppTransitional, type WhatsAppStatus } from "@/domain/whatsapp"
import { apiFetch, toQueryString } from "@/lib/api-client"
import type {
  BusinessDTO,
  PaginatedDTO,
  WhatsAppConversationDetailDTO,
  WhatsAppConversationDTO,
  WhatsAppMessageDTO,
  WhatsAppMessagesPageDTO,
  WhatsAppSnapshotDTO,
} from "@/types/api"
import { businessKeys } from "@/viewmodels/use-businesses"
import { noteKeys } from "@/viewmodels/use-notes"
import { pipelineKeys } from "@/viewmodels/use-pipeline"

export const whatsappKeys = {
  all: ["whatsapp"] as const,
  status: () => [...whatsappKeys.all, "status"] as const,
  conversations: () => [...whatsappKeys.all, "conversations"] as const,
  conversationList: (search: string) =>
    [...whatsappKeys.conversations(), "list", search] as const,
  conversation: (id: string) =>
    [...whatsappKeys.conversations(), "detail", id] as const,
  messages: (id: string) => [...whatsappKeys.all, "messages", id] as const,
  leadSearch: (term: string) =>
    [...whatsappKeys.all, "lead-search", term] as const,
}

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: whatsappKeys.status(),
    queryFn: () => apiFetch<WhatsAppSnapshotDTO>("/api/whatsapp/status"),
    // Live updates come over SSE; polling is the safety net, faster while
    // the state is still settling (QR code, sync).
    refetchInterval: (query) => {
      const status = query.state.data?.status as WhatsAppStatus | undefined
      return status && isWhatsAppTransitional(status) ? 2000 : 30_000
    },
  })
}

type ServerEvent =
  | { type: "status" }
  | { type: "conversations"; conversationIds: string[] }
  | { type: "message"; conversationId: string }
  | { type: "message-status" }
  | { type: "leads"; businessIds: string[] }

/**
 * Subscribes to the server's event stream and refreshes whatever changed, so
 * new messages show up without a reload. EventSource reconnects on its own.
 */
export function useWhatsAppEvents() {
  const queryClient = useQueryClient()

  React.useEffect(() => {
    const source = new EventSource("/api/whatsapp/events")

    source.onmessage = (event) => {
      let payload: ServerEvent
      try {
        payload = JSON.parse(event.data) as ServerEvent
      } catch {
        return
      }

      switch (payload.type) {
        case "status":
          void queryClient.invalidateQueries({
            queryKey: whatsappKeys.status(),
          })
          break
        case "conversations":
          void queryClient.invalidateQueries({
            queryKey: whatsappKeys.conversations(),
          })
          for (const id of payload.conversationIds) {
            void queryClient.invalidateQueries({
              queryKey: whatsappKeys.messages(id),
            })
          }
          // A merge or an unknown change: refresh any open chat.
          if (payload.conversationIds.length === 0) {
            void queryClient.invalidateQueries({
              queryKey: [...whatsappKeys.all, "messages"],
            })
          }
          break
        case "message":
          void queryClient.invalidateQueries({
            queryKey: whatsappKeys.messages(payload.conversationId),
          })
          void queryClient.invalidateQueries({
            queryKey: whatsappKeys.conversations(),
          })
          break
        case "message-status":
          void queryClient.invalidateQueries({
            queryKey: [...whatsappKeys.all, "messages"],
          })
          break
        case "leads":
          // A lead changed stage: refresh the board, the lead and its notes.
          void queryClient.invalidateQueries({ queryKey: businessKeys.all })
          void queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
          void queryClient.invalidateQueries({ queryKey: noteKeys.all })
          void queryClient.invalidateQueries({
            queryKey: whatsappKeys.conversations(),
          })
          break
      }
    }

    return () => source.close()
  }, [queryClient])
}

function useSessionAction(path: string, success?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<WhatsAppSnapshotDTO>(`/api/whatsapp/${path}`, {
        method: "POST",
      }),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(whatsappKeys.status(), snapshot)
      if (success) toast.success(success)
    },
    onError: (error: Error) => {
      toast.error("Não foi possível concluir", { description: error.message })
    },
  })
}

export function useConnectWhatsApp() {
  return useSessionAction("connect")
}

export function useSyncWhatsApp() {
  return useSessionAction("sync")
}

export function useDisconnectWhatsApp() {
  return useSessionAction("disconnect", "WhatsApp desconectado.")
}

const CONVERSATIONS_PAGE_SIZE = 50

/** Conversations linked to one lead, for its detail page. */
export function useLeadConversations(businessId: string) {
  return useQuery({
    queryKey: [...whatsappKeys.conversations(), "lead", businessId] as const,
    queryFn: () =>
      apiFetch<PaginatedDTO<WhatsAppConversationDTO>>(
        `/api/whatsapp/conversations?${toQueryString({ businessId, pageSize: 10 })}`
      ),
    enabled: Boolean(businessId),
  })
}

/**
 * Opens the conversation with a lead (checking which number has WhatsApp)
 * and resolves to it; the caller decides where to show it.
 */
export function useStartConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (businessId: string) =>
      apiFetch<WhatsAppConversationDTO>("/api/whatsapp/conversations", {
        method: "POST",
        body: JSON.stringify({ businessId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: whatsappKeys.conversations(),
      })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível abrir a conversa", {
        description: error.message,
      })
    },
  })
}

/** Link to the inbox with a conversation open and, optionally, a draft. */
export function whatsappInboxHref(conversationId: string, draft?: string) {
  return `/whatsapp?${toQueryString({ c: conversationId, draft })}`
}

export function useConversations(search: string) {
  return useInfiniteQuery({
    queryKey: whatsappKeys.conversationList(search),
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedDTO<WhatsAppConversationDTO>>(
        `/api/whatsapp/conversations?${toQueryString({
          search,
          page: pageParam,
          pageSize: CONVERSATIONS_PAGE_SIZE,
        })}`
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    placeholderData: (previous) => previous,
  })
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: whatsappKeys.conversation(id ?? ""),
    queryFn: () =>
      apiFetch<WhatsAppConversationDetailDTO>(
        `/api/whatsapp/conversations/${id}`
      ),
    enabled: Boolean(id),
  })
}

/** History, newest page first; older pages load as the user scrolls up. */
export function useMessages(id: string | null) {
  return useInfiniteQuery({
    queryKey: whatsappKeys.messages(id ?? ""),
    queryFn: ({ pageParam }) =>
      apiFetch<WhatsAppMessagesPageDTO>(
        `/api/whatsapp/conversations/${id}/messages?${toQueryString({
          before: pageParam,
          limit: 40,
        })}`
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(id),
  })
}

/** Puts a just-sent message on screen and refreshes the inbox. */
function useShowSentMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return (message: WhatsAppMessageDTO) => {
    // Show it at once; the refetch below confirms it.
    queryClient.setQueryData<InfiniteData<WhatsAppMessagesPageDTO>>(
      whatsappKeys.messages(conversationId),
      (data) => {
        if (!data?.pages.length) return data
        const [first, ...rest] = data.pages
        if (first.items.some((item) => item.id === message.id)) return data
        return {
          ...data,
          pages: [{ ...first, items: [message, ...first.items] }, ...rest],
        }
      }
    )
    void queryClient.invalidateQueries({
      queryKey: whatsappKeys.conversations(),
    })
  }
}

export function useSendMessage(conversationId: string) {
  const showSent = useShowSentMessage(conversationId)
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<WhatsAppMessageDTO>(
        `/api/whatsapp/conversations/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify({ text }) }
      ),
    onSuccess: showSent,
    onError: (error: Error) => {
      toast.error("Mensagem não enviada", { description: error.message })
    },
  })
}

export type SendMediaInput = {
  file: Blob
  fileName?: string
  /** Text shown under an image. */
  caption?: string
  /** Recorded in the CRM: goes as a voice message. */
  voiceNote?: boolean
}

/** Sends an image or an audio; the server converts audio for WhatsApp. */
export function useSendMedia(conversationId: string) {
  const showSent = useShowSentMessage(conversationId)
  return useMutation({
    mutationFn: ({ file, fileName, caption, voiceNote }: SendMediaInput) => {
      const form = new FormData()
      form.set("file", file, fileName ?? "arquivo")
      if (caption) form.set("caption", caption)
      if (voiceNote) form.set("voiceNote", "true")
      return apiFetch<WhatsAppMessageDTO>(
        `/api/whatsapp/conversations/${conversationId}/media`,
        { method: "POST", body: form }
      )
    },
    onSuccess: showSent,
    onError: (error: Error) => {
      toast.error("Arquivo não enviado", { description: error.message })
    },
  })
}

export type ReplySuggestionDTO = {
  reply: string
  rationale: string
  model: string
}

/** Asks Claude for the next message; the caller puts it in the composer. */
export function useSuggestReply(conversationId: string) {
  return useMutation({
    mutationFn: (draft?: string) =>
      apiFetch<ReplySuggestionDTO>(
        `/api/whatsapp/conversations/${conversationId}/suggest`,
        { method: "POST", body: JSON.stringify({ draft }) }
      ),
    onError: (error: Error) => {
      toast.error("Não foi possível sugerir uma resposta", {
        description: error.message,
      })
    },
  })
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<WhatsAppConversationDTO>(
        `/api/whatsapp/conversations/${id}/read`,
        { method: "POST" }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: whatsappKeys.conversations(),
      })
    },
  })
}

export function useLinkLead(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (businessId: string | null) =>
      apiFetch<WhatsAppConversationDetailDTO>(
        `/api/whatsapp/conversations/${conversationId}/lead`,
        { method: "PATCH", body: JSON.stringify({ businessId }) }
      ),
    onSuccess: (detail, businessId) => {
      queryClient.setQueryData(
        whatsappKeys.conversation(conversationId),
        detail
      )
      void queryClient.invalidateQueries({
        queryKey: whatsappKeys.conversations(),
      })
      toast.success(
        businessId ? "Conversa vinculada ao lead." : "Lead desvinculado."
      )
    },
    onError: (error: Error) => {
      toast.error("Não foi possível atualizar o lead", {
        description: error.message,
      })
    },
  })
}

/** Leads matching a name or phone, to link a conversation by hand. */
export function useLeadSearch(term: string) {
  const trimmed = term.trim()
  return useQuery({
    queryKey: whatsappKeys.leadSearch(trimmed),
    queryFn: () =>
      apiFetch<PaginatedDTO<BusinessDTO>>(
        `/api/businesses?${toQueryString({ search: trimmed, pageSize: 8 })}`
      ),
    enabled: trimmed.length >= 2,
    placeholderData: (previous) => previous,
  })
}
