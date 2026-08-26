import { decodeContent } from "@/lib/utils";
import { FileManager, fs, PathUtils } from "../files";

type JsonSchema = {
    type?: string;
    required?: string[];
    properties?: Record<string, JsonSchema>;
    enum?: unknown[];
    items?: JsonSchema;
    additionalProperties?: boolean | JsonSchema;
    description?: string;
};

export type SkillScriptToolMeta = {
    name: string;
    description: string;
    prompt?: string;
    roles?: string[];
    rules?: string[];
    examples?: string[];
    inputSchema?: JsonSchema;
};

export type SkillScriptContext = {
    skillName: string;
    skillPath: string;
    scriptName: string;
    fs: {
        readText: (path: string) => Promise<string | null>;
        exists: (path: string) => Promise<boolean>;
    };
};

export type SkillScriptModule = {
    tool?: SkillScriptToolMeta;
    run?: (args: unknown, context: SkillScriptContext) => unknown | Promise<unknown>;
};

export type MountedSkillScript = {
    skillName: string;
    skillPath: string;
    scriptName: string;
    scriptPath: string;
    objectUrl: string;
    module: SkillScriptModule;
    tool: Required<SkillScriptToolMeta>;
};

const toArrayBufferText = (content: unknown) => decodeContent(content as Parameters<typeof decodeContent>[0]);
const withoutExtension = (path: string) => path.replace(/\.[^.]+$/, "");

const validateJsonValue = (schema: JsonSchema | undefined, value: unknown, path = "args"): string[] => {
    if (!schema) return [];

    const errors: string[] = [];
    const type = schema.type;

    if (type === "object") {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return [`${path} must be an object.`];
        }

        const record = value as Record<string, unknown>;
        for (const key of schema.required ?? []) {
            if (record[key] === undefined) {
                errors.push(`${path}.${key} is required.`);
            }
        }

        for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
            if (record[key] !== undefined) {
                errors.push(...validateJsonValue(propertySchema, record[key], `${path}.${key}`));
            }
        }

        return errors;
    }

    if (type === "array") {
        if (!Array.isArray(value)) {
            return [`${path} must be an array.`];
        }

        value.forEach((item, index) => {
            errors.push(...validateJsonValue(schema.items, item, `${path}[${index}]`));
        });
    }

    if (type === "string" && typeof value !== "string") {
        errors.push(`${path} must be a string.`);
    }

    if ((type === "number" || type === "integer") && typeof value !== "number") {
        errors.push(`${path} must be a number.`);
    }

    if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) {
        errors.push(`${path} must be an integer.`);
    }

    if (type === "boolean" && typeof value !== "boolean") {
        errors.push(`${path} must be a boolean.`);
    }

    if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path} must be one of: ${schema.enum.map(item => JSON.stringify(item)).join(", ")}.`);
    }

    return errors;
};

class SkillScriptRegistry {
    private scripts = new Map<string, MountedSkillScript>();

    private key(skillName: string, scriptName: string) {
        return `${skillName}:${scriptName}`;
    }

    async mountSkillScripts(skillName: string, skillPath?: string): Promise<MountedSkillScript[]> {
        if (!skillPath) return [];

        this.unmountSkill(skillName);

        const scriptsPath = PathUtils.join(skillPath, "scripts");
        if (!(await fs.exists(scriptsPath))) {
            return [];
        }

        const { files } = await fs.readDirectory(scriptsPath);
        const jsFiles = files
            .map(file => file.fullPath)
            .filter(path => path.endsWith(".js"))
            .sort((a, b) => a.localeCompare(b));

        const mounted: MountedSkillScript[] = [];
        for (const scriptPath of jsFiles) {
            const script = await this.mountScript(skillName, skillPath, scriptPath);
            if (script) mounted.push(script);
        }

        return mounted;
    }

    unmountSkill(skillName: string) {
        const revokedUrls = new Set<string>();
        for (const [key, script] of this.scripts.entries()) {
            if (script.skillName === skillName) {
                if (!revokedUrls.has(script.objectUrl)) {
                    URL.revokeObjectURL(script.objectUrl);
                    revokedUrls.add(script.objectUrl);
                }
                this.scripts.delete(key);
            }
        }
    }

    list(skillName?: string) {
        const all = Array.from(new Map(
            Array.from(this.scripts.values()).map(script => [script.scriptPath, script]),
        ).values());
        return skillName ? all.filter(script => script.skillName === skillName) : all;
    }

    get(skillName: string, scriptName: string) {
        return this.scripts.get(this.key(skillName, scriptName));
    }

    async mountSkillScript(skillName: string, skillPath: string | undefined, scriptName: string) {
        if (!skillPath) return null;

        const mounted = this.get(skillName, scriptName);
        if (mounted) return mounted;

        const normalizedSkillPath = PathUtils.normalize(skillPath);
        const normalizedScriptName = PathUtils.normalize(scriptName);
        if (!FileManager.verifyFilePath(normalizedScriptName)) {
            return null;
        }

        const scriptFile = normalizedScriptName.endsWith(".js")
            ? normalizedScriptName
            : `${normalizedScriptName}.js`;
        const mountedSkillPaths = FileManager
            .getPaths()
            .filter(path => PathUtils.isInside(normalizedSkillPath, path))
            .reverse();

        const candidates = [
            PathUtils.join(normalizedSkillPath, scriptFile),
            PathUtils.join(normalizedSkillPath, "scripts", scriptFile),
            ...mountedSkillPaths.map(path => PathUtils.join(path, scriptFile)),
        ];

        for (const candidate of Array.from(new Set(candidates))) {
            if (!PathUtils.isInside(normalizedSkillPath, candidate) || !(await fs.exists(candidate))) {
                continue;
            }

            const script = await this.mountScript(skillName, normalizedSkillPath, candidate, scriptName);
            if (script) {
                return script;
            }
        }

        return null;
    }

    validateArgs(script: MountedSkillScript, args: unknown) {
        return validateJsonValue(script.tool.inputSchema, args);
    }

    private async mountScript(skillName: string, skillPath: string, scriptPath: string, aliasName?: string) {
        const existing = this.list(skillName).find(script => script.scriptPath === scriptPath);
        if (existing) {
            if (aliasName) {
                this.scripts.set(this.key(skillName, withoutExtension(aliasName)), existing);
            }
            return existing;
        }

        const raw = await fs.readFile(scriptPath);
        const code = toArrayBufferText(raw);
        const blob = new Blob([code], { type: "text/javascript" });
        const objectUrl = URL.createObjectURL(blob);

        try {
            const mod = await import(/* @vite-ignore */ objectUrl) as SkillScriptModule;
            const fallbackName = withoutExtension(PathUtils.basename(scriptPath));
            const tool = {
                name: mod.tool?.name || fallbackName,
                description: mod.tool?.description || `Run ${fallbackName}.`,
                prompt: mod.tool?.prompt || "",
                roles: mod.tool?.roles || [],
                rules: mod.tool?.rules || [],
                examples: mod.tool?.examples || [],
                inputSchema: mod.tool?.inputSchema || { type: "object", properties: {} },
            };

            if (typeof mod.run !== "function") {
                throw new Error(`Skill script ${scriptPath} must export run(args, context).`);
            }

            const mounted: MountedSkillScript = {
                skillName,
                skillPath,
                scriptName: tool.name,
                scriptPath,
                objectUrl,
                module: mod,
                tool,
            };

            this.scripts.set(this.key(skillName, tool.name), mounted);
            if (aliasName && aliasName !== tool.name) {
                this.scripts.set(this.key(skillName, withoutExtension(aliasName)), mounted);
            }
            return mounted;
        } catch (error) {
            URL.revokeObjectURL(objectUrl);
            console.error(`[SkillScriptRegistry] Failed to mount ${scriptPath}`, error);
            return null;
        }
    }
}

export const skillScriptRegistry = new SkillScriptRegistry();
