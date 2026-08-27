import {
  convertToModelMessages,
  toUIMessageStream,
  validateUIMessages,
  type ChatTransport,
  type Tool,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import { mergeMessagesById } from "../assistant/chat-message-state"
import { createWebMcpAgent } from "./agent"
import type { WebMcpSession } from "./session"

export type ChatHistoryLoader = () => Promise<UIMessage[]>

export class WebMcpChatTransport implements ChatTransport<UIMessage> {
  private readonly session: WebMcpSession
  private readonly loadHistory: ChatHistoryLoader

  constructor(session: WebMcpSession, loadHistory: ChatHistoryLoader) {
    this.session = session
    this.loadHistory = loadHistory
  }

  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]) {
    const history = await this.loadHistory()
    const turn = await this.session.prepareTurn(abortSignal)
    const agent = createWebMcpAgent(turn)
    const validationTools = agent.tools as Record<string, Tool<unknown, unknown>>
    const mergedMessages = mergeMessagesById(history, messages)
    const validatedMessages = await validateUIMessages<UIMessage>({ messages: mergedMessages, tools: validationTools })
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
