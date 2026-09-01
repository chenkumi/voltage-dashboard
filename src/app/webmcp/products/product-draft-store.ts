import Dexie, { type EntityTable } from "dexie"
import type { ProductEditorState } from "./product-editor-state"

type PersistedProductDraft = {
  id: string
  state: ProductEditorState
  savedAt: string
}

class ProductDraftDatabase extends Dexie {
  drafts!: EntityTable<PersistedProductDraft, "id">

  constructor() {
    super("webmcp-agent-product-drafts-v1")
    this.version(1).stores({ drafts: "id, savedAt" })
  }
}

export class ProductDraftStore {
  private database = new ProductDraftDatabase()

  async get(id: string) {
    const draft = await this.database.drafts.get(id)
    return draft ? structuredClone(draft.state) : null
  }

  async save(id: string, state: ProductEditorState) {
    await this.database.drafts.put({
      id,
      state: structuredClone(state),
      savedAt: new Date().toISOString(),
    })
  }

  async discard(id: string) {
    await this.database.drafts.delete(id)
  }
}
