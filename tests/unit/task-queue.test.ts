import { describe, expect, it } from "vitest"

import { TaskQueue } from "@crawler/queue/task-queue"

describe("TaskQueue", () => {
  it("never exceeds the configured concurrency", async () => {
    const queue = new TaskQueue(2)
    let active = 0
    let peak = 0

    const task = () => async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return true
    }

    await queue.addAll(Array.from({ length: 6 }, task))

    expect(peak).toBeLessThanOrEqual(2)
  })

  it("preserves the input order in the results", async () => {
    const queue = new TaskQueue(3)

    const results = await queue.addAll(
      [30, 10, 20].map((delay, index) => async () => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        return index
      })
    )

    expect(results).toEqual([0, 1, 2])
  })

  it("releases its slot when a task throws", async () => {
    const queue = new TaskQueue(1)

    await expect(
      queue.add(async () => {
        throw new Error("falhou")
      })
    ).rejects.toThrow("falhou")

    // A slot must still be available for the next task.
    await expect(queue.add(async () => "ok")).resolves.toBe("ok")
  })

  it("spaces out task starts by the configured delay", async () => {
    const queue = new TaskQueue(1, 40)
    const startedAt: number[] = []

    await queue.addAll(
      Array.from({ length: 3 }, () => async () => {
        startedAt.push(Date.now())
      })
    )

    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(35)
    expect(startedAt[2] - startedAt[1]).toBeGreaterThanOrEqual(35)
  })
})
