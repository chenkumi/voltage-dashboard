import { parse } from "best-effort-json-parser"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

const dataCloseChar: Partial<Record<string, string>> = {
  "{": "}",
  "[": "]",
  '"': '"',
}

const jsonAutocomplete = (jsonString: string): string | null => {
  if (!jsonString) return null

  const string = jsonString
    .trim()
    .replace(/(\r\n|\n|\r|\s{2,})/gm, "")
    .replace(/(?<=:)([a-zA-Z]+)(?=\s*(?![,}])(?:[,}\s]|$))/g, " null")

  const missingChars: string[] = []
  for (let i = 0; i < string.length; i++) {
    const char = string[i]
    if (char === missingChars[missingChars.length - 1]) {
      missingChars.pop()
    } else {
      const closeChar = dataCloseChar[char]
      if (!closeChar) continue

      missingChars.push(closeChar)

      if (char === "{") {
        missingChars.push(":")
      }
    }
  }
  if (missingChars[missingChars.length - 1] === ":") {
    if (string[string.length - 1] !== "{") {
      missingChars[missingChars.length - 1] = ": null"
    } else {
      missingChars.pop()
    }
  }
  const missingCharsString = missingChars.reverse().join("")
  const completeString = string + missingCharsString
  const cleanedString = completeString
    .replace(/"":/g, "")
    .replace(/":}|": }/g, '": null }')
    .replace(/,""}|,}|,"\w+"}/g, "}")
    .replace(/},]/g, "}]")

  return cleanedString
}

export const parseJson = (
  text: string | null | undefined
): any | null => {
    let jsonString = text

    if (
        jsonString === null ||
        jsonString === undefined ||
        typeof jsonString !== "string"
    ) {
        // throw new Error("Invalid input: jsonString must be a string")
        return null;
    }

    // 移除 ```json ... ``` 或 ``` ... ```
    if ( jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(6);
        if (jsonString.endsWith('```')) {
            jsonString = jsonString.substring(0, jsonString.length-3);
        }

        jsonString = jsonString.trim();
        
    }
    else if ( jsonString.startsWith('```')) {
        jsonString = jsonString.substring(3);
        if (jsonString.endsWith('```')) {
        jsonString = jsonString.substring(0, jsonString.length-3);
        }
        jsonString = jsonString.trim();
    }

    const start_i = jsonString.indexOf('{');
    
    if (start_i === -1) {
        return null;
    }

    jsonString = jsonString.substring(start_i);

    const end_i = jsonString.lastIndexOf('}');

    if (end_i!==-1) {
        jsonString = jsonString.substring(0, end_i+1);
    }
    
    jsonString = jsonString.replaceAll('<|"|>', '"');
    jsonString = jsonString.replace(/^\s*```[\w+-]*\s*\n?/, "")
    jsonString = jsonString.replace(/\n?\s*```\s*$/i, "")

    jsonString = jsonAutocomplete(jsonString)

    let data = null

    try {
        data = parse(jsonString) as any;
    } catch {
        data = null
    }

    if (!data) {
        console.log("json parse failed:", jsonString)
    }

    return data
}