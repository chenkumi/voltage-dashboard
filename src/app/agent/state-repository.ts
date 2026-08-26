import { monotonicFactory } from "ulid"
import { chatDb } from "../db"
import type { AgentSegmentState } from "../types"

const gen = monotonicFactory()

export class AgentStateRepository {
  static genId() {
    return gen()
  }

  static async ensureActiveSegment(threadId: string, agentName: string): Promise<AgentSegmentState> {
    const existing = await chatDb.agentStates
      .where("[threadId+agentName]")
      .equals([threadId, agentName])
      .filter((state) => state.status === "running")
      .toArray()

    existing.sort((a, b) => b.updatedAt - a.updatedAt)
    if (existing[0]) {
      return existing[0]
    }

    const timestamp = Date.now()
    const state: AgentSegmentState = {
      id: this.genId(),
      threadId,
      agentName,
      segmentId: this.genId(),
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await chatDb.agentStates.put(state)
    return state
  }
}
