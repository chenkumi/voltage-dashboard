import { Agent } from "@/app/agent/agent-impl-openai";
import { chatDb } from "@/app/db";
import { AssistantDatasource } from "./assistant-datasource";

export const dexieAssistantDatasource: AssistantDatasource = {
    listThreads: async () => {
        return await chatDb.threads.toArray();
    },

    listMessages: async (threadId) => {
        return await chatDb.messages.filter(message => message.threadId === threadId).toArray();
    },

    listLogs: async (threadId) => {
        return await chatDb.contentLogs.where("threadId").equals(threadId).toArray();
    },

    createThread: async (input) => {
        await chatDb.threads.put(input);
    },

    updateThread: async (threadId, patch) => {
        await chatDb.threads.update(threadId, patch);
    },

    deleteThread: async (threadId) => {
        await chatDb.transaction("rw", chatDb.threads, chatDb.messages, async () => {
            await chatDb.threads.delete(threadId);
            await chatDb.messages.where("threadId").equals(threadId).delete();
        });
    },

    saveInputMessage: async (message) => {
        await chatDb.transaction("rw", chatDb.messages, async () => {
            await chatDb.messages
                .where("threadId")
                .equals(message.threadId)
                .and(candidate => candidate.state === "input" || candidate.state === "output")
                .delete();
            await chatDb.messages.put(message);
        });
    },

    saveOutputMessage: async (message) => {
        await chatDb.messages.put(message);
    },

    removeMessage: async (id) => {
        await chatDb.messages.delete(id);
    },

    commitMessage: async (threadId, msgId) => {
        await chatDb.transaction("rw", chatDb.messages, async () => {
            await chatDb.messages.where("[threadId+msgId]").equals([threadId, msgId]).modify({ state: "log" });
        });
    },

    deleteMessagesFrom: async (threadId, messageId) => {
        await chatDb.transaction("rw", chatDb.messages, async () => {
            await chatDb.messages
                .where("threadId")
                .equals(threadId)
                .and(message => message.id >= messageId)
                .delete();
        });
    },

    branchThread: async ({ thread, messages }) => {
        await chatDb.transaction("rw", chatDb.threads, chatDb.messages, async () => {
            await chatDb.threads.put(thread);
            if (messages.length > 0) {
                await chatDb.messages.bulkAdd(messages);
            }
        });
    },

    rejectLatestAssistantOutput: async (threadId, msgId, reason) => {
        const messages = await chatDb.messages
            .where("[threadId+msgId]")
            .equals([threadId, msgId])
            .filter(message => message.role === "assistant")
            .toArray();

        messages.sort((a, b) => b.createdAt - a.createdAt);
        const latest = messages[0];
        if (!latest) {
            return;
        }

        const latestContent = latest.content[latest.content.length - 1] ?? { id: Agent.genId() };

        await chatDb.messages.put({
            ...latest,
            content: [
                ...latest.content.slice(0, -1),
                {
                    ...latestContent,
                    text: `輸出已否決：${reason}`,
                    metadata: {
                        ...latestContent.metadata,
                        formatError: true,
                        reviewRejected: true,
                    },
                },
            ],
        });
    },
};
