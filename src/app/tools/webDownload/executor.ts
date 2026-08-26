import { AgentExecutorProps } from "@/app/agent/agent-common";
import { fs, PathUtils } from "../agentSearchFile/lib";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { url, filename } = input;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return {
                status: 'error',
                message: `Download failed: ${response.status} ${response.statusText}`
            };
        }

        const data = await response.arrayBuffer();

        // Ensure downloads directory exists
        const downloadsDir = "downloads";
        if (!(await fs.exists(downloadsDir))) {
            await fs.createDirectory(downloadsDir);
        }

        // Determine initial filename
        let targetName = filename || PathUtils.basename(url.split('?')[0]);
        if (!targetName || targetName === "/") {
            targetName = "downloaded_file";
        }

        // Auto-numbering logic
        let finalPath = PathUtils.join(downloadsDir, targetName);
        if (await fs.exists(finalPath)) {
            const extIndex = targetName.lastIndexOf('.');
            const name = extIndex !== -1 ? targetName.substring(0, extIndex) : targetName;
            const ext = extIndex !== -1 ? targetName.substring(extIndex) : '';

            let counter = 1;
            while (await fs.exists(PathUtils.join(downloadsDir, `${name}(${counter})${ext}`))) {
                counter++;
            }
            finalPath = PathUtils.join(downloadsDir, `${name}(${counter})${ext}`);
        }

        // Write file
        await fs.writeFile(finalPath, data);

        return {
            status: 'success',
            save_path: finalPath,
            message: `File successfully downloaded to ${finalPath}`
        };
    } catch (error: any) {
        return {
            status: 'error',
            message: `Download execution failed: ${error.message}`
        };
    }
}