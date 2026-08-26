import { decodeContent, FileManager, fs, PathUtils } from "../files";
import { parseSkill } from "./parser";
import { Skill } from "./types";

const DEFAULT_SKILLS_ROOT = "root";

export class SkillsLoaderImpl {
    _skills: Map<string, Skill> = new Map<string, Skill>();
    _initialized = false;

    public async init(skillsRoot: string = DEFAULT_SKILLS_ROOT) {
        if (this._initialized) return;
        await this.scan(skillsRoot);
        this._initialized = true;
    }

    public async scan(skillsRoot: string = DEFAULT_SKILLS_ROOT) {
        console.log("[SkillsLoader] Starting recursive scan:", skillsRoot);
        this._skills.clear();

        const normalizedRoot = PathUtils.normalize(skillsRoot);

        if (!(await fs.exists(normalizedRoot))) {
            console.warn("[SkillsLoader] Root path does not exist:", normalizedRoot);
            return;
        }

        await this._recursiveScan(normalizedRoot);
        console.log(`[SkillsLoader] Scan completed. Found ${this._skills.size} skills.`);
    }

    private async _recursiveScan(currentPath: string) {
        const skillMdPath = PathUtils.join(currentPath, "SKILL.md");

        if (await fs.exists(skillMdPath)) {
            try {
                console.log("[SkillsLoader] Found Skill:", skillMdPath);
                const rawContent = await fs.readFile(skillMdPath);
                const content = decodeContent(rawContent);

                const skill = parseSkill(content);
                if (!skill.name) {
                    skill.name = PathUtils.basename(currentPath);
                }
                skill.skillPath = currentPath;
                this._skills.set(skill.name, skill);
                return;
            } catch (e) {
                console.error(`[SkillsLoader] Failed to load skill in ${currentPath}:`, e);
            }
        }

        try {
            const { directories } = await fs.readDirectory(currentPath);
            for (const dir of directories) {
                await this._recursiveScan(dir.fullPath);
            }
        } catch (e) {
            console.warn(`[SkillsLoader] Failed to read subdirectories in ${currentPath}`);
        }
    }

    public loadSkill(skillName: string): Skill | null {
        return this._skills.get(skillName) || null;
    }

    public async resolveSkillDocumentPath(skillName: string, documentPath: string): Promise<string | null> {
        const skill = this.loadSkill(skillName);
        if (!skill?.skillPath) {
            return null;
        }

        const skillPath = PathUtils.normalize(skill.skillPath);
        const normalizedDocumentPath = PathUtils.normalize(documentPath);

        if (!FileManager.verifyFilePath(normalizedDocumentPath)) {
            return null;
        }

        const mountedSkillPaths = FileManager
            .getPaths()
            .filter(path => PathUtils.isInside(skillPath, path))
            .reverse();

        const candidates = [
            PathUtils.isInside(skillPath, normalizedDocumentPath) ? normalizedDocumentPath : null,
            ...mountedSkillPaths.map(path => PathUtils.join(path, normalizedDocumentPath)),
            PathUtils.join(skillPath, normalizedDocumentPath),
        ].filter((path): path is string => Boolean(path));

        for (const candidate of candidates) {
            if (PathUtils.isInside(skillPath, candidate) && await fs.exists(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    public async loadDocument(skillName: string, documentPath: string): Promise<string | null> {
        const filePath = await this.resolveSkillDocumentPath(skillName, documentPath);
        if (!filePath) {
            return null;
        }

        try {
            const rawContent = await fs.readFile(filePath);
            return decodeContent(rawContent);
        } catch (e) {
            console.error(`[SkillsLoader] Failed to read document ${filePath}`, e);
            return null;
        }
    }

    public async listSkillDocuments(skillName: string): Promise<string[]> {
        const skill = this.loadSkill(skillName);
        if (!skill?.skillPath) {
            return [];
        }

        const result = await this._collectSkillDocuments(skill.skillPath, skill.skillPath);
        return Array.from(new Set(result)).sort((a, b) => a.localeCompare(b));
    }

    private async _collectSkillDocuments(currentPath: string, skillRoot: string): Promise<string[]> {
        const results: string[] = [];

        try {
            const { files, directories } = await fs.readDirectory(currentPath);

            for (const file of files) {
                const relativePath = PathUtils.relative(skillRoot, file.fullPath);
                if (relativePath && PathUtils.basename(relativePath) !== "SKILL.md") {
                    results.push(relativePath);
                }
            }

            for (const dir of directories) {
                const subFiles = await this._collectSkillDocuments(dir.fullPath, skillRoot);
                results.push(...subFiles);
            }
        } catch (e) {
            console.warn(`[SkillsLoader] Failed to collect documents in ${currentPath}`);
        }

        return results;
    }

    public close() {
        this._skills.clear();
        this._initialized = false;
    }

    public list(): Skill[] {
        const result: Skill[] = [];
        const names = Array.from(this._skills.keys());
        for (const name of names) {
            if (name === "skills-for-internal-unit-test") continue;
            const skill = this._skills.get(name);
            if (skill) result.push(skill);
        }
        return result;
    }
}

const SkillsLoader = new SkillsLoaderImpl();
SkillsLoader.init();

export default SkillsLoader;
