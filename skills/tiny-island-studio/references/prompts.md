# 生成任務模板

只讀取目前任務對應的區塊。把 `{{...}}` 替換為檔案中的真實內容。先產出單一 JSON，再依工作流寫入正式檔案。

## Story

Schema：`schemas/story.schema.json`

```text
你是資深兒童動畫影集編劇與分鏡導演。為 {{TARGET_AGE}} 歲兒童創作完全原創、安全、低刺激、可理解的故事，不模仿現有 IP。

系列風格聖經：
{{STYLE_BIBLE}}

本集企劃：
{{EPISODE_CONTEXT_JSON}}

本集已核准角色（只可使用這份名單）：
{{APPROVED_CHARACTERS_WITH_VISUAL_BIBLE}}

要求：
- 開頭 3 秒出現清楚問題。
- 使用 Stop → Look → Think → Try → Fix Together。
- 總長 2–4 分鐘；每鏡只有一個主要動作。
- 產出 6–8 個故事節奏與完整繁體中文旁白。
- 每個 `jimengPrompt` 使用簡體中文主體，遵守風格聖經，並逐字重申出場角色的英文 anchors、鏡頭、光線與場景。
- 避免文字入鏡、額外肢體、危險模仿、高刺激剪接與現有 IP。

只輸出單一 JSON，符合 skill 內的 schemas/story.schema.json，不含說明或 markdown 圍欄。
```

把 `logline`、`storyBeats`、`narration` 寫入 `story.md`。Story 階段產生的 shots 是後續分鏡的草案，不可取代 storyboard 階段驗證。

## Storyboard

Schema：`schemas/storyboard.schema.json`

```text
你是資深兒童動畫分鏡導演。把既有故事設計成可直接生成的完整分鏡，不改變故事核心。

系列風格聖經：
{{STYLE_BIBLE}}

已核准角色與 anchors：
{{APPROVED_CHARACTERS_WITH_VISUAL_BIBLE_AND_ANCHORS}}

本集資料與故事：
{{EPISODE_AND_STORY}}

要求：
- 產出 12–20 鏡，總長 90–180 秒，單鏡 2–15 秒。
- 前 3 秒清楚呈現問題，依 Stop → Look → Think → Try → Fix Together 推進。
- 每鏡只有一個主要動作，包含描述、秒數、聲音與簡體中文即夢提示詞 `jimengPrompt`。
- 提示詞主體使用清楚、分層的簡體中文；角色 anchors、專有名詞與必要英文負面詞保留英文原文。
- 每條提示詞必須逐字包含所有出場角色的英文 anchors。
- 每條提示詞必須包含 no text, no watermark, no extra limbs, no existing IP。
- 維持固定角色顏色、比例、材質、鏡頭、光線與場景；避免危險模仿、頻閃與快速剪接。

只輸出單一 JSON，符合 skill 內的 schemas/storyboard.schema.json，不含說明或 markdown 圍欄。
```

把每個 `jimengPrompt` 同步寫入 `prompts/shot-NN.txt`。舊專案的 `seedancePrompt` 可繼續讀取，但新分鏡只產生 `jimengPrompt`。

## Storyboard 靜態圖

每鏡另產生一份只供 GPT Image 2 使用的靜態圖片提示詞。把提示詞寫入 `image-prompts/storyboard/shot-NN-v001.txt` 後直接呼叫內建生圖，不在對話中顯示提示詞。

```text
Use case: illustration-story
Asset type: children's animation storyboard still
Primary request: {{SHOT_DESCRIPTION_AS_ONE_CLEAR_FROZEN_MOMENT}}
Input images: {{APPROVED_CHARACTER_LOCATION_AND_PROP_REFERENCES}}
Scene/backdrop: {{SCENE}}
Subject: {{CHARACTERS_WITH_COMPLETE_VISUAL_BIBLE_AND_ANCHORS}}
Style/medium: {{STYLE_BIBLE}}
Composition/framing: {{CAMERA_AND_COMPOSITION}}
Lighting/mood: {{LIGHTING_AND_EMOTION}}
Constraints: one still frame; preserve every approved character invariant; preschool-safe; no text; no captions; no watermark; no extra limbs; no existing IP
```

生成結果放到 `outputs/<series-id>/<episode-folder>/images/storyboard/shot-NN-v001.png`。逐鏡使用已核准角色圖作 reference，不要用一張 contact sheet 代替所有鏡頭。

## Character

Schema：`schemas/character.schema.json`

```text
你是原創兒童動畫角色設計總監。建立可長期量產、輪廓清楚、沒有現有 IP 相似性的角色定裝規格。

系列風格聖經：
{{STYLE_BIBLE}}

新角色設定：
{{CHARACTER_BRIEF}}

既有角色主色與輪廓：
{{EXISTING_CAST_COLORS_AND_SILHOUETTES}}

要求：
- 適合 {{TARGET_AGE}} 歲、低刺激、友善表情、少量穩定配色。
- 避免與既有 cast 主色或主要輪廓撞色。
- 視覺聖經明確固定顏色、比例、材質與至少兩個可逐字重複的英文 anchors。
- 定裝照使用純淺灰背景、固定柔光、正面／3/4／側面／背面轉面。
- 姿勢包含站立、走路、觀察、開心、擔心、思考、合作、慶祝。
- 三份英文提示詞只供 GPT Image 2 生成角色定裝資產，不輸出給使用者手動貼用。

只輸出單一 JSON，符合 skill 內的 schemas/character.schema.json，不含說明或 markdown 圍欄。
```

Schema 沒有 anchors 欄位；從 `visualBible` 選出至少兩個短而獨特的英文片語，另寫入角色卡 frontmatter。把三份提示詞分別存入 `image-prompts/characters/<slug>/turnaround-v001.txt`、`expressions-v001.txt`、`poses-v001.txt`，然後直接生圖。

## Lineup

Schema：`schemas/lineup.schema.json`

```text
你是兒童動畫影集美術總監。建立本系列全員定裝照／身高比例圖。

系列風格聖經：
{{STYLE_BIBLE}}

完整 cast 角色卡：
{{CAST_CHARACTER_CARDS}}

要求：
- 純淺灰背景、固定柔光、全員全身正面站立。
- 明確固定身高比例、主色、材質、輪廓與角色間距。
- 每位角色必須符合自己的 anchors 與負面提示詞。
- 不新增角色，不混用其他系列資訊。

只輸出單一 JSON，符合 skill 內的 schemas/lineup.schema.json，不含說明或 markdown 圍欄。
```

把 lineup prompt 存到 `image-prompts/lineup/lineup-v001.txt`，在 `lineup.md` 保留全部 `castingNotes` 與核准圖片路徑；不要在對話中顯示 prompt。直接生成 `outputs/<series-id>/shared/images/lineup/lineup-v001.png`。

## 輸出失敗

JSON 或驗證不通過時，將錯誤訊息連同原輸出交回同一任務修正。最多重試兩次；第二次仍失敗就保留原檔、停止推進並向使用者呈報具體錯誤。
