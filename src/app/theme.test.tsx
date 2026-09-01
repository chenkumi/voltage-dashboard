// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeProvider } from "./theme"
import { useTheme } from "./theme-context"

const ThemeProbe = () => {
  const { theme, setTheme } = useTheme()
  return <button onClick={() => setTheme("dark")}>{theme}</button>
}

const localStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage"
)

afterEach(() => {
  if (localStorageDescriptor)
    Object.defineProperty(window, "localStorage", localStorageDescriptor)
})

describe("ThemeProvider", () => {
  it("keeps rendering and switching themes when browser storage is unavailable", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Storage is disabled.", "SecurityError")
      },
    })

    render(
      <ThemeProvider defaultTheme="light" disableTransitionOnChange={false}>
        <ThemeProbe />
      </ThemeProvider>
    )

    expect(screen.getByRole("button", { name: "light" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "light" }))
    expect(screen.getByRole("button", { name: "dark" })).toBeTruthy()
  })
})
