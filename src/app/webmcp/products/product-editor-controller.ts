import { patchProductDraft } from "./product-editor-state"
import type { ProductEditorState } from "./product-editor-state"
import type { ProductWriteInput } from "./types"

type EditorSession = {
  state: ProductEditorState
  apply: (draft: ProductEditorState) => void
}

type DraftPersistence = {
  saved: boolean
  restored: boolean
}

export class ProductEditorController {
  private session: EditorSession | null = null
  private draftPersistence: DraftPersistence = { saved: false, restored: false }

  attach(state: ProductEditorState, apply: EditorSession["apply"]) {
    const session = { state, apply }
    this.session = session
    return () => {
      if (this.session === session) this.session = null
    }
  }

  detach() {
    this.session = null
    this.draftPersistence = { saved: false, restored: false }
  }

  update(state: ProductEditorState) {
    if (this.session) this.session.state = state
  }

  getState() {
    return this.session?.state ?? null
  }

  setDraftPersistence(next: DraftPersistence) {
    this.draftPersistence = next
  }

  getDraftPersistence() {
    return this.draftPersistence
  }

  applyDraft(patch: Partial<ProductWriteInput>) {
    if (!this.session) throw new Error("Product editor is not open.")
    const next = patchProductDraft(this.session.state, patch)
    this.session.state = next
    this.session.apply(next)
    return next
  }
}
