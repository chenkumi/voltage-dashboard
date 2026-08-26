import { z } from "zod"

export const ReturnTypeSchema = z.enum([
  "void",
  "number",
  "boolean",
  "string",
  "array",
  "object",
])

export const InputSchema = z.object({
  jscode: z
    .string()
    .describe(
      'The JavaScript code to execute. You can read parameters from "args" and put the result in "response".'
    ),
  returnType: ReturnTypeSchema.describe(
    'Expected type of the final response value. Use "void" only when no data should be returned.'
  ),
  args: z
    .record(z.string(), z.any())
    .optional()
    .describe("Arguments to be passed to the code."),
})

export type ToolArgs = z.infer<typeof InputSchema>
export type JavaScriptReturnType = z.infer<typeof ReturnTypeSchema>
