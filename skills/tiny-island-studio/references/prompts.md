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

有效旁白模式（episode.json 優先於 series.json，皆未設定時為 spoken）：
{{NARRATION_MODE}}

共同要求：
- 開頭 3 秒出現清楚問題。
- 使用 Stop → Look → Think → Try → Fix Together。
- 產出 6–8 個故事節奏；認知答案與情緒轉折必須適齡、清楚。
- 只能使用上方已核准角色。
- 這是 script 階段，不產生鏡頭、`jimengPrompt` 或 `storyboard.json`。
- 完全原創、安全、低刺激、適齡；避免危險模仿、過度刺激與現有 IP。

依 `{{NARRATION_MODE}}` 只採用一個分支：

- `spoken`：輸出 `narrationMode: "spoken"` 與非空 `narration`，內容為完整繁體中文旁白，維持既有完整旁白流程。
- `nonverbal`：輸出 `narrationMode: "nonverbal"` 與非空 `audioActionScript`，不得輸出 `narration`。`audioActionScript` 依 6–8 個故事節奏逐段寫成可製作的動作與聲音腳本，每段必須按需要清楚描述：
  - 可見動作與情緒表演；
  - 角色視線、指向、互相觀察與反應；
  - `hmm`、`oh`、`ah`、`uh-oh` 等短促非語言發聲；
  - 擬聲、道具聲與環境音；
  - 音樂開始、停止、提示、強弱與情緒轉折；
  - 讓觀眾觀察或思考答案所需的刻意停頓；
  - 合作修復成功時的固定品牌聲 `Pom–Pi–Ko–Fix!`。
- `nonverbal` 禁止敘事者、完整對話、完整口語句子、字幕式說明，以及必須理解中文或其他特定語言才能執行的指示。認知答案與情緒轉折必須由畫面、表演與聲音本身理解，不能靠文字補充。

只輸出單一 JSON，符合 skill 內的 schemas/story.schema.json，不含說明或 markdown 圍欄。
```

把 `logline`、`storyBeats` 與模式對應腳本寫入 `story.md`。新檔案開頭必須是以下 frontmatter；`spoken` 使用 `## 完整旁白`，`nonverbal` 使用 `## 動作與聲音腳本`：

```yaml
---
narrationMode: spoken
---
```

把 `spoken` 改成實際有效模式。既有沒有 frontmatter 的 `story.md` 視為 `spoken`。Storyboard 階段才產生鏡頭與提示詞。

## Storyboard

Schema：`schemas/storyboard.schema.json`

```text
你是資深兒童動畫分鏡導演。把既有故事設計成可直接生成的完整分鏡，不改變故事核心。

系列風格聖經：
{{STYLE_BIBLE}}

已核准角色與 anchors：
{{APPROVED_CHARACTERS_WITH_VISUAL_BIBLE_AND_ANCHORS}}

已核准 continuity bible（完整 `continuity.json`；只可引用其中 ID）：
{{APPROVED_CONTINUITY_JSON}}

本集資料與故事：
{{EPISODE_AND_STORY}}

有效旁白模式：
{{NARRATION_MODE}}

共同要求：
- 產出 12–20 鏡，總長 90–180 秒，單鏡 2–15 秒。
- 前 3 秒清楚呈現問題，依 Stop → Look → Think → Try → Fix Together 推進。
- 每鏡只有一個主要動作，包含描述、秒數、`locationId`、`propIds`、聲音與簡體中文即夢提示詞 `jimengPrompt`。
- `locationId` 必須是該鏡唯一主場景；`propIds` 必須列出畫面內所有 continuity-critical props。不得引用 continuity bible 以外的 ID。
- `jimengPrompt` 是 Seedance 2 圖生影片提示詞，嚴格使用 `references/seedance-2.md` 的生產模板。主體使用清楚、分層的簡體中文；anchors、preservation phrases、專有名詞與必要英文負面詞保留英文原文。
- 每條提示詞必須逐字包含所有出場角色的英文 anchors。
- 每條提示詞只有一個主鏡頭指令，主體動作與鏡頭動作分開，duration 必須等於該鏡秒數。
- 每條提示詞必須包含 `preserve composition and colors`、`keep identity consistent`、`keep location and prop geometry consistent`、`avoid jitter`、`avoid temporal flicker`、`avoid identity drift`、`avoid chaotic composition`、`no text`、`no watermark`、`no extra limbs`、`no existing IP`；有人物時再包含 `avoid bent limbs`。
- 維持固定角色顏色、比例、材質、光線、場景幾何、固定物位置、道具形狀與數量；避免危險模仿、頻閃與快速剪接。

依 `{{NARRATION_MODE}}` 套用模式規則：

- `spoken`：維持既有分鏡與旁白行為。
- `nonverbal`：
  - 每鏡 `sound` 必須非空，明確描述至少一項角色短聲、擬聲、環境音、音樂提示或刻意靜默；需要時標示音樂開始、停止與情緒轉折。
  - `jimengPrompt` 不得要求生成敘事旁白、完整對話或完整口語句子；角色只可有 `hmm`、`oh`、`ah`、`uh-oh` 等短促非語言發聲與固定品牌聲 `Pom–Pi–Ko–Fix!`。
  - 以可見動作、構圖、視線、指向、表情反應及可見結果傳達問題、思考、答案與情緒轉折，不可依賴特定語言、字幕或文字才能理解。

只輸出單一 JSON，符合 skill 內的 schemas/storyboard.schema.json，不含說明或 markdown 圍欄。
```

把每個 `jimengPrompt` 同步寫入 `prompts/shot-NN.txt`。舊專案的 `seedancePrompt` 可繼續讀取，但新分鏡只產生 `jimengPrompt`。

> 待即夢介面實測：若版本提供獨立的負面提示詞欄位，應把必要英文負面詞貼入該欄位；在確認前仍保留於每條 prompt 正文，以維持現有驗證規則。

## Storyboard 靜態圖

每鏡另產生一份只供 GPT Image 2 使用的靜態圖片提示詞。把提示詞寫入 `image-prompts/storyboard/shot-NN-v001.txt` 後直接呼叫內建生圖，不在對話中顯示提示詞。

```text
Use case: illustration-story
Asset type: children's animation storyboard still
Primary request: {{SHOT_DESCRIPTION_AS_ONE_CLEAR_FROZEN_MOMENT}}
Input images (attach every listed file): {{APPROVED_CHARACTER_LOCATION_AND_PROP_REFERENCE_PATHS}}
Continuity bindings: locationId={{LOCATION_ID}}; propIds={{PROP_IDS}}
Scene/backdrop invariants (verbatim): {{LOCATION_ANCHORS}}
Prop invariants (verbatim): {{PROP_ANCHORS}}
Subject: {{CHARACTERS_WITH_COMPLETE_VISUAL_BIBLE_AND_ANCHORS}}
Style/medium: {{STYLE_BIBLE}}
Composition/framing: {{CAMERA_AND_COMPOSITION}}
Lighting/mood: {{LIGHTING_AND_EMOTION}}
Constraints: one still frame; preserve every approved character invariant; preserve exact layout, geometry, colors, materials and object count from the approved references; do not redesign, replace, add or remove scene fixtures or props; preschool-safe; no text; no captions; no watermark; no extra limbs; no existing IP
```

生成結果放到 `outputs/<series-id>/<episode-folder>/images/storyboard/shot-NN-v001.png`。逐鏡實際附上出場角色圖與 `locationId`／`propIds` 綁定的全部核准 reference；不要只把路徑寫進提示詞，也不要用未核准的臨時圖取代。

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
