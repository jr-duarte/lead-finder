/**
 * Minimal in-process task queue with bounded concurrency and an optional
 * delay between task starts (politeness when hitting public endpoints).
 *
 * Deliberately dependency-free: the system runs locally and does not need a
 * broker.
 */
export class TaskQueue {
  private readonly concurrency: number
  private readonly delayMs: number
  private active = 0
  private lastStartedAt = 0
  private readonly pending: (() => void)[] = []

  constructor(concurrency = 2, delayMs = 0) {
    this.concurrency = Math.max(1, concurrency)
    this.delayMs = Math.max(0, delayMs)
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()

    try {
      if (this.delayMs > 0) {
        const wait = this.lastStartedAt + this.delayMs - Date.now()
        if (wait > 0) {
          await sleep(wait)
        }
      }
      this.lastStartedAt = Date.now()
      return await task()
    } finally {
      this.release()
    }
  }

  /** Runs every task, preserving input order in the results. */
  async addAll<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
    return Promise.all(tasks.map((task) => this.add(task)))
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1
      return
    }

    await new Promise<void>((resolve) => {
      this.pending.push(resolve)
    })
    this.active += 1
  }

  private release(): void {
    this.active -= 1
    const next = this.pending.shift()
    if (next) next()
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
