const BOOT_RETRY_FIRST_MS = 5_000
const BOOT_RETRY_MAX_MS = 5 * 60_000

/**
 * Keeps trying a boot step until it works. The database may still be out of
 * reach when the server starts (network not up yet, IP not allowed), and a
 * boot that gave up would leave the send queues off until a restart.
 */
export function bootWithRetry(
  label: string,
  boot: () => Promise<void>,
  delayMs = BOOT_RETRY_FIRST_MS
): void {
  void boot().catch((error) => {
    console.error(
      `[${label}] falha ao iniciar; tentando de novo em ${Math.round(delayMs / 1000)}s`,
      error
    )
    const timer = setTimeout(
      () =>
        bootWithRetry(label, boot, Math.min(delayMs * 2, BOOT_RETRY_MAX_MS)),
      delayMs
    )
    timer.unref?.()
  })
}
