import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Baileys keeps sockets and native crypto; load it from node_modules
  // instead of bundling it. ffmpeg-static resolves its binary from its own
  // folder, which bundling would break.
  serverExternalPackages: ["baileys", "ffmpeg-static"],
}

export default nextConfig
