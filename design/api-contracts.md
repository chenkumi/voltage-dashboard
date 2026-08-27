# WebMCP 執行期契約

## `WebMcpSession`

| 成員 | 契約 |
| --- | --- |
| `attach(frame)` | 將目前 iframe 附加至 session，並遞增 frame 版本後開始 discovery。傳入 `null` 會清空目前目標。 |
| `refresh()` | 重新對目前 iframe discovery，供使用者手動更新工具清單。 |
| `prepareTurn(signal?)` | 讀取當次 iframe tools 與特殊工具，成功回傳不可變 `PreparedWebMcpTurn`。若 iframe 已切換，必須拒絕而不能使用新 iframe。 |
| `subscribe(listener)` | 提供 Workspace 取得 discovery 顯示狀態；不得暴露可執行的底層 iframe reference。 |
| `dispose()` | 使 session 與其 iframe 關聯失效；ChatSession 卸載時呼叫。 |

## `PreparedWebMcpTurn`

| 欄位 | 契約 |
| --- | --- |
| `tools` | 已排除 `agent_instructions`，並在成對 skill 模式下只保留 `load_skill` 的 Agent 工具集合。 |
| `toolDescriptions` | 本回合工具選擇提示，不可由之後的 discovery 修改。 |
| `specialPrompt` | 本回合的 instructions 與技能清單提示。 |
| `frameVersion` | 建立快照時的 iframe 版本，僅用於可觀測性與失效判定。 |

`WebMcpTurnInvalidatedError` 是可預期的競態結果。transport 必須讓請求停止，
而不得重試到切換後的目標網站。
