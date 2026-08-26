import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common"
import { JavaScriptReturnType, ToolArgs } from "./types"
import { validateJavaScriptCode } from "./validator"

const EXECUTION_TIMEOUT_MS = 3000
const MAX_TOOL_CALLS = 30
const MAX_TOOL_RESULT_CHARS = 200_000

const BLOCKED_GLOBALS = [
  "window",
  "self",
  "globalThis",
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
  "crypto",
  "eval",
  "Function",
]

const SANDBOX_WORKER_SCRIPT = `
const pendingToolCalls = new Map();
let toolCallSequence = 0;

globalThis.addEventListener("message", async (event) => {
  const payload = event.data;

  if (!payload) {
    return;
  }

  if (payload.type === "EXECUTE_JAVASCRIPT_TOOL_RESULT") {
    const pending = pendingToolCalls.get(payload.callId);

    if (!pending) {
      return;
    }

    pendingToolCalls.delete(payload.callId);

    if (payload.status === "ok") {
      pending.resolve(payload.result);
      return;
    }

    const error = new Error(payload.error?.message || "Tool call failed");
    error.name = payload.error?.name || "ToolCallError";
    pending.reject(error);
    return;
  }

  if (payload.type !== "EXECUTE_JAVASCRIPT") {
    return;
  }

  const workerRoot = globalThis;
  const WorkerAsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const postResult = workerRoot.postMessage.bind(workerRoot);
  const blockedGlobals = Array.isArray(payload.blockedGlobals)
    ? payload.blockedGlobals
    : [];
  const blockedParameterNames = blockedGlobals.filter(
    (name) => name !== "eval" && name !== "arguments" && /^[A-Za-z_$][\\w$]*$/.test(name)
  );

  for (const name of blockedGlobals) {
    try {
      Object.defineProperty(workerRoot, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    } catch (_error) {
    }
  }

  const capabilityNames = Array.isArray(payload.capabilityNames)
    ? payload.capabilityNames.filter((name) => /^[A-Za-z_$][\\w$]*$/.test(name))
    : [];

  const createHostTool = (name) => {
    return (...toolArgs) => {
      const callId = payload.id + ":" + (++toolCallSequence);

      return new Promise((resolve, reject) => {
        pendingToolCalls.set(callId, { resolve, reject });
        postResult({
          id: payload.id,
          callId,
          type: "EXECUTE_JAVASCRIPT_TOOL_CALL",
          name,
          args: toolArgs,
        });
      });
    };
  };

  try {
    const execute = new WorkerAsyncFunction(
      ...blockedParameterNames,
      ...capabilityNames,
      "args",
      '"use strict";\\nlet response = undefined;\\n' +
        payload.jscode +
        "\\nreturn response;"
    );

    const result = await execute(
      ...blockedParameterNames.map(() => undefined),
      ...capabilityNames.map(createHostTool),
      payload.args
    );

    postResult({
      id: payload.id,
      type: "EXECUTE_JAVASCRIPT_RESULT",
      status: "ok",
      result,
    });
  } catch (error) {
    postResult({
      id: payload.id,
      type: "EXECUTE_JAVASCRIPT_RESULT",
      status: "error",
      error: {
        name: error?.name || "Error",
        message: error?.message || "Execution failed",
        stack: error?.stack,
      },
    });
  }
});
`

const SANDBOX_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src 'none'; media-src 'none'; frame-src 'none'; worker-src blob:; style-src 'none';"
    />
  </head>
  <body>
    <script>
      const sandboxRoot = globalThis;
      const SandboxBlob = Blob;
      const SandboxWorker = Worker;
      const sandboxURL = URL;
      const parentPostMessage = sandboxRoot.parent.postMessage.bind(sandboxRoot.parent);
      const postResult = (message) => parentPostMessage(message, "*");
      const blockedGlobals = ${JSON.stringify(BLOCKED_GLOBALS)};
      const workerSource = ${JSON.stringify(SANDBOX_WORKER_SCRIPT)};
      let activeWorker = null;
      let activeWorkerUrl = null;
      let activeTimeoutId = undefined;

      for (const name of blockedGlobals) {
        try {
          Object.defineProperty(sandboxRoot, name, {
            value: undefined,
            writable: false,
            configurable: false,
          });
        } catch (_error) {
        }
      }

      const cleanupWorker = () => {
        if (activeTimeoutId) {
          clearTimeout(activeTimeoutId);
          activeTimeoutId = undefined;
        }

        if (activeWorker) {
          activeWorker.terminate();
          activeWorker = null;
        }

        if (activeWorkerUrl) {
          sandboxURL.revokeObjectURL(activeWorkerUrl);
          activeWorkerUrl = null;
        }
      };

      sandboxRoot.addEventListener("message", (event) => {
        const payload = event.data;

        if (!payload) {
          return;
        }

        if (payload.type === "EXECUTE_JAVASCRIPT_TOOL_RESULT") {
          activeWorker?.postMessage(payload);
          return;
        }

        if (payload.type !== "EXECUTE_JAVASCRIPT") {
          return;
        }

        const capabilityNames = Array.isArray(payload.capabilityNames)
          ? payload.capabilityNames.filter((name) => /^[A-Za-z_$][\\w$]*$/.test(name))
          : [];

        try {
          cleanupWorker();

          activeWorkerUrl = sandboxURL.createObjectURL(
            new SandboxBlob([workerSource], { type: "text/javascript" })
          );
          activeWorker = new SandboxWorker(activeWorkerUrl);

          activeWorker.onmessage = (workerEvent) => {
            const workerPayload = workerEvent.data;

            if (!workerPayload || workerPayload.id !== payload.id) {
              return;
            }

            if (workerPayload.type === "EXECUTE_JAVASCRIPT_TOOL_CALL") {
              postResult(workerPayload);
              return;
            }

            if (workerPayload.type === "EXECUTE_JAVASCRIPT_RESULT") {
              cleanupWorker();
              postResult(workerPayload);
            }
          };

          activeWorker.onerror = (error) => {
            cleanupWorker();
            postResult({
              id: payload.id,
              type: "EXECUTE_JAVASCRIPT_RESULT",
              status: "error",
              error: {
                name: "WorkerError",
                message: error.message || "Worker execution failed",
              },
            });
          };

          activeTimeoutId = setTimeout(() => {
            cleanupWorker();
            postResult({
              id: payload.id,
              type: "EXECUTE_JAVASCRIPT_RESULT",
              status: "error",
              error: {
                name: "ExecutionTimeoutError",
                message: "JavaScript execution timed out after " + payload.timeoutMs + "ms.",
              },
            });
          }, payload.timeoutMs);

          activeWorker.postMessage({
            id: payload.id,
            type: "EXECUTE_JAVASCRIPT",
            jscode: payload.jscode,
            args: payload.args,
            capabilityNames,
            blockedGlobals,
          });
        } catch (error) {
          cleanupWorker();
          postResult(
            {
              id: payload.id,
              type: "EXECUTE_JAVASCRIPT_RESULT",
              status: "error",
              error: {
                name: error?.name || "Error",
                message: error?.message || "Execution failed",
                stack: error?.stack,
              },
            }
          );
        }
      });
    </script>
  </body>
</html>`

function getValueType(
  value: unknown
): JavaScriptReturnType | "undefined" | "null" {
  if (value === undefined) {
    return "undefined"
  }

  if (value === null) {
    return "null"
  }

  if (Array.isArray(value)) {
    return "array"
  }

  const valueType = typeof value

  if (
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "string"
  ) {
    return valueType
  }

  if (valueType === "object") {
    return "object"
  }

  return valueType as JavaScriptReturnType
}

function validateReturnType(value: unknown, returnType: JavaScriptReturnType) {
  if (returnType === "void") {
    return value === undefined
  }

  if (returnType === "number") {
    return typeof value === "number" && Number.isFinite(value)
  }

  if (returnType === "boolean") {
    return typeof value === "boolean"
  }

  if (returnType === "string") {
    return typeof value === "string"
  }

  if (returnType === "array") {
    return Array.isArray(value)
  }

  if (returnType === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  return false
}

function createExecutionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

async function loadJavascriptTools() {
  const module = await import("../index")
  return module.javascriptTools.filter((tool) =>
    /^[A-Za-z_$][\w$]*$/.test(tool.name)
  )
}

function normalizeSandboxToolArgs(toolName: string, rawArgs: unknown[]) {
  if (rawArgs.length === 0) {
    return {}
  }

  if (rawArgs.length === 1 && isRecord(rawArgs[0])) {
    return rawArgs[0]
  }

  if (rawArgs.length === 1 && typeof rawArgs[0] === "string") {
    if (toolName === "readFile" || toolName === "editFile") {
      return { file_path: rawArgs[0] }
    }

    if (toolName === "globSearchFile" || toolName === "grepSearchFile") {
      return { pattern: rawArgs[0] }
    }
  }

  if (toolName === "writeFile" && rawArgs.length === 2) {
    return {
      path: rawArgs[0],
      content: rawArgs[1],
    }
  }

  return { args: rawArgs }
}

function isSuccessfulToolResponse(response: unknown) {
  if (!isRecord(response)) {
    return true
  }

  const status = response.status

  return (
    status === "ok" ||
    status === "succeed" ||
    status === "loaded" ||
    status === "already_loaded" ||
    status === "partial"
  )
}

function getToolResponseErrorMessage(response: unknown) {
  if (!isRecord(response)) {
    return "Tool call failed."
  }

  return (
    (typeof response.message === "string" && response.message) ||
    (isRecord(response.error) &&
      typeof response.error.detail === "string" &&
      response.error.detail) ||
    "Tool call failed."
  )
}

function unwrapToolResponse(response: unknown) {
  if (isRecord(response) && "data" in response) {
    return response.data
  }

  return response
}

function ensureToolResultSize(value: unknown) {
  const text = JSON.stringify(value)

  if (text && text.length > MAX_TOOL_RESULT_CHARS) {
    throw new Error(
      `Tool result is too large for sandbox JavaScript (${text.length}/${MAX_TOOL_RESULT_CHARS} chars).`
    )
  }

  return value
}

async function executeSandboxTool(
  props: AgentExecutorProps,
  toolsByName: Map<string, AgentTool>,
  toolName: string,
  rawArgs: unknown[]
) {
  const tool = toolsByName.get(toolName)

  if (!tool) {
    throw new Error(`Tool "${toolName}" is not available in sandbox JavaScript.`)
  }

  const args = normalizeSandboxToolArgs(toolName, rawArgs)
  const response = await tool.executor({
    ...props,
    args,
  })

  if (!isSuccessfulToolResponse(response)) {
    throw new Error(getToolResponseErrorMessage(response))
  }

  return ensureToolResultSize(unwrapToolResponse(response))
}

async function executeInSandbox(
  props: AgentExecutorProps,
  input: ToolArgs,
  javascriptTools: AgentTool[]
) {
  const capabilityNames = javascriptTools.map((tool) => tool.name)
  const toolsByName = new Map(javascriptTools.map((tool) => [tool.name, tool]))

  return new Promise<unknown>((resolve, reject) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      reject(new Error("JavaScript sandbox requires a browser environment."))
      return
    }

    const iframe = document.createElement("iframe")
    const executionId = createExecutionId()
    let toolCallCount = 0
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      window.removeEventListener("message", handleMessage)
      iframe.remove()
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) {
        return
      }

      const payload = event.data

      if (
        !payload ||
        payload.id !== executionId ||
        (payload.type !== "EXECUTE_JAVASCRIPT_RESULT" &&
          payload.type !== "EXECUTE_JAVASCRIPT_TOOL_CALL")
      ) {
        return
      }

      if (payload.type === "EXECUTE_JAVASCRIPT_TOOL_CALL") {
        if (toolCallCount >= MAX_TOOL_CALLS) {
          iframe.contentWindow?.postMessage(
            {
              id: executionId,
              callId: payload.callId,
              type: "EXECUTE_JAVASCRIPT_TOOL_RESULT",
              status: "error",
              error: {
                name: "ToolCallLimitError",
                message: `Sandbox JavaScript can call tools at most ${MAX_TOOL_CALLS} times per execution.`,
              },
            },
            "*"
          )
          return
        }

        toolCallCount += 1

        executeSandboxTool(
          props,
          toolsByName,
          payload.name,
          Array.isArray(payload.args) ? payload.args : []
        )
          .then((result) => {
            iframe.contentWindow?.postMessage(
              {
                id: executionId,
                callId: payload.callId,
                type: "EXECUTE_JAVASCRIPT_TOOL_RESULT",
                status: "ok",
                result,
              },
              "*"
            )
          })
          .catch((error: Error) => {
            iframe.contentWindow?.postMessage(
              {
                id: executionId,
                callId: payload.callId,
                type: "EXECUTE_JAVASCRIPT_TOOL_RESULT",
                status: "error",
                error: {
                  name: error.name || "ToolCallError",
                  message: error.message || "Tool call failed.",
                },
              },
              "*"
            )
          })
        return
      }

      cleanup()

      if (payload.status === "ok") {
        resolve(payload.result)
        return
      }

      const error = new Error(payload.error?.message || "Execution failed")
      error.name = payload.error?.name || "Error"
      error.stack = payload.error?.stack
      reject(error)
    }

    iframe.setAttribute("sandbox", "allow-scripts")
    iframe.style.display = "none"
    iframe.srcdoc = SANDBOX_HTML

    window.addEventListener("message", handleMessage)
    document.body.appendChild(iframe)

    timeoutId = setTimeout(() => {
      cleanup()
      reject(
        new Error(
          `JavaScript sandbox did not respond after ${EXECUTION_TIMEOUT_MS}ms.`
        )
      )
    }, EXECUTION_TIMEOUT_MS + 1000)

    iframe.addEventListener(
      "load",
      () => {
        iframe.contentWindow?.postMessage(
          {
            id: executionId,
            type: "EXECUTE_JAVASCRIPT",
            jscode: input.jscode,
            args: input.args ?? {},
            capabilityNames,
            timeoutMs: EXECUTION_TIMEOUT_MS,
          },
          "*"
        )
      },
      { once: true }
    )
  })
}

export async function executor(_props: AgentExecutorProps, input: ToolArgs) {
  const { returnType } = input

  try {
    const javascriptTools = await loadJavascriptTools()
    const validation = await validateJavaScriptCode(input.jscode, {
      allowedToolNames: javascriptTools.map((tool) => tool.name),
    })

    if (!validation.valid) {
      return validation.response
    }

    const result = await executeInSandbox(
      _props,
      {
        ...input,
        jscode: validation.formattedCode,
      },
      javascriptTools
    )

    if (!validateReturnType(result, returnType)) {
      const actual = getValueType(result)

      return {
        status: "error",
        code: 422,
        data: null,
        error: {
          type: "RETURN_TYPE_MISMATCH",
          message: `JavaScript tool expected returnType "${returnType}" but received "${actual}". Assign the final result to "response" and make sure it matches returnType.`,
          expected: returnType,
          actual,
        },
      }
    }

    return {
      status: "ok",
      data: result,
    }
  } catch (error: any) {
    return {
      status: "error",
      error: error.message || "Execution failed",
      stack: error.stack,
    }
  }
}
