# 即夢 Seedance 2 圖生影片提示詞

本工作流以已核准的 storyboard still 作為首幀／視覺參考，因此使用「圖生影片」提示詞：重點寫運動與變化，不重複發明畫面。規則整理自 [Seedance 2.0 提示詞指南](https://help.apiyi.com/zh-hant/seedance-2-0-prompt-guide-video-generation-camera-style-tips-zh-hant.html)，並針對本 skill 的角色、場景與道具 continuity 加強。

## 生產模板

使用簡體中文描述，保留角色、場景、道具 anchors 與下列固定約束的英文原文。以約 60–100 個有意義詞彙為目標，刪除無作用的形容詞。

```text
主体：{{ATTACHED_STILL中的出场角色与关键道具；包含必要英文anchors}}。
动作：{{一个明确主动作；具体动词、幅度、起止状态}}。
环境：{{只写会动的环境元素}}；光线保持{{LIGHTING_ANCHOR}}。
镜头：{{ONE_PRIMARY_CAMERA_MOVE_WITH_SLOW_SMOOTH_STABLE_RHYTHM}}。
风格：{{STYLE_ANCHOR}}；preserve composition and colors; keep identity consistent; keep location and prop geometry consistent。
时长：{{DURATION}} seconds；画幅：{{ASPECT_RATIO}}。
约束：avoid jitter, avoid temporal flicker, avoid identity drift, avoid chaotic composition{{IF_CHARACTERS: , avoid bent limbs}}；no text, no watermark, no extra limbs, no existing IP。
```

## 寫作規則

1. 分開寫主體動作與鏡頭動作。每鏡只有一個主體主動作。
2. 鏡頭只選一個主指令：`fixed/locked-off`、`push-in`、`pull-out`、`pan/lateral`、`tracking/follow`、`orbit/arc`、`aerial`、`handheld`。兒童動畫預設 `fixed/locked-off`、gentle push-in 或 smooth tracking。
3. 用 `slow`、`gentle`、`smooth`、`stable`、`gradual` 表達節奏；不要堆疊 fps、光圈、ISO、焦距等技術參數。
4. 避免未限定的 `fast`、`epic`、`amazing`、`beautiful`、`lots of movement`。若快節奏不可避免，只允許主體、鏡頭、環境三者之一變快。
5. 明確寫光線並保持與 storyboard still 一致。光線比泛稱 `cinematic` 更有用。
6. 不詳細重述已在圖片中的外觀，但仍保留 validator 所需的短英文 identity anchors。
7. duration 必須等於該 shot 的 `duration`；畫幅取自 episode／series 格式。

## 鏡頭選擇

- 情緒聚焦：`camera slow gentle push-in`。
- 展示空間：`camera gradual pull-out`。
- 跟隨行走或滾動：`camera smooth stable tracking`。
- 教學比較或手部操作：`camera locked-off`。
- 除非故事必要，不使用 handheld、快速運鏡或多段複合運鏡。

## 迭代

第一次用生產模板建立 baseline。若結果不理想，每個新 take 只改一個變量：主體動作幅度、鏡頭、環境動態、光線或約束擇一。記錄變更原因，不要同時全面重寫提示詞。若持續不穩，退回 locked-off 鏡頭、單一慢動作、固定光線的兜底版本。

貼入即夢前確認：只有一個主鏡頭指令；主體與鏡頭運動分開；沒有矛盾風格；保留構圖、色彩、角色 identity、場景幾何與道具數量；負面約束齊全。
