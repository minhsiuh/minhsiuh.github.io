# WORKFLOW.md — `research-shannon.html` 維護流程

這份流程用來確保新增/修正論文時，**資料、統計、合作者、地圖**都同步更新，不再靠人工記憶。

---

## 0) Source of Truth（唯一資料來源）

- Publications: `data/research-shannon.publications.json`
- Collaborators + Map: `data/research-shannon.collaborators.json`
- 頁面渲染: `research-shannon.html`（由 JSON 載入後顯示）

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

## 4) 品質檢查（必跑）

在 repo 目錄執行：

```bash
node scripts/validate-shannon.mjs
```

必須通過，檢查包含：
- arXiv/DOI 順序
- 重複 DOI
- 統計與資料一致性（基本）

---

## 5) 提交與部署

1. commit（訊息要清楚描述更新內容）
2. 推送：

```bash
git push origin main
```

3. 驗證線上頁面：
- `https://minhsiuh.github.io/research-shannon.html`

---

## 6) 格式規範（固定）

- 連結順序：`arXiv` 在前，`DOI` 在後
- 連結分隔：`[arXiv] [DOI]`（中間**不要逗號**）
- Collaborators 名單排序：依 **last name**
- 不確定資料不要硬猜；標示待確認或向使用者確認

---

## 7) 例外處理

- Preprint 無 DOI：可只放 arXiv
- DOI 多來源（publisher / doi.org）：以 `https://doi.org/...` 為優先
- affiliation 爭議：以使用者最新指定為準

---

_最後更新：2026-03-08_