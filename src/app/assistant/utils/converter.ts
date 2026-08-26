import { AgentCommon } from "@/app/agent/agent-common";
import { Agent } from "@/app/agent/agent-impl-openai";
import { flattenMessages, getLatestContent } from "@/app/agent/utils";
import { ModelContent, ModelMessage, ModelMessageContentView, ModelTool, ModelThreadMessage } from "@/app/types";
import type { GenerateMessage, GenerateMessageContent } from "@/lib/llm-types";
import { ModelThreadMessagePart } from "../../types";
import { generateCallId } from "./id-gen";
import { parseJson } from "./json-util";

export const convertToParts = (messages:ModelThreadMessage[])=>{
    const parts: ModelThreadMessagePart[] = [];
    const filteredMessages = messages.filter(m => (m.role === 'user' || m.role === 'assistant'));
    filteredMessages.forEach(m => {

        const { content, ...mProps } = m;
        let filteredContent = content;
        const originalLastIndex = filteredContent.length - 1;
        if (filteredContent.length > 1) {
            filteredContent = filteredContent.filter((c, i) => {
                if (i < originalLastIndex) {
                    const text = c.text ?? "";
                    if (text.length === 0) {
                        return false;
                    }
                }
                return true;
            });
        }

        const lastIndex = filteredContent.length - 1;
        filteredContent.forEach((c, i) => {
            const last = (i === lastIndex);
            const part: ModelThreadMessagePart = {
                ...c,
                ...mProps,
                messageId: m.id,
                contentId: c.id,
                content: c,
                number: i,
                last
            };
            parts.push(part);
        });
    });

    return parts;
}
/**
 * 轉換 UI 的 ThreadMessage[] 格式至 WebWorker 所需的 ChatMessage[]
 */
export const convertToChatContent = (content: ModelContent): string | GenerateMessageContent[] => {
    if (content.text && !content.audios && !content.images && !content.reasoning && !content.tools) {
        return content.text;
    }
    else if (content.tools) {
        let toolContent = '';
        if (content.reasoning) {
            toolContent += `<|channel>thought\n${content.reasoning}\n<channel|>`;
        }

        if (content.tools) {
            for (const t of content.tools) {
                const inputStr = JSON.stringify(t.input).replaceAll('"', '<|"|>');
                toolContent += `<|tool_call>call:${t.name}${inputStr}<tool_call|>`;

                if (t.output) {
                    const outputStr = JSON.stringify(t.output).replaceAll('"', '<|"|>');
                    toolContent += `<|tool_response>response:${t.name}${outputStr}<|tool_response>`;
                }
            }
        }

        return toolContent;
    }
    else {
        const buffer: GenerateMessageContent[] = [];
        if (content.images) {
            for (const url of content.images) {
                buffer.push({ type: 'image', image: url });
            }
        }

        if (content.audios) {
            for (const url of content.audios) {
                buffer.push({ type: 'audio', audio: url });
            }
        }

        if (content.text) {
            buffer.push({ type: 'text', text: content.text });
        }
        return buffer;
    }
}

export const convertToChatMessages = (messages: ModelThreadMessage[]): GenerateMessage[] => {
    return messages.map(m => {
        const { role } = m;
        const content = getLatestContent(m.content);
        return {
            role,
            content: convertToChatContent(content),
        };
    });
};

// // 使用範例
// const callId = generateCallId("getUserData", JSON.stringify({ id: 123 }));
// console.log(callId); // 輸出類似: "a1b2c3d4"

export const convertToMessageContent = (delta: string) => {
    let processing = delta.trim();
    let reasoning = "";
    let text = "";
    const tools: ModelTool[] = [];
    let tool: ModelTool | null = null;

    let finish = false;

    try {
        {
            const tag_start = '<|turn>';
            const tag_end = '<turn|>';
            const start_i = processing.indexOf(tag_start);
            if (start_i != -1) {
                processing = processing.substring(start_i + tag_start.length);
            }

            const end_i = processing.lastIndexOf(tag_end);
            if (end_i != -1) {
                processing = processing.substring(0, end_i);
            }
        }

        console.log("processing 1:", processing);
        if (!finish) {
            const tag_start = '<|channel>'
            const tag_end = '<channel|>'
            const throughtWord = 'thought';
            if (processing.startsWith(tag_start)) {
                console.log("test point");
                processing = processing.substring(tag_start.length).trim();
                const part_i = processing.indexOf(tag_end);
                if (part_i == -1) {
                    console.log("thought not completed");
                    // 還沒串流完channel , 沒有其他part
                    reasoning = processing.trim();
                    finish = true;
                }
                else {

                    console.log(`thought completed:${part_i}`);
                    let part = processing.substring(0, part_i).trim();
                    processing = processing.substring(part_i + tag_end.length).trim();
                    if (part.startsWith(throughtWord)) {
                        part = part.substring(throughtWord.length).trim();
                    }
                    reasoning = part.trim();
                }
            }
        }

        console.log("processing 2:", processing);

        if (!finish) {

            const tag_start = '<|tool_call>'
            const tag_end = '<tool_call|>'

            if (processing.startsWith(tag_start)) {
                processing = processing.substring(tag_start.length).trim();
                const part_i = processing.indexOf(tag_end);
                if (part_i == -1) {
                    // 工具還沒串流結束，中止
                    finish = true;
                }
                else {
                    const part = processing.substring(0, part_i).trim();
                    processing = processing.substring(part_i + tag_end.length).trim();

                    const contentStart = part.indexOf('{');
                    if (contentStart == -1) {
                        finish = true;
                    }
                    else {
                        let name = part.substring(0, contentStart);
                        let content = part.substring(contentStart);
                        if (name.startsWith('call:')) {
                            name = name.substring(5);
                        }

                        try {
                            const input_hash = generateCallId(name, content);
                            content = content.replaceAll('<|"|>', '"');
                            const input = parseJson(content);
                            const toolCallId = `call_${input_hash}`;
                            tool = {
                                id: toolCallId,
                                name,
                                input,
                            };
                        }
                        catch (e) {
                            console.error(e);
                            finish = true;
                        }
                    }
                }
            }
        }

        // console.log("processing 3:", processing);

        if (!finish) {
            const tag_start = '<|tool_response>';
            const tag_end = '<tool_response|>';

            if (processing.startsWith(tag_start)) {

                processing = processing.substring(tag_start.length).trim();
                const part_i = processing.indexOf(tag_end);
                if (part_i == -1) {
                    // 工具還沒串流結束，中止
                    finish = true;
                }
                else {
                    const part = processing.substring(0, part_i).trim();
                    processing = processing.substring(part_i + tag_end.length).trim();

                    const contentStart = part.indexOf('{');
                    if (contentStart == -1) {
                        finish = true;
                    }
                    else {
                        let name = part.substring(0, contentStart);
                        let content = part.substring(contentStart);
                        if (name.startsWith('response:')) {
                            name = name.substring(5);
                        }

                        try {
                            content = content.replaceAll('<|"|>', '"');
                            const output = parseJson(content);
                            if (tool) {
                                tool = {
                                    ...tool,
                                    output
                                }

                                tools.push(tool);
                                tool = null;
                            }
                        }
                        catch (e) {
                            console.error(e);
                            finish = true;
                        }
                    }
                }
            }
        }

        if (!finish) {
            text = processing.trim();
        }

        console.log("text:", text);
    }
    catch (e) {
        console.error(e);
    }

    const content: ModelContent = {
        id: Agent.genId(),
        reasoning,
        text,
        tools
    };

    return content;
}

// 建立交談紀錄
// 1. 只能有文字
// 2. retention!=until-response
// 3. 最後一則role必須為assistant(等待user輸入)
export const convertToHistory = (messages: ModelMessage[]) => {
    const filtered_messages: ModelMessageContentView[] = flattenMessages(messages)
        .filter(m => {
            const { content } = m;
            if (content.retention === 'until-response') {
                return false;
            }

            return Boolean(
                content.text
                || content.value
                || (content.images && content.images.length > 0)
                || (content.audios && content.audios.length > 0)
                || (content.tools && content.tools.length > 0)
            );
        })
        .map(m => {
            const { msgId, id, role, content } = m;
            const content_id = content.id ?? AgentCommon.genId();
            const historyContent: ModelContent = { ...content };
            delete historyContent.reasoning;
            return { msgId, id, role, content: { ...historyContent, id: content_id } };
        });

    let final_messages: ModelMessageContentView[] = filtered_messages;

    while (final_messages.length > 0 && final_messages[final_messages.length - 1].role === 'user') {
        final_messages = final_messages.slice(0, -1);
    }

    return final_messages;
}
