import { spawn } from "node:child_process"
import { tmpdir } from "node:os"

/**
 * Runs Claude through the local Claude Code CLI in print mode (`claude -p`),
 * so generation uses the logged-in Claude plan instead of an API key. Only
 * works where Claude Code is installed and logged in, which is the case for
 * this local-only app.
 */

export type ClaudeCliOptions = {
  /** Executable; defaults to `claude` on PATH. */
  bin: string
  /** Alias ("opus", "sonnet") or full model name. */
  model: string
  timeoutMs: number
  systemPrompt: string
  /** JSON Schema the reply must match; the CLI validates it. */
  schema: Record<string, unknown>
}

export class ClaudeCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ClaudeCliError"
  }
}

/** The fields of `--output-format json` this module reads. */
type CliResult = {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
}

/**
 * Extracts the structured reply from the CLI's JSON output, turning every
 * failure shape into an error the UI can show.
 */
export function parseCliOutput(stdout: string): unknown {
  let parsed: CliResult
  try {
    parsed = JSON.parse(stdout) as CliResult
  } catch {
    throw new ClaudeCliError("O Claude Code devolveu uma resposta ilegível.")
  }

  if (parsed.is_error || parsed.subtype !== "success") {
    const detail =
      parsed.result?.trim() || parsed.subtype || "erro desconhecido"
    throw new ClaudeCliError(`O Claude Code falhou: ${detail}`)
  }

  if (parsed.structured_output === undefined) {
    throw new ClaudeCliError(
      "O Claude Code respondeu sem o formato esperado. Tente novamente."
    )
  }

  return parsed.structured_output
}

/** The prompt goes through stdin, which has no argument-length limit. */
export function runClaude(
  prompt: string,
  options: ClaudeCliOptions
): Promise<unknown> {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    options.model,
    "--system-prompt",
    options.systemPrompt,
    "--json-schema",
    JSON.stringify(options.schema),
    // Text in, text out: no tools, no MCP servers, no user or project
    // settings, and no session left behind for every generated message.
    "--tools",
    "",
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--no-session-persistence",
  ]

  return new Promise((resolve, reject) => {
    // Run outside the repo so no CLAUDE.md or project context leaks in.
    const child = spawn(options.bin, args, {
      cwd: tmpdir(),
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, options.timeoutMs)

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        new ClaudeCliError(
          error.code === "ENOENT"
            ? `Claude Code não encontrado ("${options.bin}"). Instale-o e faça login, ou ajuste CLAUDE_CLI_PATH.`
            : `Não foi possível iniciar o Claude Code: ${error.message}`
        )
      )
    })

    child.on("close", (code) => {
      clearTimeout(timer)

      if (timedOut) {
        reject(
          new ClaudeCliError(
            "O Claude demorou demais para responder. Tente novamente."
          )
        )
        return
      }

      // A failed run still prints its JSON result, which carries the reason.
      if (stdout.trim()) {
        try {
          resolve(parseCliOutput(stdout))
        } catch (error) {
          reject(error)
        }
        return
      }

      reject(
        new ClaudeCliError(
          `O Claude Code encerrou com código ${code}. ${stderr.trim().slice(0, 300)}`.trim()
        )
      )
    })

    child.stdin.end(prompt)
  })
}
