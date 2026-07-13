# 兒童動畫安全規範

## 剪輯清單

完成 `edit` 關卡前逐項確認：

- [ ] 每個鏡頭只有一個清楚動作
- [ ] 旁白與畫面同步
- [ ] 前 3 秒問題清楚
- [ ] 音效不突然、不過度刺激
- [ ] 片尾保留合作成功的情緒落點

## 發布前審核清單

完成 `review` 關卡前逐項確認：

- [ ] 沒有危險模仿行為
- [ ] 沒有現有角色或品牌元素
- [ ] 角色顏色、比例、服裝一致
- [ ] 沒有多餘肢體、亂碼或水印
- [ ] 標題與縮圖沒有誤導兒童
- [ ] 無快速閃爍或頻閃畫面（每秒不超過 3 次亮度變化）
- [ ] 音量平穩，無突發巨響（目標 -14 LUFS）
- [ ] 內容適合最低年齡 3 歲觀看（無恐懼、無威脅性角色）

排程時提醒創作者：YouTube 上傳必須標記「為兒童打造」（Made for Kids）。

## 風險詞處理

風險詞只觸發人工檢查，不自動判定內容有害。先理解上下文，再把確認結果寫入該集 `review.md`：

```markdown
- [x] 已人工確認 鏡頭07 knife — 畫面是安全的玩具餐具示範，沒有模仿風險
```

驗證器會讀取以下 JSON。維持單一 JSON 陣列，不要改變標記行。

<!-- RISK_TERMS_JSON_START -->
```json
[
  { "term": "knife", "category": "武器", "reason": "幼兒可能模仿持刀或切割動作。" },
  { "term": "gun", "category": "武器", "reason": "槍械意象可能造成恐懼或危險模仿。" },
  { "term": "刀", "category": "武器", "reason": "幼兒可能模仿持刀或切割動作。" },
  { "term": "槍", "category": "武器", "reason": "槍械意象可能造成恐懼或危險模仿。" },
  { "term": "fire", "category": "火與電", "reason": "明火情節可能引發危險模仿。" },
  { "term": "flame", "category": "火與電", "reason": "火焰情節需要成人判斷情境是否安全。" },
  { "term": "electric", "category": "火與電", "reason": "用電情節可能造成觸電模仿風險。" },
  { "term": "火", "category": "火與電", "reason": "明火情節可能引發危險模仿。" },
  { "term": "觸電", "category": "火與電", "reason": "觸電情節不適合讓幼兒模仿。" },
  { "term": "swallow", "category": "危險模仿", "reason": "吞食非食物可能導致窒息或中毒。" },
  { "term": "choke", "category": "危險模仿", "reason": "窒息情節可能造成不安且涉及高風險行為。" },
  { "term": "climb high", "category": "危險模仿", "reason": "攀爬高處可能導致墜落。" },
  { "term": "road", "category": "危險模仿", "reason": "道路場景需要明確的成人陪同與交通安全。" },
  { "term": "吞", "category": "危險模仿", "reason": "吞食非食物可能導致窒息或中毒。" },
  { "term": "馬路", "category": "危險模仿", "reason": "道路場景需要明確的成人陪同與交通安全。" },
  { "term": "攀爬", "category": "危險模仿", "reason": "攀爬高處可能導致墜落。" },
  { "term": "墜落", "category": "危險模仿", "reason": "墜落情節可能造成恐懼或模仿風險。" },
  { "term": "blood", "category": "驚嚇", "reason": "血液畫面不符合低刺激幼兒內容。" },
  { "term": "scary", "category": "驚嚇", "reason": "驚嚇元素需要確認不會威脅低齡觀眾。" },
  { "term": "monster chase", "category": "驚嚇", "reason": "追逐威脅可能造成幼兒恐懼。" },
  { "term": "血", "category": "驚嚇", "reason": "血液畫面不符合低刺激幼兒內容。" },
  { "term": "恐怖", "category": "驚嚇", "reason": "恐怖元素需要確認不會威脅低齡觀眾。" }
]
```
<!-- RISK_TERMS_JSON_END -->
