"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api-client"
import type { NoteDTO, NotesDTO } from "@/types/api"

export const noteKeys = {
  all: ["notes"] as const,
  byBusiness: (businessId: string) =>
    [...noteKeys.all, "business", businessId] as const,
}

export function useNotes(businessId: string) {
  return useQuery({
    queryKey: noteKeys.byBusiness(businessId),
    queryFn: () => apiFetch<NotesDTO>(`/api/businesses/${businessId}/notes`),
    enabled: Boolean(businessId),
  })
}

export function useCreateNote(businessId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<NoteDTO>(`/api/businesses/${businessId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      toast.success("Anotação registrada.")
      void queryClient.invalidateQueries({
        queryKey: noteKeys.byBusiness(businessId),
      })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível salvar", { description: error.message })
    },
  })
}

export function useUpdateNote(businessId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiFetch<NoteDTO>(`/api/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      toast.success("Anotação atualizada.")
      void queryClient.invalidateQueries({
        queryKey: noteKeys.byBusiness(businessId),
      })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível atualizar", { description: error.message })
    },
  })
}

export function useDeleteNote(businessId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ removed: number }>(`/api/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Anotação excluída.")
      void queryClient.invalidateQueries({
        queryKey: noteKeys.byBusiness(businessId),
      })
    },
    onError: (error: Error) => {
      toast.error("Não foi possível excluir", { description: error.message })
    },
  })
}
