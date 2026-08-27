const photoCanvasStyles = [
  {
    canvasClass: "bg-[#f5f6f1]",
    patternClass:
      "bg-[radial-gradient(circle_at_1px_1px,rgba(111,125,114,0.08)_1px,transparent_0)] bg-size-[15px_15px]",
  },
  {
    canvasClass: "bg-[#f4f6f3]",
    patternClass:
      "bg-[repeating-radial-gradient(circle_at_0_100%,transparent_0_18px,rgba(111,125,114,0.07)_19px_20px,transparent_21px_38px)]",
  },
  {
    canvasClass: "bg-[#f6f3ee]",
    patternClass:
      "bg-[repeating-linear-gradient(135deg,transparent_0_13px,rgba(134,128,112,0.06)_14px_15px,transparent_16px_28px)]",
  },
] as const

export const getPhotoCanvasStyle = (index: number) => {
  return photoCanvasStyles[index % photoCanvasStyles.length]!
}
