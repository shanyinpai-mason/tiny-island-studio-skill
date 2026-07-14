# 場景與道具 continuity

在生成任何 storyboard still 前，先建立並核准場景與重要道具 reference。角色 reference 不能替代場景或道具 reference。

## 資料模型

在 episode 根目錄建立 `continuity.json`，格式依 `schemas/continuity.schema.json`：

```json
{
  "locations": [
    {
      "id": "meadow-bus-stop",
      "name": "草地公車站",
      "anchors": [
        "round cream bus shelter with three teal posts",
        "one curved coral bench facing the road"
      ],
      "promptFile": "series/tiny-island/image-prompts/locations/meadow-bus-stop-v001.txt",
      "referenceImage": "outputs/tiny-island/shared/images/locations/meadow-bus-stop-v001.png",
      "approved": true
    }
  ],
  "props": [
    {
      "id": "bubble-bus",
      "name": "泡泡巴士",
      "anchors": [
        "pastel aqua bubble bus with one coral front bumper",
        "four identical yellow wheel hubs"
      ],
      "promptFile": "series/tiny-island/image-prompts/props/bubble-bus-v001.txt",
      "referenceImage": "outputs/tiny-island/shared/images/props/bubble-bus-v001.png",
      "approved": true
    }
  ]
}
```

- `id`：穩定的 kebab-case ID；核准後不可因描述改寫而更換。
- `anchors`：至少兩個短英文 invariants，必須可見、可計數或可定位。不要使用 `beautiful`、`cute` 等主觀詞。
- `promptFile`、`referenceImage`：workspace 相對路徑。reference 圖必須是已核准版本。
- `approved`：只能在使用者看過 reference 圖並明確核准後設為 `true`。

把跨集反覆使用的資產放在系列共用路徑；只在單集出現的資產可放在 episode 路徑。不要複製同一場景或道具成多份 reference。

## 哪些資產必須做 reference

為每個主要場景建立 location reference。為下列任一情況的道具建立 prop reference：跨兩鏡以上出現、角色會拿取或操作、影響故事因果、具有特定形狀／顏色／零件數量。一次性且不重要的背景小物可只寫在場景中。

若同一地點發生永久狀態改變，例如「未修好的巴士」變成「修好的巴士」，優先把可變物件建成 prop；不要把同一地點拆成兩個 location ID。必要時為 prop 建立清楚的起始／結束狀態 reference，並把兩者寫進 anchors。

## 生成順序

1. 從完整故事列出所有主要 location 與 continuity-critical prop。
2. 寫 `continuity.json`，先保持 `approved: false`。
3. 逐一保存 reference prompt，再用 image generation 生成 location plate 或 prop sheet。一次只生成一項資產。
4. 展示 reference 圖；使用者核准後才更新路徑與 `approved: true`。
5. 生成 `storyboard.json`；每鏡必須有一個 `locationId` 與 `propIds` 陣列，且只能引用 `continuity.json` 內的 ID。
6. 在第一張 storyboard still 前執行：

```powershell
node <skill-dir>/scripts/validate.mjs <episode-directory> --continuity
```

任何 reference 缺檔、未核准、shot 綁定不存在的 ID，都必須先修正。

## 每鏡靜態圖提示詞

每個 `image-prompts/storyboard/shot-NN-vNNN.txt` 必須：

- 明列實際要附上的角色、location、prop reference 圖 workspace 相對路徑。
- 原樣包含該鏡 location 與所有 prop 的 anchors。
- 指定 `preserve exact layout, geometry, colors, materials and object count from the approved references`。
- 只描述一個 frozen moment；不要讓模型自行重設場景、替換道具或增減零件。

生成工具若有 reference 數量上限，優先順序為：出場角色 → location → 被操作／故事關鍵 prop → 其他 prop。不得因超過上限就默默省略；應拆鏡、製作 approved contact sheet，或先向使用者報告阻礙。

## 修改規則

- 只改鏡頭構圖或角色動作時，沿用相同 continuity references。
- 想改場景或道具設計時，先生成下一版 reference 並重新核准，再重做受影響的鏡頭。
- 一次只改一個 continuity 變量，保留舊版本；不要同時換場景、道具與鏡頭語言。
