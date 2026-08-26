import { parse } from "@babel/parser"
import type {
  BlockStatement,
  CallExpression,
  Expression,
  File,
  Node,
  OptionalCallExpression,
  Statement,
} from "@babel/types"
import * as prettierPluginBabel from "prettier/plugins/babel"
import * as prettierPluginEstree from "prettier/plugins/estree"
import prettier from "prettier/standalone"

const FORMAT_PRINT_WIDTH = 80
const WRAPPER_PREFIX = "async function __sandbox_main__() {\n"
const WRAPPER_SUFFIX = "\n}"
const MAX_SNIPPET_CHARS = 240

const DISALLOWED_IDENTIFIERS = new Set([
  "eval",
  "Function",
  "require",
  "importScripts",
  "window",
  "globalThis",
  "self",
  "document",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "caches",
  "cookieStore",
  "navigator",
  "location",
  "history",
  "parent",
  "top",
  "opener",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "BroadcastChannel",
  "MessageChannel",
  "Notification",
  "process",
])

const DISALLOWED_MEMBER_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
])

const ALLOWED_GLOBAL_FUNCTIONS = new Set([
  "Number",
  "String",
  "Boolean",
  "parseInt",
  "parseFloat",
  "isFinite",
  "isNaN",
  "encodeURIComponent",
  "decodeURIComponent",
])

const ALLOWED_MEMBER_FUNCTIONS = new Set([
  "Array.isArray",
  "Array.from",
  "Array.of",
  "Date.parse",
  "Date.UTC",
  "JSON.parse",
  "JSON.stringify",
  "Math.abs",
  "Math.ceil",
  "Math.floor",
  "Math.max",
  "Math.min",
  "Math.pow",
  "Math.round",
  "Math.sign",
  "Math.sqrt",
  "Math.random",
  "Number.isFinite",
  "Number.isInteger",
  "Number.isNaN",
  "Object.assign",
  "Object.entries",
  "Object.fromEntries",
  "Object.keys",
  "Object.values",
  "String.fromCharCode",
  "console.debug",
  "console.error",
  "console.info",
  "console.log",
  "console.warn",
])

const ALLOWED_METHOD_NAMES = new Set([
  "at",
  "charAt",
  "concat",
  "endsWith",
  "every",
  "filter",
  "find",
  "findIndex",
  "flat",
  "flatMap",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "lastIndexOf",
  "map",
  "match",
  "matchAll",
  "padEnd",
  "padStart",
  "push",
  "reduce",
  "reduceRight",
  "replace",
  "replaceAll",
  "reverse",
  "slice",
  "some",
  "sort",
  "split",
  "startsWith",
  "substring",
  "toFixed",
  "toISOString",
  "toLowerCase",
  "toString",
  "toUpperCase",
  "trim",
  "trimEnd",
  "trimStart",
])

type ValidationFailureType =
  | "JAVASCRIPT_FORMAT_ERROR"
  | "JAVASCRIPT_PARSE_ERROR"
  | "JAVASCRIPT_PERMISSION_ERROR"
  | "JAVASCRIPT_RETURN_PATH_ERROR"

type ValidationFailure = {
  valid: false
  response: {
    status: "error"
    code: number
    data: null
    error: {
      type: ValidationFailureType
      message: string
      detail?: string
      snippet?: string
      marker?: string
      functionName?: string
      allowedFunctions?: string[]
    }
  }
}

type ValidationSuccess = {
  valid: true
  formattedCode: string
}

export type JavaScriptValidationResult = ValidationSuccess | ValidationFailure

type ValidateJavaScriptOptions = {
  allowedToolNames: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function getErrorPosition(error: unknown, fallbackCode: string) {
  if (!isRecord(error)) {
    return 0
  }

  if (typeof error.pos === "number") {
    return error.pos
  }

  const loc = error.loc

  if (
    isRecord(loc) &&
    typeof loc.line === "number" &&
    typeof loc.column === "number"
  ) {
    return offsetFromLocation(fallbackCode, loc.line, loc.column)
  }

  return 0
}

function offsetFromLocation(code: string, line: number, column: number) {
  const lines = code.split("\n")
  let offset = 0

  for (let i = 0; i < Math.max(0, line - 1); i += 1) {
    offset += (lines[i]?.length ?? 0) + 1
  }

  return offset + column
}

function createSnippet(code: string, position: number, nodeEnd?: number) {
  const safePosition = Math.max(0, Math.min(position, code.length))
  const start = Math.max(0, safePosition - Math.floor(MAX_SNIPPET_CHARS / 2))
  const fallbackEnd = safePosition + Math.floor(MAX_SNIPPET_CHARS / 2)
  const end = Math.min(code.length, Math.max(nodeEnd ?? 0, fallbackEnd))
  const snippet = code.slice(start, end).trim()
  const markerOffset = Math.max(0, safePosition - start)
  const marker = `${" ".repeat(markerOffset)}^`

  return { snippet, marker }
}

function createErrorResponse(
  type: ValidationFailureType,
  message: string,
  code: string,
  position: number,
  options?: {
    detail?: string
    functionName?: string
    allowedFunctions?: string[]
    end?: number
  }
): ValidationFailure {
  const { snippet, marker } = createSnippet(code, position, options?.end)

  return {
    valid: false,
    response: {
      status: "error",
      code: 422,
      data: null,
      error: {
        type,
        message,
        detail: options?.detail,
        snippet,
        marker,
        functionName: options?.functionName,
        allowedFunctions: options?.allowedFunctions,
      },
    },
  }
}

async function formatJavaScriptCode(jscode: string) {
  return prettier.format(jscode, {
    parser: "babel",
    plugins: [prettierPluginBabel, prettierPluginEstree],
    printWidth: FORMAT_PRINT_WIDTH,
    semi: false,
  })
}

function parseWrappedCode(formattedCode: string) {
  const wrappedCode = `${WRAPPER_PREFIX}${formattedCode}${WRAPPER_SUFFIX}`
  const ast = parse(wrappedCode, {
    sourceType: "script",
    plugins: ["typescript"],
    errorRecovery: false,
    allowReturnOutsideFunction: false,
  })

  return ast
}

function unwrapPosition(position: number) {
  return Math.max(0, position - WRAPPER_PREFIX.length)
}

function isAstNode(value: unknown): value is Node {
  return isRecord(value) && typeof value.type === "string"
}

function walkAst(node: Node, visit: (node: Node) => void) {
  visit(node)

  for (const [key, value] of Object.entries(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "leadingComments" ||
      key === "innerComments" ||
      key === "trailingComments"
    ) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          walkAst(item, visit)
        }
      }
      continue
    }

    if (isAstNode(value)) {
      walkAst(value, visit)
    }
  }
}

function collectLocalFunctionNames(ast: File) {
  const names = new Set<string>()

  walkAst(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name) {
      names.add(node.id.name)
      return
    }

    if (node.type === "VariableDeclarator") {
      const id = node.id
      const init = node.init

      if (
        id.type === "Identifier" &&
        (init?.type === "ArrowFunctionExpression" ||
          init?.type === "FunctionExpression")
      ) {
        names.add(id.name)
      }
    }
  })

  return names
}

function getStaticMemberName(node: Expression | null | undefined): string | null {
  if (!node) {
    return null
  }

  if (node.type === "Identifier") {
    return node.name
  }

  if (node.type === "ThisExpression" || node.type === "Super") {
    return null
  }

  if (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression") {
    return null
  }

  if (node.computed) {
    return null
  }

  const objectName = getStaticMemberName(node.object as Expression)
  const property = node.property

  if (!objectName || property.type !== "Identifier") {
    return null
  }

  return `${objectName}.${property.name}`
}

function getMemberPropertyName(node: Expression | null | undefined) {
  if (!node) {
    return null
  }

  if (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression") {
    return null
  }

  if (node.computed || node.property.type !== "Identifier") {
    return null
  }

  return node.property.name
}

function getRootIdentifier(name: string) {
  return name.split(".")[0] ?? name
}

function validateCallExpression(
  node: CallExpression | OptionalCallExpression,
  options: {
    allowedFunctions: Set<string>
    allowedFunctionList: string[]
    localFunctionNames: Set<string>
    formattedCode: string
  }
): ValidationFailure | null {
  const callee = node.callee
  const position = unwrapPosition(node.start ?? 0)
  const end = unwrapPosition(node.end ?? node.start ?? 0)

  if (callee.type === "Import") {
    return createErrorResponse(
      "JAVASCRIPT_PERMISSION_ERROR",
      "Dynamic import is not allowed in sandbox JavaScript.",
      options.formattedCode,
      position,
      {
        detail: "Use only the provided sandbox functions and deterministic JavaScript.",
        functionName: "import",
        allowedFunctions: options.allowedFunctionList,
        end,
      }
    )
  }

  if (
    callee.type === "MemberExpression" ||
    callee.type === "OptionalMemberExpression"
  ) {
    if (callee.computed) {
      return createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        "Computed function calls are not allowed in sandbox JavaScript.",
        options.formattedCode,
        position,
        {
          detail: "Call functions by their static names, for example readFile(...).",
          functionName: "computed member call",
          allowedFunctions: options.allowedFunctionList,
          end,
        }
      )
    }

    const memberName = getStaticMemberName(callee)
    const propertyName = getMemberPropertyName(callee)

    if (!memberName || !propertyName) {
      return createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        "Unable to verify this function call.",
        options.formattedCode,
        position,
        {
          detail: "Only direct static function calls are allowed.",
          functionName: "unknown member call",
          allowedFunctions: options.allowedFunctionList,
          end,
        }
      )
    }

    if (
      DISALLOWED_MEMBER_NAMES.has(propertyName) ||
      DISALLOWED_IDENTIFIERS.has(getRootIdentifier(memberName))
    ) {
      return createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        `Function call is not allowed: ${memberName}`,
        options.formattedCode,
        position,
        {
          detail: "This function can access restricted runtime capabilities.",
          functionName: memberName,
          allowedFunctions: options.allowedFunctionList,
          end,
        }
      )
    }

    if (
      !options.allowedFunctions.has(memberName) &&
      !ALLOWED_METHOD_NAMES.has(propertyName)
    ) {
      return createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        `Function call is not allowed: ${memberName}`,
        options.formattedCode,
        position,
        {
          detail: "Use only the provided sandbox functions or safe built-in methods.",
          functionName: memberName,
          allowedFunctions: options.allowedFunctionList,
          end,
        }
      )
    }

    return null
  }

  if (callee.type !== "Identifier") {
    return createErrorResponse(
      "JAVASCRIPT_PERMISSION_ERROR",
      "Unable to verify this function call.",
      options.formattedCode,
      position,
      {
        detail: "Indirect calls are not allowed. Call a known function by name.",
        functionName: "indirect call",
        allowedFunctions: options.allowedFunctionList,
        end,
      }
    )
  }

  const functionName = callee.name

  if (DISALLOWED_IDENTIFIERS.has(functionName)) {
    return createErrorResponse(
      "JAVASCRIPT_PERMISSION_ERROR",
      `Function call is not allowed: ${functionName}`,
      options.formattedCode,
      position,
      {
        detail: "This function can access restricted runtime capabilities.",
        functionName,
        allowedFunctions: options.allowedFunctionList,
        end,
      }
    )
  }

  if (
    !options.allowedFunctions.has(functionName) &&
    !options.localFunctionNames.has(functionName)
  ) {
    return createErrorResponse(
      "JAVASCRIPT_PERMISSION_ERROR",
      `Unknown or unavailable function call: ${functionName}`,
      options.formattedCode,
      position,
      {
        detail: "Use a function from javascriptTools or define a local helper function before calling it.",
        functionName,
        allowedFunctions: options.allowedFunctionList,
        end,
      }
    )
  }

  return null
}

function validateRestrictedSyntax(ast: File, formattedCode: string) {
  let failure: ValidationFailure | null = null

  walkAst(ast, (node) => {
    if (failure) {
      return
    }

    if (node.type === "ImportDeclaration") {
      const position = unwrapPosition(node.start ?? 0)
      const end = unwrapPosition(node.end ?? node.start ?? 0)
      failure = createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        "Import declarations are not allowed in sandbox JavaScript.",
        formattedCode,
        position,
        {
          detail: "Use only the arguments and sandbox functions provided by the tool.",
          functionName: "import",
          end,
        }
      )
      return
    }

    if (node.type === "ExportNamedDeclaration") {
      const position = unwrapPosition(node.start ?? 0)
      const end = unwrapPosition(node.end ?? node.start ?? 0)
      failure = createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        "Export declarations are not allowed in sandbox JavaScript.",
        formattedCode,
        position,
        {
          detail: "Sandbox JavaScript is executed as a function body, not as a module.",
          functionName: "export",
          end,
        }
      )
      return
    }

    if (node.type === "ExportDefaultDeclaration") {
      const position = unwrapPosition(node.start ?? 0)
      const end = unwrapPosition(node.end ?? node.start ?? 0)
      failure = createErrorResponse(
        "JAVASCRIPT_PERMISSION_ERROR",
        "Export declarations are not allowed in sandbox JavaScript.",
        formattedCode,
        position,
        {
          detail: "Sandbox JavaScript is executed as a function body, not as a module.",
          functionName: "export",
          end,
        }
      )
      return
    }

    if (node.type === "NewExpression") {
      const calleeName =
        node.callee.type === "Identifier"
          ? node.callee.name
          : getStaticMemberName(node.callee as Expression)

      if (calleeName === "Function" || calleeName === "Worker") {
        const position = unwrapPosition(node.start ?? 0)
        const end = unwrapPosition(node.end ?? node.start ?? 0)
        failure = createErrorResponse(
          "JAVASCRIPT_PERMISSION_ERROR",
          `Constructor is not allowed: ${calleeName}`,
          formattedCode,
          position,
          {
            detail: "Dynamic code execution and worker creation are blocked.",
            functionName: calleeName,
            end,
          }
        )
      }
    }
  })

  return failure
}

function validateFunctionCalls(
  ast: File,
  formattedCode: string,
  allowedToolNames: string[]
) {
  const allowedFunctions = new Set([
    ...allowedToolNames,
    ...ALLOWED_GLOBAL_FUNCTIONS,
    ...ALLOWED_MEMBER_FUNCTIONS,
  ])
  const allowedFunctionList = Array.from(allowedFunctions).sort()
  const localFunctionNames = collectLocalFunctionNames(ast)
  let failure: ValidationFailure | null = null

  walkAst(ast, (node) => {
    if (failure) {
      return
    }

    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      failure = validateCallExpression(node, {
        allowedFunctions,
        allowedFunctionList,
        localFunctionNames,
        formattedCode,
      })
    }
  })

  return failure
}

function statementAlwaysReturns(statement: Statement): boolean {
  if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") {
    return true
  }

  if (statement.type === "BlockStatement") {
    return blockAlwaysReturns(statement)
  }

  if (statement.type === "IfStatement") {
    return Boolean(
      statement.alternate &&
        statementAlwaysReturns(statement.consequent) &&
        statementAlwaysReturns(statement.alternate)
    )
  }

  if (statement.type === "SwitchStatement") {
    if (statement.cases.length === 0) {
      return false
    }

    const hasDefault = statement.cases.some((switchCase) => !switchCase.test)

    if (!hasDefault) {
      return false
    }

    return statement.cases.every((switchCase) =>
      blockStatementsAlwaysReturn(switchCase.consequent)
    )
  }

  if (statement.type === "TryStatement") {
    if (statement.finalizer && blockAlwaysReturns(statement.finalizer)) {
      return true
    }

    return Boolean(
      statement.handler &&
        blockAlwaysReturns(statement.block) &&
        blockAlwaysReturns(statement.handler.body)
    )
  }

  return false
}

function blockStatementsAlwaysReturn(statements: Statement[]) {
  return statements.some(statementAlwaysReturns)
}

function blockAlwaysReturns(block: BlockStatement) {
  return blockStatementsAlwaysReturn(block.body)
}

function getSandboxMainBody(ast: File): BlockStatement | null {
  const firstStatement = ast.program.body[0]

  if (
    firstStatement?.type !== "FunctionDeclaration" ||
    firstStatement.id?.name !== "__sandbox_main__"
  ) {
    return null
  }

  return firstStatement.body
}

function validateAllPathsReturn(ast: File, formattedCode: string) {
  const body = getSandboxMainBody(ast)

  if (!body || blockAlwaysReturns(body)) {
    return null
  }

  const lastStatement = body.body.at(-1)
  const position = unwrapPosition(lastStatement?.end ?? body.end ?? 0)

  return createErrorResponse(
    "JAVASCRIPT_RETURN_PATH_ERROR",
    "Not all execution paths return a result.",
    formattedCode,
    position,
    {
      detail:
        "End the code with a final return statement, or make sure every if/else, switch, and try/catch path returns.",
      functionName: "return",
      end: position,
    }
  )
}

export async function validateJavaScriptCode(
  jscode: string,
  options: ValidateJavaScriptOptions
): Promise<JavaScriptValidationResult> {
  let formattedCode: string

  try {
    formattedCode = (await formatJavaScriptCode(jscode)).trim()
  } catch (error) {
    const position = getErrorPosition(error, jscode)

    return createErrorResponse(
      "JAVASCRIPT_FORMAT_ERROR",
      "JavaScript formatting failed before execution.",
      jscode,
      position,
      {
        detail: error instanceof Error ? error.message : "Unknown format error.",
      }
    )
  }

  let ast: File
  try {
    ast = parseWrappedCode(formattedCode)
  } catch (error) {
    const position = unwrapPosition(
      getErrorPosition(error, `${WRAPPER_PREFIX}${formattedCode}${WRAPPER_SUFFIX}`)
    )

    return createErrorResponse(
      "JAVASCRIPT_PARSE_ERROR",
      "JavaScript syntax error before execution.",
      formattedCode,
      position,
      {
        detail: error instanceof Error ? error.message : "Unknown parse error.",
      }
    )
  }

  const restrictedSyntaxFailure = validateRestrictedSyntax(ast, formattedCode)

  if (restrictedSyntaxFailure) {
    return restrictedSyntaxFailure
  }

  const functionFailure = validateFunctionCalls(
    ast,
    formattedCode,
    options.allowedToolNames
  )

  if (functionFailure) {
    return functionFailure
  }

  const returnPathFailure = validateAllPathsReturn(ast, formattedCode)

  if (returnPathFailure) {
    return returnPathFailure
  }

  return {
    valid: true,
    formattedCode,
  }
}
