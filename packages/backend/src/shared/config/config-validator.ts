/**
 * Config Validator: Validation and error handling
 * Split from config.ts for better maintainability and token efficiency
 */
import z from "zod"
import { NamedError } from "@opencode-ai/util"
import { type ParseError as JsoncParseError, parse as parseJsonc, printParseErrorCode } from "jsonc-parser"
import { Info } from "./config-types"

// ============================================================================
// Error Types
// ============================================================================

export const JsonError = NamedError.create(
  "ConfigJsonError",
  z.object({
    path: z.string(),
    message: z.string().optional(),
  }),
)

export const ConfigDirectoryTypoError = NamedError.create(
  "ConfigDirectoryTypoError",
  z.object({
    path: z.string(),
    dir: z.string(),
    suggestion: z.string(),
  }),
)

export const InvalidError = NamedError.create(
  "ConfigInvalidError",
  z.object({
    path: z.string(),
    issues: z.custom<z.core.$ZodIssue[]>().optional(),
    message: z.string().optional(),
  }),
)

// ============================================================================
// Validation Functions
// ============================================================================

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function parseConfig(text: string, filepath: string): Info {
  const errors: JsoncParseError[] = []
  const data = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    const lines = text.split("\n")
    const errorDetails = errors
      .map((e) => {
        const beforeOffset = text.substring(0, e.offset).split("\n")
        const line = beforeOffset.length
        const column = beforeOffset[beforeOffset.length - 1].length + 1
        const problemLine = lines[line - 1]

        const error = `${printParseErrorCode(e.error)} at line ${line}, column ${column}`
        if (!problemLine) return error

        return `${error}\n   Line ${line}: ${problemLine}\n${"".padStart(column + 9)}^`
      })
      .join("\n")

    throw new JsonError({
      path: filepath,
      message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${errorDetails}\n--- End ---`,
    })
  }

  const parsed = Info.safeParse(data)
  if (parsed.success) return parsed.data

  throw new InvalidError({
    path: filepath,
    issues: parsed.error.issues,
  })
}
