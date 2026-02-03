/**
 * Prompt Routes - System prompt management
 * Purpose: Handles listing, selecting, and retrieving system prompts
 */
import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { errors } from "../../../app/error.js"

export function PromptRoutes() {
  const app = new Hono()

  return app
    .get(
      "/list",
      describeRoute({
        summary: "List system prompts",
        description: "Get all available system prompt files",
        operationId: "prompt.list",
        responses: {
          200: {
            description: "Array of prompt filenames",
            content: {
              "application/json": {
                schema: resolver(z.string().array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const { SystemPrompt } = await import("../../agents/infrastructure/system.js")
        const prompts = await SystemPrompt.listPrompts()
        return c.json(prompts)
      },
    )
    .get(
      "/selected",
      describeRoute({
        summary: "Get selected prompt",
        description: "Get the currently selected system prompt name",
        operationId: "prompt.getSelected",
        responses: {
          200: {
            description: "Selected prompt name or null",
            content: {
              "application/json": {
                schema: resolver(z.string().nullable()),
              },
            },
          },
        },
      }),
      async (c) => {
        const { SystemPrompt } = await import("../../agents/infrastructure/system.js")
        const selected = await SystemPrompt.getSelectedPrompt()
        return c.json(selected)
      },
    )
    .post(
      "/select",
      describeRoute({
        summary: "Set selected system prompt",
        description: "Set the system prompt to use for new conversations",
        operationId: "prompt.setSelected",
        responses: {
          200: {
            description: "Prompt selected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          prompt: z.string(),
        }),
      ),
      async (c) => {
        const { prompt } = c.req.valid("json")
        const { SystemPrompt } = await import("../../agents/infrastructure/system.js")
        await SystemPrompt.setSelectedPrompt(prompt)
        return c.json(true)
      },
    )
}
