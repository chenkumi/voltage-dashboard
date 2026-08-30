# Operational List UI Drafts

本文件記錄商品、庫存、訂單與顧客清單頁的一致化設計。只有經使用者確認的
Draft 才會加入本文件，後續 `create-plan` 的 UI 驗收條件應直接引用對應 Draft。

## Draft 1：共用頁面骨架與統計卡

使用者確認：已確認

### 桌面版

```text
+------------------------------------------------------------------------+
| 頁面名稱                                                [狀態] [操作] |
+------------------------------------------------------------------------+

+---------------+ +---------------+ +---------------+ +---------------+
| MetricCard    | | MetricCard    | | MetricCard    | | MetricCard    |
| 標題          | | 標題          | | 標題          | | 標題          |
| 主要數值      | | 主要數值      | | 主要數值      | | 主要數值      |
| 輔助資訊      | | 輔助資訊      | | 輔助資訊      | | 輔助資訊      |
+---------------+ +---------------+ +---------------+ +---------------+

+------------------------------------------------------------------------+
| [🔍 Search....................] [常用1 ▾] [常用2 ▾] [常用3 ▾] [⚙] |
|------------------------------------------------------------------------|
| 72 筆結果 · [待處理 ×] [付款失敗 ×]                    [清除全部] |
|------------------------------------------------------------------------|
| 語意化資料表格                                                         |
|------------------------------------------------------------------------|
| 顯示 1–10／72                                 [上一頁] 1/8 [下一頁] |
+------------------------------------------------------------------------+
```

桌面規則：

- Search 使用 `flex-1` 與合理的最小寬度，不讓搜尋框無限制佔滿整列。
- 同列保留 3–4 個最高頻的 Select；Select 使用一致的固定寬度。
- More 是與輸入框等高的正方形 Icon Button，不顯示文字且不獨立成列。
- More 使用一致的 Lucide `SlidersHorizontal` 或 `ListFilter` 圖示，並提供 Tooltip
  與 `aria-label`。
- 有進階條件生效時，More 顯示數量 Badge 或狀態圓點。
- 點擊 More 後使用 shadcn `Popover` 顯示其餘進階條件。
- 較窄桌面可依優先序將最低頻的常用條件收入 More，但 More 始終保留在主列。
- 搜尋、摘要、表格及分頁位於同一個共用 List Panel。

### 手機版

```text
+-------------------------------------+
| 頁面名稱                     [操作] |
+-------------------------------------+

| MetricCard                          |
| MetricCard                          |
| MetricCard                          |
| MetricCard                          |

+-------------------------------------+
| [🔍 Search....................] [⚙] |
+-------------------------------------+
                            點擊 Filter Icon
                            ↓
                   +------------------------+
                   | Filters                |
                   | 狀態              [▾] |
                   | 類型              [▾] |
                   | 期間              [▾] |
                   | 其他進階條件      [▾] |
                   |                        |
                   | [清除]       [套用]   |
                   +------------------------+

| 3 個作用中條件                       |
| 可水平捲動的資料表格                 |
| 分頁                                 |
```

手機規則：

- Search Bar 與 Filter Icon Button 同列，不直接展示 Select。
- 手機與桌面 More 使用相同圖示、狀態 Badge、篩選欄位定義及狀態。
- Popover 寬度限制在 viewport 內，欄位採單欄排列。
- 搜尋立即生效；Popover 內條件採取消／套用模式，避免未完成的選擇立即改動列表。
- 統計卡使用手機單欄、平板雙欄、桌面四欄，與 Dashboard responsive 規則一致。

### 共用 Metric 元件

Dashboard、Inventory、Orders 與 Customers 統一使用專案共用
`OperationalMetricCard`：

- 底層使用 shadcn `Card`、`CardHeader` 與 `CardContent`。
- 接收 label、value、detail、可選 tone、可選 icon 與 loading state。
- value 使用 tabular numbers；各頁不得自行改寫結構或字級。
- tone 僅允許 neutral、positive、warning、critical。
- 顏色不得作為唯一狀態提示，必須保留可讀文字。

### 關鍵差異

- Dashboard 與三個營運頁不再維護四套 KPI 實作。
- 商品、庫存、訂單與顧客改用相同的 List Panel 資訊架構。
- 桌面以 Search、3–4 個常用 Select 與 More Icon Button 組成單列工具列。
- 手機只保留 Search 與 Filter Icon Button，完整條件收進 Popover。

## Draft 2：各頁主列與進階篩選分工

使用者確認：已確認

### 商品

```text
[搜尋商品................] [分類 ▾] [狀態 ▾] [庫存 ▾] [⚙]
```

More Popover：排序（最近更新、名稱、價格、庫存）。商品頁保留目前三個核心條件，
並新增排序作為進階功能。

### 庫存

```text
[搜尋商品................] [分類 ▾] [庫存風險 ▾] [統計期間 ▾] [⚙]
```

More Popover：排序（最近更新、庫存量、期間變化、可售天數）。現有五個控制項
收斂成三個常用 Select，排序移入 More。

### 訂單

```text
[搜尋訂單編號............] [訂單狀態 ▾] [付款狀態 ▾] [履約狀態 ▾] [⚙]
```

More Popover：

- 日期範圍：開始日期、結束日期。
- 客群與區域。
- 幣別。
- 最低金額與最高金額。
- 排序：最近更新、建立日期、金額高低。

主列只留下訂單處理最常使用的三種狀態。

### 顧客

```text
[搜尋姓名／Email／編號....] [顧客狀態 ▾] [客群 ▾] [區域 ▾] [⚙]
```

More Popover：

- 標籤。
- 最近活動：全部、30 天、90 天、365 天。
- 消費幣別。
- 最低消費與最高消費。
- 排序：最近活動、建立日期、消費、訂單數。

主列保留狀態、客群與區域。

### 共同行為

- 主列搜尋與常用 Select 立即生效。
- More Popover 使用暫存值，只有按「套用」才更新列表。
- 按「取消」或點擊外部關閉時，不保留尚未套用的修改。
- 桌面 More Badge 只計算進階條件；手機 Filter Badge 計算所有非預設條件。
- 摘要列顯示所有已生效條件，並允許個別移除。
- 「清除全部」同時重設主列與進階條件。
- 每次條件生效後回到第 1 頁。
- 驗證錯誤顯示在對應進階欄位下方，不以整頁錯誤取代列表。
- 手機將桌面主列 Select 一併收入相同 Popover，只保留 Search 與 Filter Icon。

## Draft 3：欄位格式與 List Panel 一致化

使用者確認：已確認

### 主工具列欄位

```text
[🔍 搜尋訂單編號........]
[訂單狀態：全部       ▾]
[付款狀態：全部       ▾]
[履約狀態：全部       ▾]
[⚙]
```

- 主工具列不使用輸入框上方標題。
- Search、Select、Icon Button 高度統一為 `h-9`。
- Search 使用 `min-w-56 flex-1`；一般 Select 預設 `w-40`，短值可使用 `w-36`。
- Select Trigger 顯示「欄位名稱：目前值」，避免無可見標題時語意不明。
- Search 使用 sr-only label；Select 與 Icon Button 保留明確 accessible name。
- 所有控制項使用相同 border、radius、字級、focus ring 與 disabled state。
- 完整工具列於 `lg` 以上顯示；低於 `lg` 改為 Search＋Filter Icon，避免換行。

### More／Filter Popover

```text
+---------------------------------------+
| 更多篩選                              |
|                                       |
| 日期範圍                              |
| [開始日期]       [結束日期]           |
|                                       |
| 客群                  區域            |
| [全部客群 ▾]          [全部區域 ▾]    |
|                                       |
| 金額範圍                              |
| [最低金額]       [最高金額]           |
|                                       |
| 排序                                  |
| [最近更新 ▾]                          |
|---------------------------------------|
| [清除]                [取消] [套用]   |
+---------------------------------------+
```

- Popover 內所有欄位都有可見 label。
- 桌面可採兩欄，手機固定單欄。
- 日期與金額範圍各視為一組欄位，錯誤顯示在對應群組下方。
- Footer 固定呈現清除、取消、套用。
- 開啟時將已生效條件複製成暫存值；Escape、取消或點擊外部均不套用修改。

### 結果摘要列

```text
+------------------------------------------------------------------------+
| 顯示 1–10／72                                                          |
| [訂單狀態：待處理 ×] [付款狀態：失敗 ×]                  [清除全部] |
+------------------------------------------------------------------------+
```

- 固定顯示目前範圍與總結果數。
- 每個 Chip 使用「欄位：值」，可個別移除並有 accessible name。
- 沒有作用中條件時不顯示 Chip 與清除全部。
- 手機 Chips 可水平捲動或自然換行，但結果數保持可見。

### 資料表格與分頁

- 四頁使用同一個 `OperationalListPanel` 外框。
- 表格統一 header 背景、cell padding、hover、focus 與 border。
- 第一欄與最後操作欄使用一致 padding；數字欄使用 tabular numbers。
- 快速展開列保留各頁業務內容，不強迫各頁欄位相同。
- 分頁統一顯示「顯示起始–結束／總數」及相同的前後頁按鈕。
- 手機維持語意化表格並允許水平捲動，不另外改成卡片列表。
- Loading、empty、error 與 invalid-filter state 顯示於 List Panel 內容區，工具列仍可操作。

### 預計共用元件

- `OperationalMetricCard`
- `OperationalListPanel`
- `OperationalFilterToolbar`
- `OperationalToolbarSearch`
- `OperationalToolbarSelect`
- `OperationalFilterButton`
- `OperationalFilterPopover`
- `ActiveFilterSummary`
- `OperationalPagination`

## Draft 4：共用 Metric Card 視覺層級

使用者確認：已確認

### 統一結構

```text
+--------------------------------+
| 指標名稱              [狀態]   |
|                                |
| 12,480                         |
| 輔助說明或比較資訊             |
+--------------------------------+
```

`OperationalMetricCard` 使用以下結構：

```text
Card
└── CardContent
    ├── Header row
    │   ├── label
    │   └── optional status badge
    ├── value
    └── detail
```

- 不使用具大面積 padding 的獨立 `CardHeader`，維持緊湊高度。
- 所有 Card 使用相同 border、radius、background、shadow 與 padding。
- Label 使用小型 muted text；value 使用主要 sans-serif 與 tabular numbers。
- Dashboard 不再使用專屬 Georgia 數值字型。
- Detail 固定在 value 下方且最多兩行；同列 Card 高度一致。
- Card 預設不可點擊；導覽行為必須使用明確按鈕。
- 不混用裝飾 icon；只有同一組所有指標都有清楚語意時才整組啟用。

### Tone

- `neutral`：一般統計。
- `positive`：正向或健康狀態。
- `warning`：需要留意。
- `critical`：需要立即處理。
- Tone 以小型 Badge、文字或窄色條呈現，不改變整張 Card 的大面積背景。
- 顏色不得是唯一提示，必須搭配可讀文字；各頁不得新增自己的 tone 類型。

### Grid

- Dashboard 主要指標、Inventory、Orders、Customers：手機 1 欄、平板 2 欄、
  桌面 4 欄。
- Dashboard workflow 指標：手機 1 欄、平板 2 欄、桌面 3 欄。
- 兩組 grid 都使用同一個 `OperationalMetricCard`。

### 狀態

- Loading 使用共用 Skeleton，不先顯示 0。
- 無資料顯示 `—` 與明確 unavailable 說明，和真實數值 0 區分。
- 長金額不得溢出，窄 Card 可使用受控的 responsive value size。
- 本次 UI 重構不改變 KPI 的資料計算方式。

---

本文件為低保真示意，只確認內容、元件關係與 responsive 行為，不指定最終顏色、
像素間距或字型。
