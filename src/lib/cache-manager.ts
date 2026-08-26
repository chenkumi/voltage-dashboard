export const VIRTUAL_PREFIX = '/virtual-assets/';
export const CACHE_NAME = 'webmcp-agent-file-cache';

export class CacheManager {
    /**
     * Stores a file in Cache Storage and returns its virtual URL.
     * @param file The file to cache.
     * @returns A string representing the virtual URL.
     */
    static async saveFile(file: File): Promise<string> {
        const cache = await caches.open(CACHE_NAME);
        
        // Generate a unique filename using timestamp to avoid collisions
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const virtualUrl = `${VIRTUAL_PREFIX}${timestamp}-${safeName}`;
        
        // Create a response object with correct headers
        const response = new Response(file, {
            headers: {
                'Content-Type': file.type,
                'Content-Length': file.size.toString(),
                'Cache-Control': 'public, max-age=31536000' // Cache for a year
            }
        });
        
        await cache.put(virtualUrl, response);
        return virtualUrl;
    }

    /**
     * Removes a file from Cache Storage.
     * @param url The virtual URL to delete.
     * @returns boolean indicating success.
     */
    static async deleteFile(url: string): Promise<boolean> {
        const cache = await caches.open(CACHE_NAME);
        return await cache.delete(url);
    }

    /**
     * Clears all assets from the virtual cache.
     */
    static async clearCache(): Promise<boolean> {
        return await caches.delete(CACHE_NAME);
    }

    /**
     * Utility to resolve a virtual URL to a Data URL (needed for remote APIs).
     * @param url The virtual URL.
     */
    static async resolveToDataUrl(url: string): Promise<string | null> {
        try {
            const cache = await caches.open(CACHE_NAME);
            const response = await cache.match(url);
            if (!response) return null;
            
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error('Failed to resolve virtual URL:', e);
            return null;
        }
    }
}
