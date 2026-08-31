// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReturnReviewNoteSession } from "./return-repository"
import { ReturnNoteEditor } from "./return-note-editor"
import type { ReturnReviewNote } from "./types"

const note = (patch: Partial<ReturnReviewNote> = {}): ReturnReviewNote => ({
  id: "NOTE-1",
  rmaId: "RMA-1",
  stage: "eligibility",
  category: "internal_note",
  content: "已儲存內容。",
  recommendation: null,
  evidenceCodes: [],
  authorUserId: "guest",
  status: "draft",
  createdAt: "2026-08-31T08:00:00.000Z",
  updatedAt: "2026-08-31T08:00:00.000Z",
  publishedAt: null,
  version: 1,
  inputSource: "ui",
  supersedesNoteId: null,
  ...patch,
})

const session = (draft: ReturnReviewNote | null = null) => {
  const api: ReturnReviewNoteSession = {
    getDraft: vi.fn().mockResolvedValue(draft),
    listPublished: vi.fn().mockResolvedValue([]),
    saveDraft: vi.fn().mockImplementation(async (input) =>
      note({
        ...input,
        evidenceCodes: input.evidenceCodes ?? [],
        version: (draft?.version ?? 0) + 1,
      })
    ),
    discardDraft: vi.fn().mockResolvedValue(true),
    publishDraft: vi.fn().mockResolvedValue(note({ status: "published" })),
  }
  return api
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ReturnNoteEditor", () => {
  it("reloads a draft written through another surface when the notes snapshot changes", async () => {
    let current: ReturnReviewNote | null = null
    const api = session()
    vi.mocked(api.getDraft).mockImplementation(async () => current)
    const view = render(
      <ReturnNoteEditor
        rmaId="RMA-1"
        currentStage="eligibility"
        notes={[]}
        session={api}
      />
    )
    await waitFor(() => expect(screen.getByText("No note draft yet")).toBeTruthy())

    current = note({ content: "由 WebMCP 寫入的備註。", version: 2 })
    view.rerender(
      <ReturnNoteEditor
        rmaId="RMA-1"
        currentStage="eligibility"
        notes={[current]}
        session={api}
      />
    )

    await waitFor(() =>
      expect(
        (screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement)
          .value
      ).toBe("由 WebMCP 寫入的備註。")
    )
  })

  it("restores and automatically saves the current user's draft without a blocking prompt", async () => {
    vi.useFakeTimers()
    const api = session(note())
    const beforeUnload = vi.spyOn(window, "addEventListener")
    render(
      <ReturnNoteEditor
        rmaId="RMA-1"
        currentStage="eligibility"
        notes={[note()]}
        session={api}
      />
    )
    await act(async () => Promise.resolve())
    expect(
      (screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement)
        .value
    ).toBe("已儲存內容。")

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "更新後的審查備註。" },
    })
    await act(async () => vi.advanceTimersByTime(500))
    await act(async () => Promise.resolve())

    expect(api.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ content: "更新後的審查備註。" }),
      1,
      "ui"
    )
    expect(
      beforeUnload.mock.calls.some(([event]) => String(event) === "beforeunload")
    ).toBe(false)
  })

  it("shows older-stage drafts and keeps publish and discard as explicit user actions", async () => {
    const current = note()
    const older = note({ id: "NOTE-2", stage: "return_request", version: 3 })
    const api = session(current)
    render(
      <ReturnNoteEditor
        rmaId="RMA-1"
        currentStage="eligibility"
        notes={[current, older]}
        session={api}
      />
    )
    await waitFor(() =>
      expect(screen.getByText(/Draft restored/)).toBeTruthy()
    )
    expect(
      screen.getByText(/unpublished note draft in return_request/)
    ).toBeTruthy()
    const stageOptions = Array.from(
      (screen.getByRole("combobox", { name: "Stage" }) as HTMLSelectElement)
        .options
    ).map((option) => option.value)
    expect(stageOptions).toEqual(["return_request", "eligibility"])
    expect(stageOptions).not.toContain("refund_execution")

    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    await waitFor(() =>
      expect(api.discardDraft).toHaveBeenCalledWith(
        "RMA-1",
        "return_request",
        3
      )
    )

    fireEvent.click(screen.getByRole("button", { name: "Add to review notes" }))
    await waitFor(() => expect(api.publishDraft).toHaveBeenCalledWith("RMA-1", "eligibility", 1))
    expect(api.discardDraft).toHaveBeenCalledTimes(1)
  })

  it("reloads the latest draft after a version conflict", async () => {
    vi.useFakeTimers()
    const latest = note({ content: "人工更新的較新內容。", version: 4 })
    const api = session(note())
    vi.mocked(api.saveDraft).mockRejectedValueOnce({ code: "VERSION_CONFLICT" })
    vi.mocked(api.getDraft)
      .mockResolvedValueOnce(note())
      .mockResolvedValueOnce(latest)
    render(
      <ReturnNoteEditor
        rmaId="RMA-1"
        currentStage="eligibility"
        notes={[note()]}
        session={api}
      />
    )
    await act(async () => Promise.resolve())
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "過期的本地修改。" },
    })
    await act(async () => vi.advanceTimersByTime(500))
    await act(async () => Promise.resolve())

    expect(
      (screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement)
        .value
    ).toBe("人工更新的較新內容。")
    expect(screen.getByText(/newer draft was loaded/)).toBeTruthy()
  })

  it("reloads the latest draft when an explicit publish conflicts", async () => {
    const latest = note({ content: "發布前已由其他操作更新。", version: 5 })
    const api = session(note())
    vi.mocked(api.publishDraft).mockRejectedValueOnce({
      code: "VERSION_CONFLICT",
    })
    vi.mocked(api.getDraft)
      .mockResolvedValueOnce(note())
      .mockResolvedValueOnce(latest)
    render(
      <ReturnNoteEditor
        rmaId="RMA-1"
        currentStage="eligibility"
        notes={[note()]}
        session={api}
      />
    )
    await waitFor(() => expect(screen.getByText(/Draft restored/)).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Add to review notes" }))
    await waitFor(() =>
      expect(screen.getByText(/newer draft was loaded/)).toBeTruthy()
    )
    expect(
      (screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement)
        .value
    ).toBe("發布前已由其他操作更新。")
  })
})
