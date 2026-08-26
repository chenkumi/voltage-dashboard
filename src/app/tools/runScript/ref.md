有，建議用 **AST parser + allowlist symbol table**。

核心流程：

1. 用 `@babel/parser` parse JS
2. 用 `@babel/traverse` 掃 AST
3. 找出所有 `CallExpression`
4. 判斷呼叫的 function 是否在允許清單
5. 不允許就拒絕

範例：

```bash
npm install @babel/parser @babel/traverse
```

```js
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const allowedFunctions = new Set([
  "readFile",
  "writeFile",
  "searchWeb",
  "console.log",
  "Math.max",
]);

function getCalleeName(callee) {
  if (callee.type === "Identifier") {
    return callee.name;
  }

  if (callee.type === "MemberExpression") {
    const objectName = getCalleeName(callee.object);
    const propertyName = callee.property.name;

    if (!objectName || !propertyName) return null;

    return `${objectName}.${propertyName}`;
  }

  return null;
}

function validateFunctionCalls(code) {
  const errors = [];

  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  traverse(ast, {
    CallExpression(path) {
      const name = getCalleeName(path.node.callee);

      if (!name) {
        errors.push({
          message: "不允許動態 function 呼叫",
          loc: path.node.loc,
        });
        return;
      }

      if (!allowedFunctions.has(name)) {
        errors.push({
          message: `不允許呼叫 function: ${name}`,
          loc: path.node.loc,
        });
      }
    },
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

使用：

```js
console.log(validateFunctionCalls(`
  readFile("/tmp/a.txt");
  searchWeb("hello");
  eval("alert(1)");
  Math.max(1, 2);
`));
```

輸出會抓到：

```js
{
  valid: false,
  errors: [
    {
      message: "不允許呼叫 function: eval",
      loc: ...
    }
  ]
}
```

但要注意：這只能做「靜態檢查」，下面這種應該直接禁止：

```js
const fn = readFile;
fn("/tmp/a.txt");
```

```js
window["alert"]("x");
```

```js
obj[methodName]();
```

所以安全規則通常要加上：

```js
禁止 computed member call：obj[x]()
禁止 indirect call：fn()
禁止 eval / Function
禁止 import / require
禁止 globalThis / window / process
禁止 prototype / constructor
```

更完整的 allowlist 可以設計成這樣：

```js
const allowed = {
  readFile: {
    args: ["string"],
  },
  searchWeb: {
    args: ["string"],
  },
  Math: {
    max: {
      args: ["number", "number"],
    },
  },
};
```

結論：

如果你只是要驗證 LLM 產生的 JS 工具腳本，推薦：

```txt
@babel/parser
+ @babel/traverse
+ function allowlist
+ 禁止動態呼叫
+ 禁止 import/require/eval/Function/globalThis/window/process
```

這樣就能做到「語法正確 + function 存在 + 是否被允許呼叫」。


可以，而且這種檢查其實**用 AST 做是最準確的**（比 regex 靠譜很多）。

你要驗的是：

> ✅ 是否存在 `return result`

但這裡其實有幾種「語意層級」要先釐清👇

---

# 🧠 你到底要驗哪一種？

### 1️⃣ 最嚴格（完全匹配）

```js
return result;
```

### 2️⃣ 允許變形

```js
return result
return result.data
return result["x"]
```

### 3️⃣ 只要有 return（不限內容）

```js
return anything;
```

---

# ✅ 推薦做法：用 AST 檢查 `ReturnStatement`

用 @babel/parser + @babel/traverse

---

# 🧪 範例：檢查「是否有 return result」

```js
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function hasReturnResult(code) {
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  let found = false;

  traverse(ast, {
    ReturnStatement(path) {
      const arg = path.node.argument;

      if (!arg) return;

      // case 1: return result
      if (arg.type === "Identifier" && arg.name === "result") {
        found = true;
      }

      // case 2: return result.xxx
      if (arg.type === "MemberExpression") {
        let obj = arg.object;
        if (obj.type === "Identifier" && obj.name === "result") {
          found = true;
        }
      }
    },
  });

  return found;
}
```

---

# 🧪 測試

```js
hasReturnResult(`
function run() {
  const result = { ok: true };
  return result;
}
`);
// ✅ true
```

```js
hasReturnResult(`
function run() {
  return somethingElse;
}
`);
// ❌ false
```

---

# ⚠️ 常見坑（你一定會踩）

## ❌ 1. Arrow function implicit return

```js
const fn = () => result;
```

👉 這不是 `ReturnStatement`！

👉 要補這個：

```js
ArrowFunctionExpression(path) {
  if (path.node.body.type === "Identifier" &&
      path.node.body.name === "result") {
    found = true;
  }
}
```

---

## ❌ 2. return 在錯誤 scope

```js
function a() {
  function b() {
    return result;
  }
}
```

👉 你可能想驗「最外層 function」

👉 需要限制 scope（例如只看指定 function）

---

## ❌ 3. result 未定義

```js
return result;
```

👉 語法 OK，但 runtime 會炸

👉 如果你要更嚴格，要再加：

* 變數是否宣告（scope analysis）

---

# 🚀 進階版本（推薦你用）

你可以做一個完整 validator：

```js
{
  hasReturn: true,
  returnType: "result",
  valid: true
}
```

甚至加：

* return 是否在最外層 function
* return 是否唯一
* return 是否最後一行

---

# 💡 更強版本（LLM 安全執行用）

你之前在做 Agent / Tool system，其實可以這樣設計：

### ✅ 強制 contract

```js
function main() {
  const result = {...}
  return result;
}
```

然後 validator 檢查：

* ✔ 必須有 `main`
* ✔ 必須 `return result`
* ✔ 禁止其他 return

👉 這就是「AST contract enforcement」

---

# 🧩 總結

可以，而且正確做法是：

```txt
AST parse
→ 找 ReturnStatement
→ 判斷 argument 是否 result
→ (補) arrow function implicit return
→ (選) scope 檢查
```

---

如果你要，我可以幫你做一個完整版本：

✅ function allowlist
✅ return result 檢查
✅ 禁止危險語法
✅ schema 驗證

👉 直接變成你 Agent 的「JS execution sandbox validator」



在 JavaScript 生態系中，處理代碼格式化（如自動換行、縮排、分號補全等）最權威且最常用的工具首推 **Prettier**。

以下是幾個主流的選擇，以及它們各自的應用場景：

---

### 1. Prettier (最推薦)
Prettier 是一個「有主見」的程式碼格式化工具。它的核心理念是：與其讓開發者爭論程式碼風格，不如交給工具統一套用。

*   **自動換行原理：** 它有一個 `printWidth` 參數（預設 80）。當一行程式碼超過這個長度，Prettier 就會自動根據語法結構進行換行。
*   **優點：** 支援非常多語法（JS, TS, JSX, CSS, HTML, JSON 等），且與 VS Code 整合度極高。
*   **安裝與使用：**
    ```bash
    npm install --save-dev prettier
    
```
    ```javascript
    const prettier = require("prettier");
    const formattedCode = prettier.format("const x=1; console.log(x);", { 
      parser: "babel", 
      printWidth: 20 // 故意設短一點觸發自動換行
    });
    ```

---

### 2. ESLint
雖然 ESLint 主要用於「語法檢查」（如變數未定義），但它也具備格式化功能。
*   **特點：** 比 Prettier 更具彈性。你可以自定義「一行最多幾個字」、「物件括號內是否要有空格」等細碎規則。
*   **建議做法：** 目前業界主流是 **「ESLint 檢查邏輯 + Prettier 處理格式」**。

---

### 3. JS-Beautify
在 Prettier 流行之前，這是最老的牌子。
*   **優點：** 設定檔非常直覺，如果不喜歡 Prettier 那種強硬的換行邏輯，JS-Beautify 提供更多手動微調空間。
*   **缺點：** 對現代語法（如最新版的 TS 或特定 React 語法）支援速度有時較慢。

---

### 4. CodeMirror / Monaco Editor (編輯器層級)
如果你是在開發網頁應用程式，想要在網頁上的輸入框「即時格式化」：
*   **Monaco Editor：** 這是 VS Code 的核心組件，內建格式化指令。
*   **CodeMirror：** 輕量化，適合用於簡單的代碼呈現與格式化。

---

### 總結建議

| 需求場景 | 推薦工具 |
| :--- | :--- |
| **開發專案標準化** | **Prettier** (搭配 `.prettierrc`) |
| **後端自動處理代碼字串** | **Prettier API** |
| **網頁上的代碼編輯器** | **Monaco Editor** |
| **高度自定義風格** | **ESLint** 或 **JS-Beautify** |

如果你目前正在處理 **TypeScript 或 React (Vite)** 相關的專案，直接在專案根目錄設定 `.prettierrc` 並安裝 VS Code 的 Prettier 擴充套件，是最省心且標準的做法。
```