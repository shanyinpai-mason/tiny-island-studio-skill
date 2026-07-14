# 開新系列指南

## 訪談

一次最多問三題；已有答案就不要重問。

1. 系列名稱與一句話世界觀是什麼？
2. 目標年齡與核心教育定位是什麼？
3. 希望的美術風格、材質與色彩關鍵字是什麼？
4. 預計多久發布一次？主影片、Short 或合集為主？
5. 需要哪些主要角色？每位角色在故事中負責什麼？

若使用者只給一句簡介，先問系列名稱／目標年齡／教育定位，再問風格與角色。

## 目錄與 ID

- 把系列名稱轉成小寫 kebab-case ID；無法合理轉寫時詢問一個簡短英文 ID。
- 建立 `series/<id>/characters/`、`series/<id>/episodes/` 與 `series/<id>/image-prompts/`。
- 把大型生成結果放在 `outputs/<id>/`，不要放入 `series/` 或 git。
- 不複製其他系列的角色卡、anchors 或風格內容。
- 在確認的 workspace 檢查 git；若尚未初始化，先建立 git repository。
- `.gitignore` 必須包含 `outputs/**` 與 `!outputs/.gitkeep`，並建立 `outputs/.gitkeep`，讓大型媒體不進 git、目錄骨架仍可保留。

命名規則：

- 系列：小寫英文 kebab-case，例如 `tiny-island`、`space-cats`。
- Episode：`EP01-中文短標題`；代號至少補零兩位，標題控制在 30 字內並移除 Windows 禁用字元。
- 角色卡：穩定英文 slug，例如 `pango.md`、`mika.md`。
- 鏡頭與 take：`shot-01/take-01.mp4`。
- Final：`EP01-short-title-v001.mp4`；每次輸出遞增版本，不覆蓋。
- 靜態圖：`shot-01-v001.png`、`turnaround-v001.png`；提示詞使用相同 stem 的 `.txt`。

## series.json 模板

```json
{
  "id": "series-id",
  "name": "系列名稱",
  "targetAge": "3-7",
  "format": "主影片",
  "cadence": "每週六發布",
  "outputRoot": "outputs/series-id",
  "requireStoryboardStills": true,
  "cast": [],
  "createdAt": "YYYY-MM-DD"
}
```

`narrationMode` 是 `series.json` 與 `episode.json` 的可選欄位，只能是 `"spoken"` 或 `"nonverbal"`。Episode 設定優先於 series；兩者都省略時使用 `spoken`。只有使用者要為整個系列或特定集數指定模式時才寫入此欄位。

## style-bible.md 模板

```markdown
# <系列名稱> 風格聖經

## 核心風格
原創、適齡、低刺激的材質與世界觀描述。

## 造型與輪廓
角色比例、形狀語言、材質與不可漂移的規則。

## 鏡頭語言
stable gentle camera；每鏡一個主要動作；避免快速剪接。

## 光線與色彩
固定光線、色彩策略、角色主色分配與背景對比。

## 故事與教育原則
目標年齡、教育定位、情緒能力與 Stop → Look → Think → Try → Fix Together 節奏。

## 全域負面提示詞
no text, no watermark, no extra limbs, no existing IP, no rapid cuts, no flashing, no dangerous imitation
```

即使使用者未指定，也保留上述四個必要英文負面片語，因驗證器會逐鏡檢查。

## 角色設計順序

1. 先建立主角，再建立功能互補的朋友或引導角色。
2. 建議 2–4 位主要角色，避免低齡觀眾一次記憶過多角色。
3. 每位角色先以 `approved: false` 建卡，保存三份圖片提示詞並直接生成定裝照、表情表和姿勢表。
4. 向使用者顯示圖片而非提示詞；使用者核准圖片後才設定 `approved: true` 並加入故事生成 context。
5. 全部主要角色核准後直接生成 lineup 圖，並在 `lineup.md` 記錄核准圖片路徑與 casting notes。

## 完成條件

- `series.json` 欄位完整。
- `style-bible.md` 包含鏡頭、光線、色彩與全域負面詞。
- 至少兩位主要角色有完整角色卡、anchors、已存檔提示詞與已核准定裝圖片。
- `lineup.md` 包含已核准 lineup 圖片路徑與 casting notes；lineup prompt 另存於 `image-prompts/`。
- `validate.mjs --status` 成功更新儀表板。
- 建立單一系列初始化 commit。

新 Episode 的 `episode.json` 預設加入 `storyboardImagesApproved: false` 與 `generateConfirmed: false`；只有對應的人工關卡完成後才改為 `true`。

若使用者要先快速跑通一集，可明確把 `requireStoryboardStills` 設為 `false`；驗證器仍檢查分鏡與即夢提示詞，只把逐鏡靜態圖與核准降為非阻擋提示。
