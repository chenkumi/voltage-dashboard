import { AgentExecutorProps } from "@/app/agent/agent-common";
import { AgentStateRepository } from "@/app/agent/state-repository";
import {
    toolAlreadyLoaded,
    toolLoaded,
    toolNotFound,
} from "../shared/response";
import SkillManager from "../../system/skills";
import { FileManager } from "../../system/files";
import { skillScriptRegistry } from "../../system/skillScripts/registry";
import { ToolArgs } from "./types";

const AGENT_NAME = "assistant";

export async function executor(
    props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { skillName } = input;
    const skill = SkillManager.loadSkill(skillName);
    if (!skill) {
        return toolNotFound(
            `Skill not found: ${skillName}.`,
            "Select a valid skillName from the skill registry and call loadSkill again.",
            { skillName },
            {
                type: "SKILL_NOT_FOUND",
                detail: `Skill Name: ${skillName} does not exist.`,
                retryable: true,
                example: 'loadSkill(skillName="skill-name")',
            },
        );
    }

    const activeState = await AgentStateRepository.ensureActiveSegment(props.threadId, AGENT_NAME);
    const previousSkillName = activeState.activeSkill?.name;
    const isSameSkillLoaded = previousSkillName === skillName;

    if (isSameSkillLoaded) {
        if (skill.skillPath) {
            FileManager.addPath(skill.skillPath);
        }

        return toolAlreadyLoaded(
            "This skill is already loaded. No need to reload.",
            {
                skillName,
                mountedPaths: FileManager.getPaths(),
            },
            "Do not call loadSkill for the same skill again. Use loadDocument(documentPath) to read files under the active skill folder.",
        );
    }

    if (previousSkillName && previousSkillName !== skillName) {
        skillScriptRegistry.unmountSkill(previousSkillName);
        FileManager.clearPaths();
    }

    await AgentStateRepository.setActiveSkill(props.threadId, props.inputId, AGENT_NAME, {
        skillName,
        skillPath: skill.skillPath,
        skillDocumentPaths: [],
    });

    if (skill.skillPath) {
        FileManager.addPath(skill.skillPath);
    }

    return toolLoaded(
        "Skill loaded successfully.",
        {
            skillName,
            mountedPaths: FileManager.getPaths(),
        },
        "Continue the task after reading the ACTIVE SKILL block. Use loadDocument(documentPath) for files under the active skill folder or runSkillScript(scriptName, args) to dynamically mount and execute a script.",
    );
}
