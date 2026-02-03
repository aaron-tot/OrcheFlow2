import z from "zod"
import { Tool } from "../domain/Tool"
import { Session } from "../../agents/infrastructure"
import DESCRIPTION from "./retitle.txt"

export const RetitleTool = Tool.define("retitle", {
  description: DESCRIPTION,
  parameters: z.object({
    title: z.string().max(50).describe("The new title for the session (max 50 characters)"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "retitle",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const session = await Session.get(ctx.sessionID)
    
    await Session.update(ctx.sessionID, (draft) => {
      draft.title = params.title
    })

    return {
      title: "Session retitled",
      output: `Updated session title from "${session.title}" to "${params.title}"`,
      metadata: {
        oldTitle: session.title,
        newTitle: params.title,
      },
    }
  },
})

