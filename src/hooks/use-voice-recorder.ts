"use client"

import * as React from "react"

/** Formats the browser can record, best first; the server converts any. */
const PREFERRED_TYPES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
]

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

export type VoiceRecording = { blob: Blob; seconds: number }

/**
 * Records from the microphone, like WhatsApp's hold-to-talk but with
 * explicit start, stop and cancel. The microphone is released as soon as
 * the recording ends.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = React.useState(false)
  const [seconds, setSeconds] = React.useState(0)
  const recorder = React.useRef<MediaRecorder | null>(null)
  const chunks = React.useRef<Blob[]>([])
  const startedAt = React.useRef(0)
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const release = React.useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    recorder.current?.stream.getTracks().forEach((track) => track.stop())
    recorder.current = null
    setRecording(false)
    setSeconds(0)
  }, [])

  // Leaving the chat mid-recording must not keep the microphone open.
  React.useEffect(() => release, [release])

  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"

  const start = React.useCallback(async () => {
    if (recorder.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = pickMimeType()
    const next = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.start()
    recorder.current = next
    startedAt.current = Date.now()
    setRecording(true)
    setSeconds(0)
    timer.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 250)
  }, [])

  /** Ends the recording and hands it over; null if nothing was captured. */
  const stop = React.useCallback(async (): Promise<VoiceRecording | null> => {
    const current = recorder.current
    if (!current) return null
    const duration = (Date.now() - startedAt.current) / 1000
    const done = new Promise<void>((resolve) => {
      current.onstop = () => resolve()
    })
    current.stop()
    await done
    const blob = new Blob(chunks.current, {
      type: current.mimeType || "audio/webm",
    })
    release()
    return blob.size > 0 ? { blob, seconds: duration } : null
  }, [release])

  const cancel = React.useCallback(() => {
    const current = recorder.current
    if (current && current.state !== "inactive") current.stop()
    chunks.current = []
    release()
  }, [release])

  return { supported, recording, seconds, start, stop, cancel }
}
