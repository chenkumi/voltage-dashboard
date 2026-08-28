import { describe, expect, it } from "vitest"
import {
  createBarDisplayRows,
  formatMetricValue,
  getCacheLimitMessage,
  resolveReportWidget,
  shouldCommitTitleOnBlur,
  toggleWidgetEditor,
} from "./report-canvas-model"
import type { CachedQueryResult, ReportWidget } from "./types"

const result = Object.freeze({
  columns: Object.freeze([
    Object.freeze({ name: "category", type: "string" as const }),
    Object.freeze({ name: "revenue", type: "number" as const }),
  ]),
  rows: Object.freeze([
    Object.freeze({ category: "Beauty", revenue: 100 }),
    Object.freeze({ category: "Furniture", revenue: 50 }),
  ]),
  rowCount: 2,
  truncated: false,
  executionTimeMs: 1,
}) satisfies CachedQueryResult

const queryId = "01K00000000000000000000000"

describe("Report Canvas mapping", () => {
  it.each<ReportWidget>([
    {
      id: "metric",
      type: "metric",
      title: "Revenue",
      queryId,
      valueColumn: "revenue",
    },
    {
      id: "table",
      type: "table",
      title: "Categories",
      queryId,
      columns: ["category", "revenue"],
    },
    {
      id: "bar",
      type: "bar",
      title: "Revenue by category",
      queryId,
      categoryColumn: "category",
      valueColumn: "revenue",
    },
    {
      id: "text",
      type: "markdown",
      title: "Evidence",
      markdown: "Complete data.",
      evidenceQueryIds: [queryId],
    },
    {
      id: "space",
      type: "space",
      xSpace: 2,
      ySpace: 3,
    },
  ])("resolves valid $type widget evidence", (widget) => {
    expect(resolveReportWidget(widget, () => result)).toMatchObject({
      status: "ready",
    })
  })

  it("shows a safe error when evidence is missing", () => {
    const widget: ReportWidget = {
      id: "metric",
      type: "metric",
      title: "Revenue",
      queryId,
      valueColumn: "revenue",
    }

    expect(
      resolveReportWidget(widget, () => {
        throw new Error("missing")
      })
    ).toEqual({
      status: "error",
      message: "The query evidence is no longer available in this workspace.",
    })
  })

  it("does not render stale or non-numeric mappings as valid data", () => {
    const staleTable: ReportWidget = {
      id: "table",
      type: "table",
      title: "Stale table",
      queryId,
      columns: ["unknown"],
    }
    const invalidBar: ReportWidget = {
      id: "bar",
      type: "bar",
      title: "Invalid chart",
      queryId,
      categoryColumn: "category",
      valueColumn: "category",
    }

    expect(resolveReportWidget(staleTable, () => result)).toMatchObject({
      status: "error",
    })
    expect(resolveReportWidget(invalidBar, () => result)).toMatchObject({
      status: "error",
    })
  })

  it("normalizes bar widths and limits the visible category count", () => {
    const manyRows = Object.freeze({
      ...result,
      rows: Object.freeze(
        Array.from({ length: 15 }, (_, index) =>
          Object.freeze({ category: `Category ${index}`, revenue: 15 - index })
        )
      ),
      rowCount: 15,
    }) satisfies CachedQueryResult
    const widget: Extract<ReportWidget, { type: "bar" }> = {
      id: "bar",
      type: "bar",
      title: "Revenue",
      queryId,
      categoryColumn: "category",
      valueColumn: "revenue",
    }

    const actual = createBarDisplayRows(widget, manyRows)

    expect(actual).toHaveLength(12)
    expect(actual[0]).toEqual({
      label: "Category 0",
      value: 15,
      widthPercent: 100,
    })
    expect(actual[1].widthPercent).toBeCloseTo(93.333)
  })

  it("surfaces both cache capacity and oversized-result states", () => {
    const baseStatus = {
      state: "active" as const,
      entryCount: 1,
      totalBytes: 100,
      maxEntries: 32,
      maxTotalBytes: 1_000,
      limitReached: true,
    }

    expect(
      getCacheLimitMessage({
        ...baseStatus,
        lastRejection: "QUERY_CACHE_LIMIT_EXCEEDED",
      })
    ).toContain("cache limit reached")
    expect(
      getCacheLimitMessage({
        ...baseStatus,
        lastRejection: "QUERY_CACHE_ENTRY_TOO_LARGE",
      })
    ).toContain("too large")
  })

  it("does not commit a title when Escape marks the next blur as cancelled", () => {
    expect(shouldCommitTitleOnBlur(true)).toBe(false)
    expect(shouldCommitTitleOnBlur(false)).toBe(true)
  })

  it("opens the selected widget editor and closes it when selected again", () => {
    expect(toggleWidgetEditor(null, "revenue-table")).toBe("revenue-table")
    expect(toggleWidgetEditor("revenue-table", "orders-bar")).toBe(
      "orders-bar"
    )
    expect(toggleWidgetEditor("revenue-table", "revenue-table")).toBeNull()
  })

  it("formats Metric values as numbers, currencies, or percentages", () => {
    expect(formatMetricValue(1234.5, "number", undefined)).toBe("1,234.5")
    expect(formatMetricValue(42.5, "currency", "USD")).toBe("$42.50")
    expect(formatMetricValue(0.124, "percent", undefined)).toBe("12.4%")
  })
})
