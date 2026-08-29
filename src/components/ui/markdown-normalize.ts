const CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|`[^`\r\n]*`)/g
const EXACTLY_TWO_FULL_WIDTH_ASTERISKS_PATTERN = /(?<!＊)＊＊(?!＊)/g
const BOLD_LABEL_WITHOUT_SPACE_PATTERN =
  /(^|[\s([（])(\*\*[^*\r\n]+?\*\*)(?=[\p{L}\p{N}_])/gmu

const normalizeTextSegment = (markdown: string) =>
  markdown
    .replace(EXACTLY_TWO_FULL_WIDTH_ASTERISKS_PATTERN, "**")
    .replace(BOLD_LABEL_WITHOUT_SPACE_PATTERN, "$1$2 ")

// CommonMark does not close **strong** before a following letter or number.
// LLMs commonly emit label-style text such as **Status:**Complete, so add the
// missing separator. It also accepts exactly two full-width asterisks. Both
// transformations apply only to renderable text, never inline or fenced code.
export const normalizeMarkdownForRendering = (markdown: string) =>
  markdown
    .split(CODE_SEGMENT_PATTERN)
    .map((segment) =>
      segment.startsWith("`") ? segment : normalizeTextSegment(segment)
    )
    .join("")
