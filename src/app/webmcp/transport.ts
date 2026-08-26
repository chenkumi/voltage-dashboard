import {
  convertToModelMessages,
  toUIMessageStream,
  validateUIMessages,
  type ChatTransport,
  type Tool,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import { createWebMcpAgent } from "./agent"

export class WebMcpChatTransport implements ChatTransport<UIMessage> {
  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) {
    const agent = await createWebMcpAgent()
    const validationTools = agent.tools as Record<string, Tool<unknown, unknown>>
    const validatedMessages = await validateUIMessages<UIMessage>({ messages, tools: validationTools })
    const modelMessages = await convertToModelMessages(validatedMessages, { tools: agent.tools })
    const result = await agent.stream({ prompt: modelMessages, abortSignal })

    return toUIMessageStream({
      stream: result.stream,
      tools: agent.tools,
      sendReasoning: true,
    }) as ReadableStream<UIMessageChunk>
  }

  async reconnectToStream() {
    return null
  }
}
