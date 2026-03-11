# WORKFLOW.md — Tier 4 研究頁面維護流程

這份流程用來確保新增/修正論文時，**資料、統計、合作者、地圖**都同步更新，不再靠人工記憶。

## 適用範圍（Scope）

本流程適用於所有 Tier 4 網頁（統一規範、同步執行）：
- `research-qec.html`
- `research-simulation.html`
- `research-rb.html`
- `research-shannon.html`

> 原則：Tier 4 任一頁面的實作與更新，都必須遵循本文件流程。

---

## 0) Source of Truth（唯一資料來源）

- Publications: `data/research-<topic>.publications.json`
- Collaborators + Map: `data/research-<topic>.collaborators.json`
- 頁面渲染: `research-<topic>.html`（由 JSON 載入後顯示）

`<topic>` 可為：`qec`、`simulation`、`rb`、`shannon`。

> 原則：**先改 JSON，再看頁面**。

---

## 1) 新增論文（標準步驟）

1. 找到要加入的群組（例如：
   - `📡 Channel Capacities, Multiple Access & Resource Trade-offs`
   - `📦 Rate-Distortion & Source Coding`
   - `⚡ One-Shot & Non-Asymptotic Theory`
   - `🧩 Properties of Quantum Channels`）
2. 在 `research-shannon.publications.json` 加入一筆 publication：
   - `title`
   - `authors`
   - `venue`
   - `links`（順序固定：`arXiv` → `DOI`）
3. 如果只有 arXiv 沒 DOI：
   - 先查 arXiv metadata
   - 再查 Crossref/OpenAlex
   - 找不到就先只留 arXiv，並在 commit 註記

---

## 2) 合作者同步

每次新增論文後：

1. 從該 paper 的 `authors` 中排除 `Min-Hsiu Hsieh`
2. 將其餘作者加入 `research-shannon.collaborators.json` 的 `collaborators`
3. `collaborators` 清單排序規則：**依姓氏（last name）字母排序**

---

## 3) Affiliation / 地圖同步

新合作者需要對應機構時：

1. 優先用 DOI metadata（OpenAlex/Crossref）推定 affiliation
2. 若使用者指定 affiliation，以使用者指定為準
3. 更新 `institutions`：
   - `name`
   - `country`
   - `location` `[lat, lon]`
   - `collaborators`
   - `papers`
4. 若某 collaborator 轉移 affiliation：
   - 從舊機構移除
   - 加到新機構

---

## 4) 知識圖表重建（建議每次更新後執行）

在 repo 目錄執行對應主題的建置腳本（以 Shannon 為例）：

```bash
node scripts/build-shannon-knowledge-graph.mjs
```

會輸出對應主題檔案（以 Shannon 為例）：
- `data/research-shannon.knowledge-graph.json`
- `data/research-shannon.collab-matrix.csv`

用途：
- 維持 `合作者 | affiliation | 國家 | 文章編號` 的可追蹤矩陣
- 方便後續做統計、視覺化與外部匯出

## 5) 品質檢查（必跑）

在 repo 目錄執行對應主題驗證腳本（以 Shannon 為例）：

```bash
node scripts/validate-shannon.mjs
```

必須通過，檢查包含：
- arXiv/DOI 順序
- 重複 DOI
- 統計與資料一致性（基本）

---

## 6) 提交與部署

1. commit（訊息要清楚描述更新內容）
2. 推送：

```bash
git push origin main
```

3. 驗證線上頁面：
- `https://minhsiuh.github.io/research-shannon.html`

---

## 7) 格式規範（固定）

- 連結順序：`arXiv` 在前，`DOI` 在後
- 連結分隔：`[arXiv] [DOI]`（中間**不要逗號**）
- Collaborators 名單排序：依 **last name**
- 不確定資料不要硬猜；標示待確認或向使用者確認

---

## 8) 例外處理

- Preprint 無 DOI：可只放 arXiv
- DOI 多來源（publisher / doi.org）：以 `https://doi.org/...` 為優先
- affiliation 爭議：以使用者最新指定為準

---

## 9) publications.html 長期維護規範（必遵守）

1. Publications 各區塊資料以 JSON 結構化欄位為主，不以句子解析為主：
   - journals -> `article`（對齊 `@article` 欄位）
   - conferences -> `inproceedings`（對齊 `@inproceedings` 欄位）
   - books -> `book`（對齊 `@book/@incollection/@proceedings` 欄位）
   - talks -> `title/authors/venue/date/location/type`
2. 一旦某區塊完成結構化渲染，不可回退到 `contentHtml` 解析邏輯。
3. `Copy citation (plain)` 不得包含 `[arXiv]` / `[DOI]` token。
4. `Copy Bibtex` 必須從結構化欄位生成；缺資料欄位時留空，不可臆測。
5. 重大清洗前先建立備份：`backups/publications.*.<YYYY-MM-DD>.json`。
6. 會議論文排序固定為年份遞減（newest first）。
7. 期刊統計表若使用人工維護清單，該清單視為 source-of-truth，未經明確要求不可自動覆寫。

---

_最後更新：2026-03-11_