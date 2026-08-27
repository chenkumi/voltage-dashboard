# 架構適配檢查

執行 `npm run check:architecture` 必須通過下列條件：

1. 不得恢復全域 `bridge.ts` singleton。
2. `agent.ts` 僅接收 `PreparedWebMcpTurn`，不直接存取 iframe runtime。
3. `transport.ts` 僅依賴 session，不直接存取 bridge。
4. Workspace 必須使用 session，且 session 必須公開不可變回合契約。

單元測試另覆蓋特殊工具快照與 iframe 切換使舊回合失效的情境：

```text
npm run test
```
