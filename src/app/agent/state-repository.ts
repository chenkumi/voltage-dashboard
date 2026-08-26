import { monotonicFactory } from "ulid";
import { chatDb } from "../db";
import { AgentLoadedDocument, AgentSegmentState } from "../types";

const gen = monotonicFactory();

const now = () => Date.now();

const cloneDocuments = (documents: AgentLoadedDocument[]) =>
    documents.map(document => ({ ...document }));

export class AgentStateRepository {
    static genId() {
        return gen();
    }

    static async getActiveState(threadId: string, agentName: string): Promise<AgentSegmentState | null> {
        const states = await chatDb.agentStates
            .where("[threadId+agentName]")
            .equals([threadId, agentName])
            .filter(state => state.status === "running")
            .toArray();

        if (states.length === 0) {
            return null;
        }

        states.sort((a, b) => b.updatedAt - a.updatedAt);
        return states[0];
    }

    static async ensureActiveSegment(threadId: string, agentName: string): Promise<AgentSegmentState> {
        const existing = await this.getActiveState(threadId, agentName);
        if (existing) {
            return existing;
        }

        const timestamp = now();
        const segmentId = this.genId();
        const state: AgentSegmentState = {
            id: this.genId(),
            threadId,
            agentName,
            segmentId,
            status: "running",
            skillDocumentPaths: [],
            loadedDocuments: [],
            lastLoadedDocumentPath: null,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        await chatDb.agentStates.put(state);
        return state;
    }

    static async updateState(state: AgentSegmentState): Promise<void> {
        await chatDb.agentStates.put({ ...state, updatedAt: now() });
    }

    static async setActiveSkill(
        threadId: string,
        inputId:string,
        agentName: string,
        payload: {
            skillName: string,
            skillPath?: string,
            skillDocumentPaths: string[],
        },
    ): Promise<AgentSegmentState> {
        const state = await this.ensureActiveSegment(threadId, agentName);
        const activeSkillName = state.activeSkill?.name;
        const nextState: AgentSegmentState = {
            ...state,
            activeSkill: {name:payload.skillName, path:payload.skillPath!, inlineId:inputId},
            skillDocumentPaths: [...payload.skillDocumentPaths],
            loadedDocuments: activeSkillName === payload.skillName ? cloneDocuments(state.loadedDocuments) : [],
            lastLoadedDocumentPath: activeSkillName === payload.skillName ? state.lastLoadedDocumentPath ?? null : null,
            loadedToolNames: [...(state.loadedToolNames ?? [])],
            updatedAt: now(),
        };

        if (activeSkillName !== payload.skillName) {
            nextState.loadedDocuments = [];
            nextState.lastLoadedDocumentPath = null;
        }

        await chatDb.agentStates.put(nextState);
        return nextState;
    }

    static async addLoadedDocument(
        threadId: string,
        inputId:string,
        agentName: string,
        document: AgentLoadedDocument,
        skillDocumentPaths: string[],
    ): Promise<AgentSegmentState> {
        const state = await this.ensureActiveSegment(threadId, agentName);
        const loadedDocuments = cloneDocuments(state.loadedDocuments);
        const exists = loadedDocuments.some(item => item.skillName === document.skillName && item.path === document.path);

        if (!exists) {
            loadedDocuments.push({ ...document });
        }

        const nextState: AgentSegmentState = {
            ...state,
            activeSkill: state.activeSkill?.name === document.skillName
                ? state.activeSkill
                : { name: document.skillName, path: "", inlineId: inputId },
            skillDocumentPaths: [...skillDocumentPaths],
            loadedDocuments,
            lastLoadedDocumentPath: document.path,
            loadedToolNames: [...(state.loadedToolNames ?? [])],
            updatedAt: now(),
        };

        await chatDb.agentStates.put(nextState);
        return nextState;
    }

    static async addLoadedTools(
        threadId: string,
        agentName: string,
        toolNames: string[],
    ): Promise<AgentSegmentState> {
        const state = await this.ensureActiveSegment(threadId, agentName);
        const loadedToolNames = Array.from(new Set([
            ...(state.loadedToolNames ?? []),
            ...toolNames,
        ]));

        const nextState: AgentSegmentState = {
            ...state,
            loadedToolNames,
            updatedAt: now(),
        };

        await chatDb.agentStates.put(nextState);
        return nextState;
    }

    static async markSegmentFinal(threadId: string, agentName: string, segmentId: string): Promise<void> {
        const state = await chatDb.agentStates
            .where("[threadId+segmentId]")
            .equals([threadId, segmentId])
            .filter(item => item.agentName === agentName)
            .first();

        if (!state) {
            return;
        }

        await chatDb.agentStates.put({
            ...state,
            status: "final",
            updatedAt: now(),
            finalizedAt: now(),
        });
    }
}
