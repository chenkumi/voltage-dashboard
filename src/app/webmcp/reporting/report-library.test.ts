import { afterEach, describe, expect, it } from "vitest"
import type { SavedReport } from "./types"
import {
  deleteSavedReport,
  listSavedReports,
  saveReportSnapshot,
} from "./report-library"

const savedReport = (id: string, contextId: string): SavedReport => ({
  contextId,
  report: {
    id,
    title: `Report ${id}`,
    widgets: [],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
  queryResults: [],
  savedAt: "2026-08-31T00:00:00.000Z",
})

const reportIds = ["current-context-report", "stale-context-report"]

afterEach(async () => {
  await Promise.all(reportIds.map(deleteSavedReport))
})

describe("report library", () => {
  it("lists only reports that belong to the current page context", async () => {
    await saveReportSnapshot(savedReport(reportIds[0], "context-current"))
    await saveReportSnapshot(savedReport(reportIds[1], "context-stale"))

    expect(await listSavedReports("context-current")).toEqual([
      expect.objectContaining({ id: reportIds[0] }),
    ])
  })
})
