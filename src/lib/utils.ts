import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 安全地將 readFile 的結果轉換為字串 (處理 ArrayBuffer 或 String)
 */
export function decodeContent(content: string | ArrayBuffer | any): string {
  if (typeof content === "string") return content;
  if (content instanceof ArrayBuffer) {
    return new TextDecoder("utf-8").decode(content);
  }
  return String(content || "");
}
