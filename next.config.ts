import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Baileys keeps sockets and native crypto; load it from node_modules
  // instead of bundling it.
  serverExternalPackages: ["baileys"],
}

export default nextConfig
