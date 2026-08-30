// @vitest-environment jsdom

import type { ReactNode } from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ActiveFilterSummary,
  OperationalFilterButton,
  OperationalFilterPopover,
  OperationalFilterToolbar,
  OperationalListPanel,
  OperationalListState,
  OperationalMetricCard,
  OperationalPagination,
  OperationalToolbarSearch,
  useOperationalPagination,
} from "."

afterEach(() => cleanup())

const renderWithTooltip = (node: ReactNode) =>
  render(<TooltipProvider>{node}</TooltipProvider>)

describe("operational UI", () => {
  it("renders metric loading and unavailable states without inventing zeroes", () => {
    const { rerender } = render(
      <OperationalMetricCard label="Revenue" loading />
    )

    expect(screen.getByLabelText("Revenue loading")).toBeTruthy()

    rerender(<OperationalMetricCard label="Revenue" />)

    expect(screen.getByText("—")).toBeTruthy()
    expect(screen.getByText("Unavailable")).toBeTruthy()
    expect(screen.queryByText("0")).toBeNull()
  })

  it("keeps list states inside a shared panel", () => {
    render(
      <OperationalListPanel
        toolbar={<span>Toolbar</span>}
        summary={<span>Showing 1–10 / 20</span>}
        pagination={<span>Pagination</span>}
      >
        <OperationalListState kind="empty">No results</OperationalListState>
      </OperationalListPanel>
    )

    expect(screen.getByText("Toolbar")).toBeTruthy()
    expect(screen.getByText("Showing 1–10 / 20")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("No results")
    expect(screen.getByText("Pagination")).toBeTruthy()
  })

  it("exposes loading and error list states with semantic roles", () => {
    const { rerender } = render(
      <OperationalListState kind="loading">
        Loading records
      </OperationalListState>
    )
    expect(screen.getByRole("status").textContent).toBe("Loading records")

    rerender(
      <OperationalListState kind="error">
        Records unavailable
      </OperationalListState>
    )
    expect(screen.getByRole("alert").textContent).toBe("Records unavailable")
  })

  it("uses the desktop and mobile toolbar visibility contract", () => {
    const { container } = render(
      <OperationalFilterToolbar
        search={<span>Search</span>}
        primaryFilters={<span>Primary</span>}
        moreFilter={<span>More</span>}
        mobileFilter={<span>Mobile filter</span>}
      />
    )

    expect(screen.getByText("Primary").parentElement?.className).toContain(
      "hidden"
    )
    expect(screen.getByText("Primary").parentElement?.className).toContain(
      "lg:flex"
    )
    expect(
      screen.getByText("Mobile filter").parentElement?.className
    ).toContain("lg:hidden")
    expect(container.textContent).toContain("Search")
  })

  it("applies, cancels, clears, and validates popover draft values", async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    renderWithTooltip(
      <OperationalFilterPopover
        value={{ query: "applied" }}
        emptyValue={{ query: "" }}
        onApply={onApply}
        validate={(draft) =>
          draft.query === "invalid" ? { query: "Invalid query" } : {}
        }
        trigger={<Button aria-label="Open filters">Filters</Button>}
        title="Filters"
        labels={{ clear: "Clear", cancel: "Cancel", apply: "Apply" }}
      >
        {({ draft, setDraft, getErrorProps }) => (
          <label>
            Query
            <input
              value={draft.query}
              onChange={(event) => setDraft({ query: event.target.value })}
              {...getErrorProps("query")}
            />
          </label>
        )}
      </OperationalFilterPopover>
    )

    await user.click(screen.getByRole("button", { name: "Open filters" }))
    expect(
      screen
        .getByRole("button", { name: "Open filters" })
        .getAttribute("aria-expanded")
    ).toBe("true")
    expect(
      screen
        .getByRole("button", { name: "Open filters" })
        .getAttribute("aria-controls")
    ).toBeTruthy()
    const input = screen.getByRole("textbox", { name: "Query" })
    await user.clear(input)
    await user.type(input, "cancelled")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Open filters" }))
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Query" }).value
    ).toBe("applied")
    await user.clear(screen.getByRole("textbox", { name: "Query" }))
    await user.type(screen.getByRole("textbox", { name: "Query" }), "invalid")
    await user.click(screen.getByRole("button", { name: "Apply" }))
    expect(screen.getByRole("alert").textContent).toContain("Invalid query")
    const invalidInput = screen.getByRole("textbox", { name: "Query" })
    const describedBy = invalidInput.getAttribute("aria-describedby")
    expect(invalidInput.getAttribute("aria-invalid")).toBe("true")
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Invalid query"
    )
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Query" }).value
    ).toBe("")
    await user.click(screen.getByRole("button", { name: "Apply" }))
    expect(onApply).toHaveBeenCalledWith({ query: "" })
  })

  it("gives icon filter controls a tooltip and accessible name", async () => {
    const user = userEvent.setup()
    renderWithTooltip(
      <OperationalFilterButton kind="more" label="More filters" />
    )

    const button = screen.getByRole("button", { name: "More filters" })
    await user.hover(button)

    expect(button.getAttribute("title")).toBe("More filters")
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "More filters"
    )
  })

  it("discards draft values when Escape or an outside interaction closes the popover", async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <div>
        <OperationalFilterPopover
          value={{ query: "applied" }}
          emptyValue={{ query: "" }}
          onApply={onApply}
          trigger={<Button aria-label="Open advanced filters">Filters</Button>}
          title="Filters"
          labels={{ clear: "Clear", cancel: "Cancel", apply: "Apply" }}
        >
          {({ draft, setDraft }) => (
            <label>
              Query
              <input
                value={draft.query}
                onChange={(event) => setDraft({ query: event.target.value })}
              />
            </label>
          )}
        </OperationalFilterPopover>
        <button type="button">Outside</button>
      </div>
    )

    await user.click(
      screen.getByRole("button", { name: "Open advanced filters" })
    )
    await user.clear(screen.getByRole("textbox", { name: "Query" }))
    await user.type(screen.getByRole("textbox", { name: "Query" }), "escape")
    await user.keyboard("{Escape}")
    expect(onApply).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", { name: "Open advanced filters" })
    )
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Query" }).value
    ).toBe("applied")
    await user.clear(screen.getByRole("textbox", { name: "Query" }))
    await user.type(screen.getByRole("textbox", { name: "Query" }), "outside")
    await user.click(screen.getByRole("button", { name: "Outside" }))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox", { name: "Query" })).toBeNull()

    await user.click(
      screen.getByRole("button", { name: "Open advanced filters" })
    )
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Query" }).value
    ).toBe("applied")
  })

  it("supports search, removable chips, clear all, and pagination", () => {
    const onSearch = vi.fn()
    const remove = vi.fn()
    const clearAll = vi.fn()
    const changePage = vi.fn()

    render(
      <>
        <OperationalToolbarSearch
          label="Search products"
          placeholder="Search"
          value=""
          onChange={onSearch}
        />
        <ActiveFilterSummary
          resultLabel="Showing 1–10 / 20"
          filters={[
            { id: "status", label: "Status: Active", onRemove: remove },
          ]}
          clearAllLabel="Clear all"
          onClearAll={clearAll}
        />
        <OperationalPagination
          page={2}
          pageCount={3}
          previousLabel="Previous"
          nextLabel="Next"
          onPageChange={changePage}
        />
      </>
    )

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search products" }),
      {
        target: { value: "mug" },
      }
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Status: Active remove" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(onSearch).toHaveBeenCalledWith("mug")
    expect(remove).toHaveBeenCalledOnce()
    expect(clearAll).toHaveBeenCalledOnce()
    expect(changePage).toHaveBeenCalledWith(3)
  })

  it("disables pagination at its boundaries and resets the page with filter changes", () => {
    const changePage = vi.fn()
    const { rerender } = render(
      <OperationalPagination
        page={1}
        pageCount={3}
        previousLabel="Previous"
        nextLabel="Next"
        onPageChange={changePage}
      />
    )
    expect(
      screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")
    ).toBe(true)

    rerender(
      <OperationalPagination
        page={3}
        pageCount={3}
        previousLabel="Previous"
        nextLabel="Next"
        onPageChange={changePage}
      />
    )
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")
    ).toBe(true)

    const { result } = renderHook(() => useOperationalPagination(3))
    const apply = vi.fn()
    act(() => result.current.applyAndReset(apply))
    expect(apply).toHaveBeenCalledOnce()
    expect(result.current.page).toBe(1)
  })
})
