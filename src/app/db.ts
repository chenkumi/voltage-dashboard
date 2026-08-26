import { Dexie, EntityTable } from "dexie";
import { AgentSegmentState, ModelLog, ModelThread, ModelThreadMessage } from "./types";

export const chatDb = new Dexie('chat-db') as Dexie & {
    threads: EntityTable<ModelThread, "id">,
    messages: EntityTable<ModelThreadMessage, "id">,
    contentLogs: EntityTable<ModelLog, "id">,
    agentStates: EntityTable<AgentSegmentState, "id">,
};

chatDb.version(1).stores({
    threads: '++id, title',
    messages: '++id, threadId, msgId, [threadId+id], [role+id], [threadId+msgId]',
    contentLogs: '++id, threadId, [threadId+agent]',
});

chatDb.version(2).stores({
    threads: '++id, title',
    messages: '++id, threadId, segmentId, msgId, [threadId+id], [role+id], [threadId+msgId], [threadId+segmentId]',
    contentLogs: '++id, threadId, [threadId+agent]',
    agentStates: 'id, threadId, agentName, segmentId, status, [threadId+agentName], [threadId+status], [threadId+segmentId]',
}).upgrade(async tx => {
    await tx.table("messages").toCollection().modify((message: any) => {
        if (!message.segmentId && message.threadId) {
            message.segmentId = `legacy:${message.threadId}`;
        }
    });
});

// export const RuntimeThreads = {
//     list: async () => {
//         return await chatDb.threads.toArray();
//     },
//     insert: async (data: ModelThread) => {
//         try {
//             await chatDb.threads.add(data);
//             return true;
//         }
//         catch (e) {
//             console.error(e);
//             return false;
//         }
//     },
//     update: async (threadId: string, updateData: Partial<ModelThread>) => {
//         try {
//             await chatDb.threads.update(threadId, updateData);
//             return true;
//         } catch (e) {
//             console.error(e);
//             return false;
//         }
//     },
//     delete: async (theadId: string) => {
//         try {
//             await chatDb.threads.delete(theadId);
//             return true;
//         } catch (e) {
//             console.error(e);
//             return false;
//         }
//     }
// };

// export const RuntimeMessages = {
//     list: async (threadId: string) => {
//         return await chatDb.messages.filter(m => m.threadId === threadId).toArray();
//     },
//     insert: async (data: ThreadMessage) => {
//         try {
//             await chatDb.messages.add(data);
//             return true;
//         }
//         catch (e) {
//             console.error(e);
//             return false;
//         }
//     },
//     update: async (id: string, updateData: Partial<ThreadMessage>) => {
//         try {
//             await chatDb.messages.update(id, updateData);
//             return true;
//         } catch (e) {
//             console.error(e);
//             return false;
//         }
//     },
//     delete: async (id: string) => {
//         try {
//             await chatDb.messages.delete(id);
//             return true;
//         } catch (e) {
//             console.error(e);
//             return false;
//         }
//     }
// }
