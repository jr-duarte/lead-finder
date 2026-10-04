import type { FollowUp } from "@/domain/follow-up"
import { followUpRepository } from "@/repositories/follow-up.repository"
import { followUpMessageService } from "@/services/follow-up/message"
import { unsentVerdict } from "@/services/follow-up/watch"

/**
 * Writes follow-up messages one at a time through the local Claude Code CLI,
 * like campaign messages. Each one then waits for the user's approval.
 */

const globalForGenerator = globalThis as typeof globalThis & {
  __leadFinderFollowUpGenerator?: { running: boolean }
}
const state = globalForGenerator.__leadFinderFollowUpGenerator ?? {
  running: false,
}
globalForGenerator.__leadFinderFollowUpGenerator = state

function log(message: string) {
  console.info(`[follow-up] ${message}`)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function generate(followUp: FollowUp): Promise<void> {
  // The lead may have answered, or been moved, while it waited in line.
  const verdict = await unsentVerdict(followUp)
  if (verdict) {
    await followUpRepository.transition(followUp.id, ["GENERATING"], verdict)
    return
  }

  let message: string
  try {
    message = await followUpMessageService.write(followUp)
  } catch (error) {
    await followUpRepository.transition(followUp.id, ["GENERATING"], {
      status: "FAILED",
      reason: errorMessage(error, "Não foi possível gerar a mensagem."),
    })
    return
  }
  await followUpRepository.transition(
    followUp.id,
    ["GENERATING"],
    message
      ? { status: "READY", message, reason: undefined }
      : { status: "FAILED", reason: "O Claude não escreveu a mensagem." }
  )
}

async function run(): Promise<void> {
  for (;;) {
    const followUp = await followUpRepository.claimNext("PENDING", "GENERATING")
    if (!followUp) break
    log(`gerando follow-up para ${followUp.businessName}`)
    try {
      await generate(followUp)
    } catch (error) {
      console.error("[follow-up] falha ao gerar", error)
      await followUpRepository.transition(followUp.id, ["GENERATING"], {
        status: "FAILED",
        reason: errorMessage(error, "Erro inesperado ao gerar a mensagem."),
      })
    }
  }
}

export const followUpGenerator = {
  /** Starts the generator unless it is already running; never blocks. */
  kick(): void {
    if (state.running) return
    state.running = true
    void run()
      .catch((error) =>
        console.error("[follow-up] geração interrompida", error)
      )
      .finally(() => {
        state.running = false
      })
  },

  /** After a restart: follow-ups caught mid-generation go back in line. */
  async recover(): Promise<void> {
    for (const followUp of await followUpRepository.listByStatus([
      "GENERATING",
    ])) {
      await followUpRepository.transition(followUp.id, ["GENERATING"], {
        status: "PENDING",
      })
    }
  },

  isRunning(): boolean {
    return state.running
  },
}
