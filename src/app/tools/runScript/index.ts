import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common"
import { executor } from "./executor"
import { InputSchema } from "./types"

const TOOL_NAME = "runScript"

const TOOL_DESCRIPTION = `Execute JavaScript code to calculate results or process data.`

const TOOL_PROMPT = `Use for deterministic logic, parsing, counting, transformation, math, simulation, or verification tasks.`

const TOOL_RULES = [
  `Pass code in "jscode", expected output type in "returnType", and parameters in "args".`,
  `Inside the code, read from "args" and return the final result from every execution path.`,
  `Do not leave any branch without return; add a final fallback return when using if/switch/try control flow.`,
  `Code is formatted, parsed, and permission-checked before execution; fix the reported snippet if validation fails.`,
  `Tools listed in javascriptTools are available as async functions inside the sandbox. Use await when calling them.`,
  `Sandbox tool functions accept either an argument object or a supported shorthand, for example await readFile("root/README.md").`,
  `Do not use eval, Function, import, require, global objects, computed function calls, constructor, or prototype access.`,
  `Set "returnType" to one of: void, number, boolean, string, array, object.`,
  `Use "void" only when the code intentionally returns no data.`,
]

const TOOL_EXAMPLES = [
  `javascript({ "jscode": "return args.a + args.b;", "returnType": "number", "args": { "a": 1, "b": 2 } }) -> 3`,
  `javascript({ "jscode": "const file = await readFile('root/README.md'); return file.content;", "returnType": "string" })`,
]

const Tool: AgentTool = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  prompt: TOOL_PROMPT,
  rules: TOOL_RULES,
  examples: TOOL_EXAMPLES,
  inputSchema: InputSchema,
  executor: async (props: AgentExecutorProps) => {
    const { args } = props
    const validation = InputSchema.safeParse(args)
    if (!validation.success) {
      return {
        status: "error",
        code: 400,
        data: null,
        error: {
          type: "INVALID_ARGUMENTS",
          message: "ARGUMENTS FORMAT ERROR",
          raw_details: validation.error.format(),
        },
      }
    }

    const response = await executor(props, validation.data)
    return response
  },
}

export default Tool
