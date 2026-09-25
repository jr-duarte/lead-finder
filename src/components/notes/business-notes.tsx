"use client"

import * as React from "react"
import { NotebookPen, Pencil, Trash2, X } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { PipelineStageBadge } from "@/components/pipeline/pipeline-stage-badge"
import { PipelineStageSelect } from "@/components/pipeline/pipeline-stage-select"
import type { PipelineStage } from "@/domain/pipeline"
import { formatDateTime } from "@/lib/format"
import type { NoteDTO } from "@/types/api"
import {
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from "@/viewmodels/use-notes"

/** One note, switching between read and edit modes in place. */
function NoteItem({
  note,
  onSave,
  onDelete,
  isSaving,
}: {
  note: NoteDTO
  onSave: (content: string) => Promise<void>
  onDelete: () => void
  isSaving?: boolean
}) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(note.content)

  const save = async () => {
    if (!draft.trim()) return
    await onSave(draft.trim())
    setIsEditing(false)
  }

  return (
    <div className="group space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground tabular text-xs">
          {formatDateTime(note.createdAt)}
        </span>

        {note.stage ? (
          <PipelineStageBadge
            stage={note.stage as PipelineStage}
            className="text-[10px]"
          />
        ) : null}

        {note.updatedAt !== note.createdAt ? (
          <span className="text-muted-foreground text-xs">(editada)</span>
        ) : null}

        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {isEditing ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                setDraft(note.content)
                setIsEditing(false)
              }}
              aria-label="Cancelar edição"
            >
              <X className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setIsEditing(true)}
              aria-label="Editar anotação"
            >
              <Pencil className="size-3.5" />
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Excluir anotação"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir esta anotação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            aria-label="Conteúdo da anotação"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
      )}
    </div>
  )
}

/** Notes area on the business detail page. */
export function BusinessNotes({
  businessId,
  stage,
  onStageChange,
  isChangingStage,
}: {
  businessId: string
  stage?: PipelineStage
  /** Omitted when the lead is not on the board. */
  onStageChange?: (stage: PipelineStage) => void
  isChangingStage?: boolean
}) {
  const notes = useNotes(businessId)
  const create = useCreateNote(businessId)
  const update = useUpdateNote(businessId)
  const remove = useDeleteNote(businessId)

  const [draft, setDraft] = React.useState("")

  const submit = async () => {
    if (!draft.trim()) return
    await create.mutateAsync(draft.trim())
    setDraft("")
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Anotações</CardTitle>
          {stage ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Etapa</span>
              {onStageChange ? (
                <PipelineStageSelect
                  stage={stage}
                  onChange={onStageChange}
                  disabled={isChangingStage}
                />
              ) : (
                <PipelineStageBadge stage={stage} />
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Fora do funil</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Registre o que foi conversado, próximos passos, objeções..."
            rows={3}
            aria-label="Nova anotação"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submit}
              disabled={!draft.trim() || create.isPending}
            >
              <NotebookPen className="size-4" />
              {create.isPending ? "Salvando..." : "Adicionar anotação"}
            </Button>
          </div>
        </div>

        <Separator />

        {notes.isError ? (
          <ErrorState
            error={notes.error}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => notes.refetch()}
              >
                Tentar novamente
              </Button>
            }
          />
        ) : notes.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : (notes.data?.notes.length ?? 0) === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Nenhuma anotação ainda"
            description="Registre o histórico das conversas com esta empresa."
          />
        ) : (
          <div className="space-y-2">
            {notes.data?.notes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isSaving={update.isPending}
                onSave={async (content) => {
                  await update.mutateAsync({ id: note.id, content })
                }}
                onDelete={() => remove.mutate(note.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
