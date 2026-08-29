import { patchProductDraft } from "./product-editor-state"
import type { ProductEditorState } from "./product-editor-state"
import type { ProductWriteInput } from "./types"

type EditorSession = {
  state: ProductEditorState
  apply: (draft: ProductEditorState) => void
}

export class ProductEditorController {
  private session: EditorSession | null = null

  attach(state: ProductEditorState, apply: EditorSession["apply"]) {
    this.session = { state, apply }
    return () => {
      this.session = null
    }
  }

  update(state: ProductEditorState) {
    if (this.session) this.session.state = state
  }

  getState() {
    return this.session?.state ?? null
  }

  applyDraft(patch: Partial<ProductWriteInput>) {
    if (!this.session) throw new Error("Product editor is not open.")
    const next = patchProductDraft(this.session.state, patch)
    this.session.state = next
    this.session.apply(next)
    return next
  }
}
