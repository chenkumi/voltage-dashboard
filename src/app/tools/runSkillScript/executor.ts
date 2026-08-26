import { AgentExecutorProps } from "@/app/agent/agent-common";
import { AgentStateRepository } from "@/app/agent/state-repository";
import {
    toolBlocked,
    toolError,
    toolException,
    toolNotFound,
    toolSucceed,
} from "../shared/response";
import SkillManager from "../../system/skills";
import { skillScriptRegistry } from "../../system/skillScripts/registry";
import { ToolArgs } from "./types";

const AGENT_NAME = "assistant";

export async function executor(
    props: AgentExecutorProps,
    input: ToolArgs,
) {
    const activeState = await AgentStateRepository.ensureActiveSegment(props.threadId, AGENT_NAME);
    const activeSkillName = activeState.activeSkill?.name;

    if (!activeSkillName) {
        return toolBlocked(
            "No active skill found. Unable to run skill script.",
            "Call loadSkill(skillName) first, then call runSkillScript(scriptName, args).",
            { scriptName: input.scriptName },
            {
                type: "SKILL_NOT_ACTIVE",
                detail: "Active skill is none.",
                retryable: true,
                example: 'loadSkill(skillName="skill-name")',
            },
        );
    }

    const skill = SkillManager.loadSkill(activeSkillName);
    if (!skill?.skillPath) {
        return toolNotFound(
            `Active skill not found: ${activeSkillName}.`,
            "Call loadSkill(skillName) again, then call runSkillScript(scriptName, args).",
            {
                activeSkillName,
                scriptName: input.scriptName,
            },
            {
                type: "SKILL_NOT_FOUND",
                detail: `Active skill ${activeSkillName} is not available or has no skillPath.`,
                retryable: true,
                example: 'loadSkill(skillName="skill-name")',
            },
        );
    }

    const script = skillScriptRegistry.get(activeSkillName, input.scriptName)
        || await skillScriptRegistry.mountSkillScript(activeSkillName, skill.skillPath, input.scriptName);

    if (!script) {
        return toolNotFound(
            `Skill script not found: ${input.scriptName}.`,
            "Place the script under the active skill folder, for example draw.js or scripts/draw.js, then call runSkillScript again.",
            {
                activeSkillName,
                scriptName: input.scriptName,
                mountedScripts: skillScriptRegistry.list(activeSkillName).map(item => ({
                    name: item.scriptName,
                    description: item.tool.description,
                    inputSchema: item.tool.inputSchema,
                })),
            },
            {
                type: "SKILL_SCRIPT_NOT_FOUND",
                detail: `Script ${input.scriptName}.js was not found under ${skill.skillPath}.`,
                retryable: true,
                example: 'runSkillScript(scriptName="draw", args={"spread":"three"})',
            },
        );
    }

    const validationErrors = skillScriptRegistry.validateArgs(script, input.args);
    if (validationErrors.length > 0) {
        return toolError(
            "Skill script arguments are invalid.",
            "Fix args according to the script inputSchema and call runSkillScript again.",
            {
                activeSkillName,
                scriptName: input.scriptName,
                inputSchema: script.tool.inputSchema,
                validationErrors,
            },
            {
                type: "SKILL_SCRIPT_ARGUMENTS_ERROR",
                detail: validationErrors.join(" "),
                retryable: true,
                example: 'runSkillScript(scriptName="draw", args={"spread":"three","question":"..."})',
            },
            400,
        );
    }

    try {
        const result = await script.module.run!(input.args, {
            skillName: activeSkillName,
            skillPath: skill.skillPath!,
            scriptName: input.scriptName,
            fs: {
                readText: (path: string) => SkillManager.loadDocument(activeSkillName, path),
                exists: async (path: string) => Boolean(await SkillManager.resolveSkillDocumentPath(activeSkillName, path)),
            },
        });

        return toolSucceed(
            "Skill script executed successfully.",
            {
                activeSkillName,
                scriptName: input.scriptName,
                result,
            },
            "Use the script result to continue the task.",
        );
    } catch (error: any) {
        return toolException(
            `Skill script execution failed: ${error?.message || "Unknown error"}`,
            "Inspect the error, fix arguments if possible, then retry once.",
            {
                activeSkillName,
                scriptName: input.scriptName,
            },
            {
                type: "SKILL_SCRIPT_EXECUTION_ERROR",
                detail: error?.stack || error?.message || String(error),
                retryable: true,
                example: 'runSkillScript(scriptName="draw", args={"spread":"three"})',
            },
        );
    }
}
