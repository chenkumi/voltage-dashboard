import { AgentCommon } from "@/app/agent/agent-common"
import { flattenMessages } from "@/app/agent/utils"
import type { ModelContent, ModelMessage, ModelMessageContentView, ModelThreadMessage } from "@/app/types"
import type { ModelThreadMessagePart } from "../../types"

export const convertToParts = (messages: ModelThreadMessage[]) => {
  const parts: ModelThreadMessagePart[] = []
  const filteredMessages = messages.filter((message) => message.role === "user" || message.role === "assistant")

  filteredMessages.forEach((message) => {
    const { content, ...messageProps } = message
    let filteredContent = content
    const originalLastIndex = filteredContent.length - 1

    if (filteredContent.length > 1) {
      filteredContent = filteredContent.filter((contentBlock, index) => {
        if (index < originalLastIndex && !(contentBlock.text ?? "")) {
          return false
        }
        return true
      })
    }

    const lastIndex = filteredContent.length - 1
    filteredContent.forEach((contentBlock, index) => {
      parts.push({
        ...contentBlock,
        ...messageProps,
        messageId: message.id,
        contentId: contentBlock.id,
        content: contentBlock,
        number: index,
        last: index === lastIndex,
      })
    })
  })

  return parts
}

// 建立交談紀錄：只保留已完成的文字、媒體與工具結果，並等待下一次 user input。
export const convertToHistory = (messages: ModelMessage[]) => {
  const filteredMessages: ModelMessageContentView[] = flattenMessages(messages)
    .filter(({ content }) => {
      if (content.retention === "until-response") {
        return false
      }

      return Boolean(
        content.text
        || content.value
        || (content.images && content.images.length > 0)
        || (content.audios && content.audios.length > 0)
        || (content.tools && content.tools.length > 0),
      )
    })
    .map(({ msgId, id, role, content }) => {
      const contentId = content.id ?? AgentCommon.genId()
      const historyContent: ModelContent = { ...content }
      delete historyContent.reasoning

      return { msgId, id, role, content: { ...historyContent, id: contentId } }
    })

  let finalMessages = filteredMessages
  while (finalMessages.length > 0 && finalMessages[finalMessages.length - 1].role === "user") {
    finalMessages = finalMessages.slice(0, -1)
  }

  return finalMessages
}
