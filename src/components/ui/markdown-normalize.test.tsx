import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import { describe, expect, it } from "vitest"
import { normalizeMarkdownForRendering } from "./markdown-normalize"

describe("normalizeMarkdownForRendering", () => {
  it("renders a bold label when its following space is missing", () => {
    const markdown = normalizeMarkdownForRendering(
      "**Report name:**Weekly operations report"
    )

    expect(
      renderToStaticMarkup(<ReactMarkdown>{markdown}</ReactMarkdown>)
    ).toContain("<strong>Report name:</strong> Weekly operations report")
  })

  it("normalizes exactly two full-width asterisks into a bold marker", () => {
    const markdown = normalizeMarkdownForRendering("＊＊Status：＊＊Complete")

    expect(markdown).toBe("**Status：** Complete")
    expect(
      renderToStaticMarkup(<ReactMarkdown>{markdown}</ReactMarkdown>)
    ).toContain("<strong>Status：</strong> Complete")
    expect(normalizeMarkdownForRendering("＊＊＊")).toBe("＊＊＊")
    expect(normalizeMarkdownForRendering("＊＊＊＊")).toBe("＊＊＊＊")
  })

  it("does not modify inline or fenced code", () => {
    const source = [
      "**Status:**Complete",
      "",
      "`**Status:**Complete`",
      "`＊＊Status：＊＊Complete`",
      "",
      "```markdown",
      "**Status:**Complete",
      "＊＊Status：＊＊Complete",
      "```",
    ].join("\n")

    expect(normalizeMarkdownForRendering(source)).toBe(
      [
        "**Status:** Complete",
        "",
        "`**Status:**Complete`",
        "`＊＊Status：＊＊Complete`",
        "",
        "```markdown",
        "**Status:**Complete",
        "＊＊Status：＊＊Complete",
        "```",
      ].join("\n")
    )
  })
})
