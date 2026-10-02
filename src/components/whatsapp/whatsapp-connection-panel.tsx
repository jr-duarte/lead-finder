"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, LogOut, QrCode, RefreshCw, Smartphone } from "lucide-react"

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
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatWhatsAppPhone, type WhatsAppStatus } from "@/domain/whatsapp"
import type { WhatsAppSnapshotDTO } from "@/types/api"
import {
  useConnectWhatsApp,
  useDisconnectWhatsApp,
  useSyncWhatsApp,
} from "@/viewmodels/use-whatsapp"

function relative(value?: string) {
  if (!value) return "nunca"
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR })
}

function ConnectButton({ label = "Conectar WhatsApp" }: { label?: string }) {
  const connect = useConnectWhatsApp()
  return (
    <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
      {connect.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Smartphone className="size-4" />
      )}
      {label}
    </Button>
  )
}

/** Bar shown while connected: number, last sync, manual sync, disconnect. */
function ConnectedBar({ snapshot }: { snapshot: WhatsAppSnapshotDTO }) {
  const sync = useSyncWhatsApp()
  const disconnect = useDisconnectWhatsApp()
  const isSyncing = snapshot.status === "SYNCING"

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      {snapshot.phoneNumber ? (
        <span>
          <span className="text-muted-foreground">Número: </span>
          {formatWhatsAppPhone(snapshot.phoneNumber)}
        </span>
      ) : null}

      <span>
        <span className="text-muted-foreground">Última sincronização: </span>
        {isSyncing ? "em andamento..." : relative(snapshot.lastSyncAt)}
      </span>

      {snapshot.lastSyncError && !isSyncing ? (
        <span className="text-destructive">
          Última sincronização falhou: {snapshot.lastSyncError}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => sync.mutate()}
          disabled={isSyncing || sync.isPending}
        >
          <RefreshCw className={isSyncing ? "size-4 animate-spin" : "size-4"} />
          Sincronizar agora
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={disconnect.isPending}>
              <LogOut className="size-4" />
              Desconectar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desconectar o WhatsApp?</AlertDialogTitle>
              <AlertDialogDescription>
                O CRM sai da lista de aparelhos conectados do seu celular. O
                histórico salvo continua disponível, mas para voltar a receber
                mensagens será preciso ler o QR Code de novo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => disconnect.mutate()}>
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function SyncingState({ snapshot }: { snapshot: WhatsAppSnapshotDTO }) {
  const progress = snapshot.sync?.progress
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Sincronizando conversas...</p>
      {/* Real progress only: WhatsApp reports it during history sync. */}
      {typeof progress === "number" ? (
        <div className="flex max-w-sm items-center gap-3">
          <Progress value={progress} className="flex-1" />
          <span className="tabular text-muted-foreground text-xs">
            {Math.round(progress)}%
          </span>
        </div>
      ) : null}
      {snapshot.sync && snapshot.sync.newMessages > 0 ? (
        <p className="text-muted-foreground">
          {snapshot.sync.newMessages} mensagens novas até agora
        </p>
      ) : null}
    </div>
  )
}

const WORKING: WhatsAppStatus[] = ["INITIALIZING", "RECONNECTING", "CONNECTED"]

/** Everything about the connection, one layout per state. */
export function WhatsAppConnectionPanel({
  snapshot,
}: {
  snapshot: WhatsAppSnapshotDTO
}) {
  const status = snapshot.status as WhatsAppStatus

  if (!snapshot.enabled) {
    return (
      <Card>
        <CardContent className="text-muted-foreground text-sm">
          A integração está desativada. Defina WHATSAPP_ENABLED=true no
          .env.local e reinicie o CRM.
        </CardContent>
      </Card>
    )
  }

  if (status === "READY" || status === "SYNCING") {
    return (
      <Card className="py-4">
        <CardContent className="space-y-3">
          <ConnectedBar snapshot={snapshot} />
          {status === "SYNCING" ? <SyncingState snapshot={snapshot} /> : null}
        </CardContent>
      </Card>
    )
  }

  if (status === "QR_REQUIRED") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="space-y-1">
            <p className="font-medium">Escaneie o QR Code pelo WhatsApp</p>
            <p className="text-muted-foreground text-sm">
              No celular: Configurações → Aparelhos conectados → Conectar um
              aparelho.
            </p>
          </div>
          {snapshot.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL
            <img
              src={snapshot.qr}
              alt="QR Code para conectar o WhatsApp"
              className="size-64 rounded-md border bg-white p-2"
            />
          ) : (
            <div className="bg-muted flex size-64 items-center justify-center rounded-md">
              <QrCode className="text-muted-foreground size-10" />
            </div>
          )}
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Aguardando conexão...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (WORKING.includes(status)) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {status === "RECONNECTING"
            ? "Conexão perdida. Reconectando..."
            : "Conectando WhatsApp..."}
        </CardContent>
      </Card>
    )
  }

  // DISCONNECTED, LOGGED_OUT, ERROR
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium">WhatsApp desconectado</p>
          <p className="text-muted-foreground text-sm">
            {snapshot.error ??
              "Conecte sua conta para ver e responder conversas pelo CRM."}
          </p>
        </div>
        <ConnectButton
          label={status === "ERROR" ? "Tentar novamente" : "Conectar WhatsApp"}
        />
      </CardContent>
    </Card>
  )
}
