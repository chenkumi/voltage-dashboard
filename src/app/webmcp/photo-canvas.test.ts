import { describe, expect, it } from "vitest"
import { getPhotoCanvasStyle } from "./photo-canvas"

describe("getPhotoCanvasStyle", () => {
  it("cycles through near-warm-white canvases and subtle pattern classes", () => {
    expect(getPhotoCanvasStyle(0)).toEqual({
      canvasClass: "bg-[#f5f6f1]",
      patternClass:
        "bg-[radial-gradient(circle_at_1px_1px,rgba(111,125,114,0.08)_1px,transparent_0)] bg-size-[15px_15px]",
    })
    expect(getPhotoCanvasStyle(1)).toEqual({
      canvasClass: "bg-[#f4f6f3]",
      patternClass:
        "bg-[repeating-radial-gradient(circle_at_0_100%,transparent_0_18px,rgba(111,125,114,0.07)_19px_20px,transparent_21px_38px)]",
    })
    expect(getPhotoCanvasStyle(2)).toEqual({
      canvasClass: "bg-[#f6f3ee]",
      patternClass:
        "bg-[repeating-linear-gradient(135deg,transparent_0_13px,rgba(134,128,112,0.06)_14px_15px,transparent_16px_28px)]",
    })
  })

  it("reuses the same three styles for later product cards", () => {
    expect(getPhotoCanvasStyle(3)).toEqual(getPhotoCanvasStyle(0))
  })
})
