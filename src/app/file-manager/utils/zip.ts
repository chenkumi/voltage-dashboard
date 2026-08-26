import JSZip from 'jszip';
import fs from 'indexeddb-fs';

/**
 * Extracts a ZIP file into the virtual filesystem.
 * @param zipFile The ZIP file to extract (Blob or ArrayBuffer)
 * @param destinationDir The directory to extract into
 */
export async function extractZip(zipFile: Blob | ArrayBuffer, destinationDir: string): Promise<void> {
    const zip = new JSZip();
    const contents = await zip.loadAsync(zipFile);

    for (const [relativePath, file] of Object.entries(contents.files)) {
        const fullPath = destinationDir === 'root' 
            ? relativePath 
            : `${destinationDir}/${relativePath}`;

        if (file.dir) {
            // Ensure directory exists
            await ensureDirectory(fullPath);
        } else {
            // Ensure parent directory exists
            const pathParts = fullPath.split('/');
            if (pathParts.length > 1) {
                const parentPath = pathParts.slice(0, -1).join('/');
                await ensureDirectory(parentPath);
            }

            // Write file content
            const blob = await file.async('blob');
            // indexeddb-fs writeFile supports Blob/Uint8Array/String
            await fs.writeFile(fullPath, blob);
        }
    }
}

/**
 * Recursively ensures a directory exists in indexeddb-fs.
 */
async function ensureDirectory(path: string): Promise<void> {
    const parts = path.split('/');
    let current = '';
    
    for (const part of parts) {
        if (!part) continue;
        current = current ? `${current}/${part}` : part;
        if (!(await fs.exists(current))) {
            await fs.createDirectory(current);
        }
    }
}
