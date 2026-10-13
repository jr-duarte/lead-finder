import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootWithRetry } from "@/lib/boot-retry"

describe("bootWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("tries again with a growing delay until the boot works", async () => {
    const boot = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("db offline"))
      .mockRejectedValueOnce(new Error("db offline"))
      .mockResolvedValue(undefined)

    bootWithRetry("teste", boot, 1_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(boot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(boot).toHaveBeenCalledTimes(2)

    // Second wait doubles.
    await vi.advanceTimersByTimeAsync(1_999)
    expect(boot).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(boot).toHaveBeenCalledTimes(3)

    // Worked: no more attempts.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(boot).toHaveBeenCalledTimes(3)
  })
})
