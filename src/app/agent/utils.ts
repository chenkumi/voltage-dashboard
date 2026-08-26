import { ModelContent, ModelMessage, ModelMessageContentView} from "../types";

export const isTextOnly = (content: ModelContent) => {
    return !!(content.text && !content.images && !content.audios && !content.tools && !content.reasoning);
}

export const readText = (content: ModelContent): string => {
    return content.text || "";
}

export const normalizeContents = (content: ModelContent | ModelContent[]): ModelContent[] => {
    return Array.isArray(content) ? content : [content];
}

export const getLatestContent = (content: ModelContent | ModelContent[]): ModelContent => {
    const contents = normalizeContents(content);
    return contents[contents.length - 1] ?? { id: "" };
}

export const flattenMessages = (messages: ModelMessage[]): ModelMessageContentView[] => {
    return messages.flatMap(message => normalizeContents(message.content).map(content => ({
        msgId: message.msgId,
        id: content.id || message.id,
        messageId: message.id,
        role: message.role,
        content,
    })));
}

export const escapeText = (text:string) =>{
    const escapedContent = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escapedContent;
}
