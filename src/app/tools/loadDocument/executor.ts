import { AgentExecutorProps } from "@/app/agent/agent-common";
import { AgentStateRepository } from "@/app/agent/state-repository";
import {
    toolAlreadyLoaded,
    toolBlocked,
    toolLoaded,
    toolNotFound,
} from "../shared/response";
import SkillManager from "../../system/skills";
import { FileManager, PathUtils } from "../../system/files";
import { ToolArgs } from "./types";

const AGENT_NAME = "assistant";

const normalizeDocumentPath = (path: string) => path.replace(/[\\/]+/g, "/").replace(/^\/+/, "").trim();

export async function executor(
    props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { documentPath } = input;
    const normalizedDocumentPath = normalizeDocumentPath(documentPath);
    const activeState = await AgentStateRepository.ensureActiveSegment(props.threadId, AGENT_NAME);
    const activeSkillName = activeState.activeSkill?.name;

    if (!activeSkillName) {
        return toolBlocked(
            "No active skill found. Unable to read skill document.",
            "Call loadSkill(skillName) first, then call loadDocument(documentPath).",
            { documentPath: normalizedDocumentPath },
            {
                type: "SKILL_NOT_ACTIVE",
                detail: "Active skill is none.",
                retryable: true,
                example: 'loadSkill(skillName="skill-name")',
            },
        );
    }

    const activeSkill = SkillManager.loadSkill(activeSkillName);
    if (!activeSkill?.skillPath) {
        return toolBlocked(
            "Active skill has no folder path. Unable to read skill document.",
            "Call loadSkill(skillName) again or select another valid skill.",
            { activeSkillName, documentPath: normalizedDocumentPath },
            {
                type: "SKILL_PATH_MISSING",
                detail: `Active skill ${activeSkillName} has no skillPath.`,
                retryable: true,
                example: 'loadSkill(skillName="skill-name")',
            },
        );
    }

    const resolvedDocumentPath = await SkillManager.resolveSkillDocumentPath(activeSkillName, normalizedDocumentPath);
    if (!resolvedDocumentPath) {
        return toolNotFound(
            "Specified skill document not found or outside the active skill folder.",
            "Call loadDocument(documentPath) with a path under the active skill folder. Do not use paths outside the active skill directory.",
            {
                activeSkillName,
                documentPath: normalizedDocumentPath,
                skillPath: activeSkill.skillPath,
            },
            {
                type: "DOCUMENT_PATH_ERROR",
                detail: `Skill Document: ${normalizedDocumentPath} does not exist under ${activeSkill.skillPath}.`,
                retryable: true,
                example: 'loadDocument(documentPath="docs/example.md")',
            },
        );
    }

    const relativeDocumentPath = PathUtils.relative(activeSkill.skillPath, resolvedDocumentPath);

    const hasDocumentLoaded = activeState.loadedDocuments.some(document =>
        document.skillName === activeSkillName && document.path === relativeDocumentPath
    );

    if (hasDocumentLoaded) {
        FileManager.addPath(PathUtils.dirname(resolvedDocumentPath));

        return toolAlreadyLoaded(
            "Skill document is already loaded. Do not call again.",
            {
                activeSkillName,
                documentPath: relativeDocumentPath,
                resolvedPath: resolvedDocumentPath,
                mountedPaths: FileManager.getPaths(),
            },
            "Continue the task using the ACTIVE SKILL content. If more documents are needed, call loadDocument again.",
        );
    }

    const documentData = await SkillManager.loadDocument(activeSkillName, relativeDocumentPath);
    if (!documentData) {
        return toolNotFound(
            "Failed to read skill document.",
            "Verify documentPath or try again later.",
            {
                activeSkillName,
                documentPath: relativeDocumentPath,
                resolvedPath: resolvedDocumentPath,
            },
            {
                type: "DOCUMENT_READ_ERROR",
                detail: `Failed to read ${resolvedDocumentPath}.`,
                retryable: true,
                example: `loadDocument(documentPath="${relativeDocumentPath}")`,
            },
        );
    }

    FileManager.addPath(PathUtils.dirname(resolvedDocumentPath));
    FileManager.markFileAsRead(resolvedDocumentPath);

    await AgentStateRepository.addLoadedDocument(props.threadId, props.inputId, AGENT_NAME, {
        skillName: activeSkillName,
        path: relativeDocumentPath,
        content: documentData,
    }, []);

    return toolLoaded(
        "Skill document loaded successfully.",
        {
            activeSkillName,
            documentPath: relativeDocumentPath,
            resolvedPath: resolvedDocumentPath,
            mountedPaths: FileManager.getPaths(),
        },
        "Continue the task after reading the ACTIVE SKILL block. If more documents are needed, call loadDocument again.",
    );
}
