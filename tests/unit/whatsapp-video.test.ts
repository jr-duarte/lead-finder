import { describe, expect, it } from "vitest"

import { mediaExtension, outgoingMediaKind } from "@/domain/whatsapp"
import { mp4Seconds } from "@/lib/media/video"

describe("outgoingMediaKind", () => {
  it("manda vídeos como vídeo", () => {
    expect(outgoingMediaKind("video/mp4")).toBe("video")
    expect(outgoingMediaKind("video/quicktime")).toBe("video")
  })

  it("mantém webm como áudio, que é como alguns navegadores gravam voz", () => {
    expect(outgoingMediaKind("video/webm")).toBe("audio")
    expect(outgoingMediaKind("audio/webm;codecs=opus")).toBe("audio")
  })

  it("aceita só as imagens que o WhatsApp mostra", () => {
    expect(outgoingMediaKind("image/png")).toBe("image")
    expect(outgoingMediaKind("image/gif")).toBeNull()
  })
})

describe("mediaExtension", () => {
  it("conhece os formatos de vídeo", () => {
    expect(mediaExtension("video/mp4")).toBe("mp4")
    expect(mediaExtension("video/quicktime")).toBe("mov")
  })
})

describe("mp4Seconds", () => {
  const mvhd = (version: 0 | 1, timescale: number, duration: number) => {
    const box = Buffer.alloc(40)
    box.write("mvhd", 0)
    box[4] = version
    if (version === 1) {
      box.writeUInt32BE(timescale, 24)
      box.writeBigUInt64BE(BigInt(duration), 28)
    } else {
      box.writeUInt32BE(timescale, 16)
      box.writeUInt32BE(duration, 20)
    }
    return Buffer.concat([Buffer.from("....moov"), box])
  }

  it("lê a duração do cabeçalho do filme", () => {
    expect(mp4Seconds(mvhd(0, 1000, 12_400))).toBe(12)
    expect(mp4Seconds(mvhd(1, 90_000, 450_000))).toBe(5)
  })

  it("devolve undefined quando não acha o cabeçalho", () => {
    expect(mp4Seconds(Buffer.from("nada aqui"))).toBeUndefined()
    expect(mp4Seconds(Buffer.from("mvhd"))).toBeUndefined()
  })
})
