import { Dexie, type EntityTable } from "dexie"
import type { SavedReport, SavedReportSummary } from "./types"

type SavedReportRecord = SavedReportSummary & {
  snapshot: SavedReport
}

const reportLibraryDb = new Dexie("webmcp-agent-report-library-v1") as Dexie & {
  reports: EntityTable<SavedReportRecord, "id">
}

reportLibraryDb.version(1).stores({
  reports: "id, updatedAt, savedAt",
})

const toSummary = (record: SavedReportRecord): SavedReportSummary => ({
  id: record.id,
  title: record.title,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  widgetCount: record.widgetCount,
  savedAt: record.savedAt,
})

export const saveReportSnapshot = async (snapshot: SavedReport) => {
  const { report } = snapshot
  await reportLibraryDb.reports.put({
    id: report.id,
    title: report.title,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    widgetCount: report.widgets.length,
    savedAt: snapshot.savedAt,
    snapshot,
  })
}

export const listSavedReports = async (
  contextId: string
): Promise<readonly SavedReportSummary[]> =>
  (await reportLibraryDb.reports.orderBy("updatedAt").reverse().toArray())
    .filter(({ snapshot }) => snapshot.contextId === contextId)
    .map(toSummary)

export const readSavedReport = async (id: string) =>
  (await reportLibraryDb.reports.get(id))?.snapshot ?? null

export const deleteSavedReport = async (id: string) => {
  await reportLibraryDb.reports.delete(id)
}
