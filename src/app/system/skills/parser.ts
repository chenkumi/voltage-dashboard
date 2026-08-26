import { load } from 'js-yaml';
import { Skill } from './types';
/**
 * 解析 SKILL.md 文本
 * @param text SKILL.md 的原始字串內容
 */
export function parseSkill(text: string): Skill {
    // 正則表達式：匹配開頭的 --- ... --- 區塊
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
    const match = text.match(frontmatterRegex);

    let metadata: any = {};
    let instructions: string = text;
    let status: 'ready' | 'error' = 'ready';
    let errorMsg: string | undefined = undefined;

    if (match) {
        // 取得 YAML 字串部分
        const yamlRaw = match[1];
        try {
            // 使用 js-yaml 的 load 函數解析
            metadata = load(yamlRaw) || {};
        } catch (e: any) {
            console.error("YAML 解析失敗:", e);
            status = 'error';
            errorMsg = e?.message || String(e);
        }

        // 將 Header 區塊（含前後 ---）移除，剩下的部分即為 instructions
        instructions = text.slice(match[0].length).trim();
    }

    // 根據規格：如果 Frontmatter 沒定義 name，通常預設為目錄名
    // 如果沒定義 description，則取 instructions 的第一段
    if (!metadata.description && instructions) {
        metadata.description = instructions.split(/\r?\n\r?\n/)[0].slice(0, 250);
    }

    return {
        ...metadata,
        status,
        ...(errorMsg ? { errorMsg } : {}),
        instructions: instructions,
    } as Skill;
}