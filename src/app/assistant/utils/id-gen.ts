
// 輕量級實作：FNV-1a 演算法 (推薦)
// 這是目前業界公認最適合用於產生 Unique ID 的快速 Hash 演算法，程式碼極短且分佈均勻。
export function generateCallId(name: string, input: string): string {
    const data = name + input;
    let hash = 0x811c9dc5; // Offset basis

    for (let i = 0; i < data.length; i++) {
        hash ^= data.charCodeAt(i);
        // 乘上 FNV prime (0x01000193) 並保持在 32 位元
        hash = Math.imul(hash, 0x01000193);
    }

    // 轉為 16 進位字串，並確保為正數
    return (hash >>> 0).toString(16).padStart(8, '0');
}
