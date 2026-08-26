import { ModelContent, ModelMessageContentView} from "@/app/types";

export type ClaimedAction = {
    type: "file_write";
    target: string;
    requiredTools: string[];
    matchedToolCallId: string | null;
    verdict: "supported" | "unsupported" | "failed";
};

export type UnsupportedClaimCheck = {
    status: "ok" | "rejected";
    reason?: string;
    claimedActions: ClaimedAction[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
};

const extractFileTargets = (text: string) => {
    const matches = text.match(/[\w./-]+\.(?:md|txt|json|ts|tsx|js|jsx|css|html|yaml|yml|csv)/gi);
    return Array.from(new Set(matches ?? []));
};

const isSuccessfulToolOutput = (output: unknown) => {
    if (typeof output === "string") {
        return !/error|failed|失敗|錯誤/i.test(output);
    }

    if (isRecord(output)) {
        const status = output.status;
        if (typeof status === "string") {
            return !/error|failed/i.test(status);
        }
    }

    return output !== undefined && output !== null;
};

export const detectUnsupportedToolClaims = (
    userMessage: ModelMessageContentView,
    assistantContent: ModelContent,
    roundToolLog: unknown[],
): UnsupportedClaimCheck => {
    const userText = userMessage.content.text ?? "";
    const assistantText = assistantContent.text ?? "";
    const targets = extractFileTargets(userText);

    if (targets.length === 0 || !assistantText.trim()) {
        return { status: "ok", claimedActions: [] };
    }

    const writeToolNames = new Set(["writeFile", "editFile"]);
    const toolLogs = roundToolLog.filter(isRecord);
    const claimedActions: ClaimedAction[] = [];

    for (const target of targets) {
        if (!assistantText.includes(target)) {
            continue;
        }

        const matchedTool = toolLogs.find(tool => {
            const name = typeof tool.name === "string" ? tool.name : "";
            if (!writeToolNames.has(name)) {
                return false;
            }

            const inputText = JSON.stringify(tool.input ?? "");
            return inputText.includes(target);
        });

        const verdict = matchedTool
            ? isSuccessfulToolOutput(matchedTool.output) ? "supported" : "failed"
            : "unsupported";

        claimedActions.push({
            type: "file_write",
            target,
            requiredTools: ["writeFile", "editFile"],
            matchedToolCallId: typeof matchedTool?.id === "string" ? matchedTool.id : null,
            verdict,
        });
    }

    const unsupported = claimedActions.find(action => action.verdict !== "supported");
    if (!unsupported) {
        return { status: "ok", claimedActions };
    }

    return {
        status: "rejected",
        claimedActions,
        reason: `Assistant mentioned ${unsupported.target} as part of a file action, but no successful writeFile/editFile tool call was recorded.`,
    };
};
