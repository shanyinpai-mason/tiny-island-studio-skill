# 靜態圖片混合工作流

本流程適用於所有不動的點陣圖片：系列風格圖、角色定裝照、表情表、姿勢表、lineup、場景、道具、storyboard 分鏡圖、首尾關鍵幀、縮圖與其他靜態美術。

## 執行規則

1. 使用 Codex／ChatGPT 內建 `$imagegen` 或 `image_gen`。內建模式使用 GPT Image 2，不需要 `OPENAI_API_KEY`。
2. 先把最終提示詞寫入 `series/` 的 `image-prompts/`，再立即生圖。除非使用者要求查看，否則不要在對話中顯示提示詞。
3. 每個資產或版本各呼叫一次生圖工具；不要用一張 contact sheet 代替多個獨立 storyboard 鏡頭。
4. 有角色出場時，先讀取並載入所有相關的已核准角色圖作為 reference images。保留角色比例、色彩、材質、輪廓與 anchors。
5. 生成後把選定結果從 Codex 的預設生成位置移動或複製到 workspace 的指定路徑。不得讓專案引用的圖片只留在全域生成目錄。
6. 在指定路徑重新檢視圖片，檢查構圖、角色一致性、多餘肢體、亂碼、水印、現有 IP 與兒童安全。
7. 對話中顯示生成圖片供使用者核准，但不要自動代替使用者核准。修改時建立下一版，不覆蓋舊檔。
8. 內建生圖不可用或失敗時停止並說明。除非使用者另外要求，否則不要切換到需要 API key 的 CLI/API fallback，也不要換用其他模型。

## 提示詞與圖片路徑

系列共用資產：

```text
series/<series-id>/image-prompts/
├── style/style-frame-v001.txt
├── characters/<character-slug>/
│   ├── turnaround-v001.txt
│   ├── expressions-v001.txt
│   └── poses-v001.txt
├── lineup/lineup-v001.txt
├── locations/<location-slug>-v001.txt
└── props/<prop-slug>-v001.txt

outputs/<series-id>/shared/images/
├── style/style-frame-v001.png
├── characters/<character-slug>/
│   ├── turnaround-v001.png
│   ├── expressions-v001.png
│   └── poses-v001.png
├── lineup/lineup-v001.png
├── locations/<location-slug>-v001.png
└── props/<prop-slug>-v001.png
```

Episode 資產：

```text
series/<series-id>/episodes/<episode-folder>/image-prompts/
├── storyboard/shot-01-v001.txt
├── keyframes/shot-01-start-v001.txt
└── thumbnail/thumbnail-v001.txt

outputs/<series-id>/<episode-folder>/images/
├── storyboard/shot-01-v001.png
├── keyframes/shot-01-start-v001.png
└── thumbnail/thumbnail-v001.png
```

提示詞與輸出圖片必須使用相同 stem。圖片預設使用 PNG。每次修改遞增 `v001`、`v002`；不要使用 `final-final`、`new` 或日期作版本名稱。

## 角色資產

- Turnaround：正面、3/4、側面、背面，固定柔光和純淺灰背景。
- Expressions：開心、好奇、擔心、思考、放鬆與驕傲。
- Poses：站立、行走、觀察、開心、擔心、思考、合作與慶祝。
- Lineup：全員全身正面，固定身高比例與間距。
- 角色卡 frontmatter 記錄已核准圖片的 workspace 相對路徑，例如 `turnaroundImage`、`expressionImage`、`poseImage`。

## Storyboard 圖

- 依 `storyboard.json` 順序逐鏡生成，一個鏡頭一張圖。
- 使用單一靜態構圖，不在圖中放鏡號、字幕、說明、對話框或 UI。
- 將鏡頭動作轉成最能代表該動作的清楚瞬間；避免在一張圖塞入動作的多個時間點。
- 優先使用已核准角色圖、場景圖和道具圖作 reference images。
- 全部鏡頭生成後依序展示供使用者審閱。只有使用者明確核准全部分鏡圖後，才把 `episode.json.storyboardImagesApproved` 設為 `true`。

## 編修

編修既有圖片時，先載入原圖，明確列出只可改動的項目與必須維持不變的項目。把修改提示詞和結果存成下一版；核准後更新文字狀態指向新版，保留舊版檔案。
