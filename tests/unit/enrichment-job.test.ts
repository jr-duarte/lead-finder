import { describe, expect, it } from "vitest"

import {
  computeJobProgress,
  isJobStale,
  isJobTerminal,
} from "@/domain/enrichment-job"

describe("computeJobProgress", () => {
  it("returns the percentage processed", () => {
    expect(computeJobProgress(47, 100)).toBe(47)
    expect(computeJobProgress(1, 3)).toBe(33)
  })

  it("caps at 100 and handles an empty job", () => {
    expect(computeJobProgress(120, 100)).toBe(100)
    expect(computeJobProgress(0, 0)).toBe(0)
  })
})

describe("isJobTerminal", () => {
  it("separates finished from active statuses", () => {
    expect(isJobTerminal("COMPLETED")).toBe(true)
    expect(isJobTerminal("FAILED")).toBe(true)
    expect(isJobTerminal("CANCELLED")).toBe(true)
    expect(isJobTerminal("RUNNING")).toBe(false)
    expect(isJobTerminal("PENDING")).toBe(false)
  })
})

describe("isJobStale", () => {
  const now = new Date("2026-01-01T12:00:00Z")
  const staleAfter = 2 * 60 * 1000

  it("flags a running job whose heartbeat stopped", () => {
    const job = {
      status: "RUNNING" as const,
      heartbeatAt: new Date("2026-01-01T11:55:00Z"),
    }
    expect(isJobStale(job, staleAfter, now)).toBe(true)
  })

  it("does not flag a job that is still beating", () => {
    const job = {
      status: "RUNNING" as const,
      heartbeatAt: new Date("2026-01-01T11:59:30Z"),
    }
    expect(isJobStale(job, staleAfter, now)).toBe(false)
  })

  it("flags a job that never recorded a heartbeat", () => {
    expect(isJobStale({ status: "PENDING" }, staleAfter, now)).toBe(true)
  })

  it("never flags an already finished job", () => {
    const job = {
      status: "COMPLETED" as const,
      heartbeatAt: new Date("2020-01-01T00:00:00Z"),
    }
    expect(isJobStale(job, staleAfter, now)).toBe(false)
  })
})
