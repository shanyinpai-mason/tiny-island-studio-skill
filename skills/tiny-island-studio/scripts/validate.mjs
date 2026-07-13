#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STAGES = ['idea', 'script', 'storyboard', 'generate', 'edit', 'review', 'scheduled', 'published']
const EDIT_ITEMS = [
  '每個鏡頭只有一個清楚動作',
  '旁白與畫面同步',
  '前 3 秒問題清楚',
  '音效不突然、不過度刺激',
  '片尾保留合作成功的情緒落點',
]
const REVIEW_ITEMS = [
  '沒有危險模仿行為',
  '沒有現有角色或品牌元素',
  '角色顏色、比例、服裝一致',
  '沒有多餘肢體、亂碼或水印',
  '標題與縮圖沒有誤導兒童',
  '無快速閃爍或頻閃畫面',
  '音量平穩，無突發巨響',
  '內容適合最低年齡 3 歲觀看',
]
const REQUIRED_NEGATIVES = ['no text', 'no watermark', 'no extra limbs', 'no existing ip']
const REQUIRED_EPISODE_FIELDS = ['code', 'title', 'subtitle', 'stage', 'format', 'publishDate', 'hook', 'learning', 'emotion']
const REQUIRED_STORYBOARD_FIELDS = ['totalDuration', 'directorNote', 'shots']
const REQUIRED_SHOT_FIELDS = ['no', 'duration', 'description', 'sound']
const ALLOWED_STORYBOARD_FIELDS = new Set(REQUIRED_STORYBOARD_FIELDS)
const ALLOWED_SHOT_FIELDS = new Set([...REQUIRED_SHOT_FIELDS, 'jimengPrompt', 'seedancePrompt'])

const scriptFile = fileURLToPath(import.meta.url)
const skillDir = resolve(dirname(scriptFile), '..')

function findWorkspaceRoot(start) {
  if (process.env.TINY_ISLAND_WORKSPACE) return resolve(process.env.TINY_ISLAND_WORKSPACE)
  let current = resolve(start)
  while (true) {
    if (existsSync(join(current, 'series'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

const workspaceRoot = findWorkspaceRoot(process.cwd())
const defaultSeriesRoot = join(workspaceRoot, 'series')

const args = process.argv.slice(2)
const statusMode = args.includes('--status')
const verbose = args.includes('--verbose')
const gateIndex = args.indexOf('--gate')
const requestedGate = gateIndex >= 0 ? args[gateIndex + 1] : null
const positional = args.filter((arg, index) => arg !== '--status' && arg !== '--verbose' && arg !== '--gate' && !(gateIndex >= 0 && index === gateIndex + 1))

const results = []
let failures = 0

function report(ok, message) {
  results.push({ ok, message })
  if (!ok) failures += 1
  const repetitiveSuccess = /^(?:鏡頭 \d{2} (?:是物件|包含 |沒有多餘欄位|no 連續遞增|duration 為|文字欄位|.*包含錨點|包含全域負面詞)|shot-\d{2}\.txt (?:存在|與 storyboard\.json 一致))/.test(message)
  if (!ok || verbose || !repetitiveSuccess) console.log(`${ok ? '✓' : '✗'} ${message}`)
}

function note(message) {
  console.log(`• ${message}`)
}

function warning(message) {
  console.log(`⚠ ${message}`)
}

async function readUtf8(path) {
  return readFile(path, 'utf8')
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readUtf8(path))
  } catch (error) {
    report(false, `${label} 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function videoPrompt(shot) {
  if (isNonEmptyString(shot?.jimengPrompt)) return shot.jimengPrompt
  if (isNonEmptyString(shot?.seedancePrompt)) return shot.seedancePrompt
  return ''
}

function videoPromptField(shot) {
  const fields = ['jimengPrompt', 'seedancePrompt'].filter(field => Object.prototype.hasOwnProperty.call(shot ?? {}, field))
  return fields.length === 1 && isNonEmptyString(shot[fields[0]]) ? fields[0] : null
}

async function hasNonEmptyVersionedFile(directory, pattern) {
  if (!existsSync(directory)) return false
  const files = (await readdir(directory)).filter(file => pattern.test(file))
  for (const file of files) {
    if ((await stat(join(directory, file))).size > 0) return true
  }
  return false
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const data = {}
  for (const rawLine of match[1].split(/\r?\n/)) {
    const separator = rawLine.indexOf(':')
    if (separator < 1) continue
    const key = rawLine.slice(0, separator).trim()
    const rawValue = rawLine.slice(separator + 1).trim()
    if (rawValue === 'true' || rawValue === 'false') {
      data[key] = rawValue === 'true'
      continue
    }
    if (rawValue.startsWith('[')) {
      try {
        data[key] = JSON.parse(rawValue)
        continue
      } catch {
        data[key] = []
        continue
      }
    }
    data[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }
  return data
}

function section(markdown, names) {
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const heading = new RegExp(`(?:^|\\r?\\n)##\\s+(?:${escaped})\\s*\\r?\\n`, 'i')
  const match = heading.exec(markdown)
  if (!match) return ''
  const remainder = markdown.slice(match.index + match[0].length)
  const nextHeading = remainder.search(/\r?\n##\s+/)
  return (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim()
}

function storyState(markdown) {
  const logline = section(markdown, ['Logline', '故事主線'])
  const beatsText = section(markdown, ['故事節奏', 'Story Beats'])
  const narration = section(markdown, ['完整旁白', 'Narration'])
  const beats = beatsText.split(/\r?\n/).filter(line => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line))
  return { logline, narration, beats }
}

function checkedLines(markdown, headingNames) {
  return section(markdown, headingNames)
    .split(/\r?\n/)
    .filter(line => /^\s*-\s*\[[xX]\]/.test(line))
}

function includesRiskTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (/^[\x00-\x7F]+$/.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
  }
  return text.includes(term)
}

async function loadRiskTerms() {
  const safetyPath = join(skillDir, 'references', 'safety.md')
  if (!existsSync(safetyPath)) {
    report(false, '找不到 references/safety.md')
    return []
  }
  const markdown = await readUtf8(safetyPath)
  const block = markdown.match(/<!-- RISK_TERMS_JSON_START -->([\s\S]*?)<!-- RISK_TERMS_JSON_END -->/)
  const json = block?.[1].match(/```json\s*([\s\S]*?)```/i)?.[1]
  if (!json) {
    report(false, 'safety.md 缺少可解析的風險詞 JSON 區塊')
    return []
  }
  try {
    const terms = JSON.parse(json)
    if (!Array.isArray(terms) || terms.some(item => !isNonEmptyString(item?.term) || !isNonEmptyString(item?.reason))) {
      throw new Error('每筆風險詞都需要 term 與 reason')
    }
    return terms
  } catch (error) {
    report(false, `風險詞 JSON 格式錯誤：${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

async function loadCharacters(seriesDir) {
  const charactersDir = join(seriesDir, 'characters')
  if (!existsSync(charactersDir)) return []
  const files = (await readdir(charactersDir)).filter(file => extname(file).toLowerCase() === '.md')
  const characters = []
  for (const file of files) {
    const markdown = await readUtf8(join(charactersDir, file))
    const meta = parseFrontmatter(markdown)
    if (meta.approved !== true) continue
    const name = typeof meta.name === 'string' ? meta.name : basename(file, '.md')
    const aliases = [basename(file, '.md'), name, ...name.split(/\s+/)]
      .map(value => value.trim().toLowerCase())
      .filter(value => value.length >= 2)
    const anchors = Array.isArray(meta.anchors) ? meta.anchors.filter(isNonEmptyString) : []
    characters.push({ file, name, aliases: [...new Set(aliases)], anchors })
  }
  return characters
}

function findRisks(storyMarkdown, storyboard, riskTerms) {
  const findings = []
  const seen = new Set()
  const inspect = (location, field, text) => {
    if (typeof text !== 'string') return
    for (const risk of riskTerms) {
      if (!includesRiskTerm(text, risk.term)) continue
      const key = `${location}|${field}|${risk.term.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({ location, field, ...risk })
    }
  }
  inspect('story.md', 'narration', storyMarkdown)
  for (const shot of storyboard?.shots ?? []) {
    const location = `鏡頭${String(shot.no).padStart(2, '0')}`
    inspect(location, 'description', shot.description)
    inspect(location, videoPromptField(shot) || 'videoPrompt', videoPrompt(shot))
    inspect(location, 'sound', shot.sound)
  }
  return findings
}

function riskConfirmed(finding, reviewMarkdown) {
  const lines = reviewMarkdown.split(/\r?\n/).filter(line => /^\s*-\s*\[[xX]\]\s*已人工確認/.test(line))
  return lines.some(line => line.toLowerCase().includes(finding.location.toLowerCase()) && line.toLowerCase().includes(finding.term.toLowerCase()))
}

function resolveGate(requested, current) {
  if (!requested) return null
  const requestedIndex = STAGES.indexOf(requested)
  const currentIndex = STAGES.indexOf(current)
  if (requestedIndex === currentIndex + 1) {
    note(`準備進入 ${requested}，先驗證目前的 ${current} 關卡`)
    return current
  }
  return requested
}

function futureDate(value) {
  const timestamp = dateTimestamp(value)
  if (timestamp === null) return false
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return timestamp > today
}

function dateTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function dateHasArrived(value) {
  const timestamp = dateTimestamp(value)
  if (timestamp === null) return false
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return timestamp <= today
}

async function validateEpisode(inputDir) {
  const episodeDir = resolve(inputDir)
  console.log(`\nTiny Island Studio 驗證：${episodeDir}\n`)
  report(existsSync(episodeDir), 'episode 目錄存在')
  if (!existsSync(episodeDir)) return finish()

  const episodePath = join(episodeDir, 'episode.json')
  report(existsSync(episodePath), 'episode.json 存在')
  if (!existsSync(episodePath)) return finish()
  const episode = await readJson(episodePath, 'episode.json')
  if (!episode) return finish()

  for (const field of REQUIRED_EPISODE_FIELDS) {
    report(Object.prototype.hasOwnProperty.call(episode, field), `episode.json 包含 ${field}`)
  }
  report(STAGES.includes(episode.stage), `stage 合法：${episode.stage ?? '(缺少)'}`)
  report(typeof episode.code === 'string' && /^EP\d+$/i.test(episode.code), 'code 使用 EP 加數字格式')
  for (const field of ['title', 'subtitle', 'format', 'publishDate']) {
    report(typeof episode[field] === 'string', `${field} 是字串`)
  }

  const seriesDir = dirname(dirname(episodeDir))
  const seriesPath = join(seriesDir, 'series.json')
  const series = existsSync(seriesPath) ? await readJson(seriesPath, 'series.json') : null
  const seriesId = series?.id || basename(seriesDir)
  const outputRoot = resolve(workspaceRoot, series?.outputRoot || join('outputs', seriesId))
  const episodeOutputDir = join(outputRoot, basename(episodeDir))
  const storyPath = join(episodeDir, 'story.md')
  const storyboardPath = join(episodeDir, 'storyboard.json')
  const reviewPath = join(episodeDir, 'review.md')
  const storyMarkdown = existsSync(storyPath) ? await readUtf8(storyPath) : ''
  const reviewMarkdown = existsSync(reviewPath) ? await readUtf8(reviewPath) : ''
  const parsedStory = storyState(storyMarkdown)
  const storyboard = existsSync(storyboardPath) ? await readJson(storyboardPath, 'storyboard.json') : null
  let storyboardValid = Boolean(storyboard)

  if (storyboard) {
    for (const field of REQUIRED_STORYBOARD_FIELDS) {
      const ok = Object.prototype.hasOwnProperty.call(storyboard, field)
      report(ok, `storyboard.json 包含 ${field}`)
      storyboardValid &&= ok
    }
    const extraRootFields = Object.keys(storyboard).filter(field => !ALLOWED_STORYBOARD_FIELDS.has(field))
    report(extraRootFields.length === 0, extraRootFields.length ? `storyboard.json 有未允許欄位：${extraRootFields.join(', ')}` : 'storyboard.json 沒有多餘欄位')
    storyboardValid &&= extraRootFields.length === 0
    const shots = Array.isArray(storyboard.shots) ? storyboard.shots : []
    report(Array.isArray(storyboard.shots), 'shots 是陣列')
    report(shots.length >= 12 && shots.length <= 20, `鏡數為 ${shots.length}（需 12–20）`)
    storyboardValid &&= Array.isArray(storyboard.shots) && shots.length >= 12 && shots.length <= 20
    let calculatedDuration = 0
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index]
      const label = `鏡頭 ${String(index + 1).padStart(2, '0')}`
      const isObject = shot && typeof shot === 'object' && !Array.isArray(shot)
      report(isObject, `${label} 是物件`)
      if (!isObject) {
        storyboardValid = false
        continue
      }
      for (const field of REQUIRED_SHOT_FIELDS) {
        const ok = Object.prototype.hasOwnProperty.call(shot, field)
        report(ok, `${label} 包含 ${field}`)
        storyboardValid &&= ok
      }
      const promptField = videoPromptField(shot)
      const promptOk = promptField !== null
      report(promptOk, promptOk ? `${label} 包含單一 ${promptField}` : `${label} 必須且只能包含 jimengPrompt 或 seedancePrompt`)
      storyboardValid &&= promptOk
      const extraFields = Object.keys(shot).filter(field => !ALLOWED_SHOT_FIELDS.has(field))
      report(extraFields.length === 0, extraFields.length ? `${label} 有未允許欄位：${extraFields.join(', ')}` : `${label} 沒有多餘欄位`)
      storyboardValid &&= extraFields.length === 0
      const numberOk = Number.isInteger(shot.no) && shot.no === index + 1
      report(numberOk, `${label} no 連續遞增`)
      const durationOk = Number.isInteger(shot.duration) && shot.duration >= 2 && shot.duration <= 15
      report(durationOk, `${label} duration 為 2–15 秒`)
      const textFieldsOk = isNonEmptyString(shot.description) && isNonEmptyString(videoPrompt(shot)) && typeof shot.sound === 'string'
      report(textFieldsOk, `${label} 文字欄位型別正確且必要內容非空`)
      storyboardValid &&= numberOk && durationOk && textFieldsOk
      if (Number.isInteger(shot.duration)) calculatedDuration += shot.duration
    }
    const totalRangeOk = calculatedDuration >= 90 && calculatedDuration <= 180
    report(totalRangeOk, `實際總長 ${calculatedDuration} 秒（需 90–180）`)
    report(storyboard.totalDuration === calculatedDuration, `totalDuration 與鏡頭加總一致（${storyboard.totalDuration ?? '缺少'}）`)
    storyboardValid &&= totalRangeOk && storyboard.totalDuration === calculatedDuration && isNonEmptyString(storyboard.directorNote)

    const promptsDir = join(episodeDir, 'prompts')
    report(existsSync(promptsDir), 'prompts/ 目錄存在')
    const promptFiles = existsSync(promptsDir)
      ? (await readdir(promptsDir)).filter(file => /^shot-\d{2}\.txt$/i.test(file)).sort()
      : []
    report(promptFiles.length === shots.length, `prompt 檔數 ${promptFiles.length} 與鏡數 ${shots.length} 一致`)
    storyboardValid &&= promptFiles.length === shots.length
    for (let index = 0; index < shots.length; index += 1) {
      const file = `shot-${String(index + 1).padStart(2, '0')}.txt`
      const path = join(promptsDir, file)
      const exists = existsSync(path)
      report(exists, `${file} 存在`)
      if (!exists) {
        storyboardValid = false
        continue
      }
      const text = (await readUtf8(path)).trim()
      const matches = text === videoPrompt(shots[index]).trim()
      report(matches, `${file} 與 storyboard.json 一致`)
      storyboardValid &&= matches
    }

    const characters = await loadCharacters(seriesDir)
    report(characters.length > 0, `讀取 ${characters.length} 位 approved 角色`)
    for (const character of characters) {
      report(character.anchors.length > 0, `${character.name} 有 anchors`)
      storyboardValid &&= character.anchors.length > 0
    }
    for (const shot of shots) {
      const prompt = videoPrompt(shot)
      const searchable = `${shot.description}\n${prompt}`.toLowerCase()
      const promptLower = prompt.toLowerCase()
      for (const character of characters) {
        const appears = character.aliases.some(alias => searchable.includes(alias))
        if (!appears) continue
        for (const anchor of character.anchors) {
          const ok = promptLower.includes(anchor.toLowerCase())
          report(ok, `鏡頭 ${String(shot.no).padStart(2, '0')} ${character.name} 包含錨點「${anchor}」`)
          storyboardValid &&= ok
        }
      }
      for (const phrase of REQUIRED_NEGATIVES) {
        const ok = promptLower.includes(phrase)
        report(ok, `鏡頭 ${String(shot.no).padStart(2, '0')} 包含全域負面詞「${phrase}」`)
        storyboardValid &&= ok
      }
    }
  } else {
    note('尚無 storyboard.json；需要分鏡成果的關卡會阻擋推進')
  }

  const risks = findRisks(storyMarkdown, storyboard, await loadRiskTerms())
  const unresolvedRisks = risks.filter(finding => !riskConfirmed(finding, reviewMarkdown))
  for (const finding of risks) {
    const confirmed = riskConfirmed(finding, reviewMarkdown)
    warning(`${finding.location} / ${finding.field} / 命中「${finding.term}」：${finding.reason}${confirmed ? '（已人工確認）' : ''}`)
  }
  if (!risks.length) note('安全掃描未命中風險詞')

  const effectiveGate = resolveGate(requestedGate, episode.stage)
  if (requestedGate && !STAGES.includes(requestedGate)) {
    report(false, `未知 gate：${requestedGate}`)
  } else if (effectiveGate) {
    console.log(`\n關卡檢查：${effectiveGate}\n`)
    if (effectiveGate === 'idea') {
      for (const field of ['hook', 'learning', 'emotion']) report(isNonEmptyString(episode[field]), `${field} 已填寫`)
    }
    if (effectiveGate === 'script') {
      report(existsSync(storyPath), 'story.md 存在')
      report(isNonEmptyString(parsedStory.logline), 'story.md 含非空 Logline')
      report(parsedStory.beats.length >= 6 && parsedStory.beats.length <= 8, `story.md 含 ${parsedStory.beats.length} 個故事節奏（需 6–8）`)
      report(isNonEmptyString(parsedStory.narration), 'story.md 含完整旁白')
    }
    if (effectiveGate === 'storyboard') {
      report(storyboardValid, '分鏡結構、即夢提示詞同步與一致性全部通過')
      const shots = Array.isArray(storyboard?.shots) ? storyboard.shots : []
      const imagePromptDir = join(episodeDir, 'image-prompts', 'storyboard')
      const storyboardImageDir = join(episodeOutputDir, 'images', 'storyboard')
      for (const shot of shots) {
        const stem = `shot-${String(shot.no).padStart(2, '0')}`
        report(
          await hasNonEmptyVersionedFile(imagePromptDir, new RegExp(`^${stem}-v\\d{3}\\.txt$`, 'i')),
          `${stem} 靜態圖提示詞已存檔`,
        )
        report(
          await hasNonEmptyVersionedFile(storyboardImageDir, new RegExp(`^${stem}-v\\d{3}\\.(?:png|jpe?g|webp)$`, 'i')),
          `${stem} storyboard 圖已生成`,
        )
      }
      report(episode.storyboardImagesApproved === true, '使用者已核准全部 storyboard 圖（storyboardImagesApproved: true）')
    }
    if (effectiveGate === 'generate') {
      const shots = Array.isArray(storyboard?.shots) ? storyboard.shots : []
      for (const shot of shots) {
        const stem = `shot-${String(shot.no).padStart(2, '0')}`
        const takeDir = join(episodeOutputDir, 'shots', stem)
        report(
          await hasNonEmptyVersionedFile(takeDir, /^take-\d{2}\.mp4$/i),
          `${stem} 至少有一個 take-NN.mp4`,
        )
      }
      report(episode.generateConfirmed === true, '使用者已確認逐鏡動畫完成（generateConfirmed: true）')
    }
    if (effectiveGate === 'edit') {
      report(existsSync(reviewPath), 'review.md 存在')
      const checked = checkedLines(reviewMarkdown, ['剪輯清單'])
      for (const item of EDIT_ITEMS) report(checked.some(line => line.includes(item)), `剪輯確認：${item}`)
    }
    if (effectiveGate === 'review') {
      report(existsSync(reviewPath), 'review.md 存在')
      const checked = checkedLines(reviewMarkdown, ['審核清單', '發布前審核清單'])
      for (const item of REVIEW_ITEMS) report(checked.some(line => line.includes(item)), `安全審核：${item}`)
      report(unresolvedRisks.length === 0, unresolvedRisks.length ? `尚有 ${unresolvedRisks.length} 個風險詞警告未人工確認` : '所有風險詞警告皆已人工確認')
    }
    if (requestedGate === 'scheduled' && episode.stage === 'review') {
      report(futureDate(episode.publishDate), `publishDate ${episode.publishDate || '(空白)'} 是未來日期`)
      note('上傳 YouTube 時必須標記「為兒童打造」（Made for Kids）')
    }
    if (effectiveGate === 'scheduled') {
      if (requestedGate === 'published' && episode.stage === 'scheduled') {
        report(dateHasArrived(episode.publishDate), `publishDate ${episode.publishDate || '(空白)'} 已到達，可標記 published`)
      } else {
        report(futureDate(episode.publishDate), `publishDate ${episode.publishDate || '(空白)'} 是未來日期`)
      }
      note('上傳 YouTube 時必須標記「為兒童打造」（Made for Kids）')
    }
    if (effectiveGate === 'published') note('published 關卡沒有額外阻擋；請記錄 views、retention、subs 並完成複盤')
  }

  return finish()
}

function daysFromToday(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText ?? '')) return null
  const date = new Date(`${dateText}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((date.getTime() - today) / 86_400_000)
}

function compareEpisodeNames(left, right) {
  const leftNumber = Number(left.match(/^EP(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
  const rightNumber = Number(right.match(/^EP(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
  return leftNumber - rightNumber || left.localeCompare(right, 'zh-Hant')
}

async function generateStatus(seriesRootInput) {
  const seriesRoot = resolve(seriesRootInput || defaultSeriesRoot)
  console.log(`\n重新生成 STATUS.md：${seriesRoot}\n`)
  report(existsSync(seriesRoot), 'series/ 目錄存在')
  if (!existsSync(seriesRoot)) return finish()
  const sections = ['# Tiny Island Studio 狀態', '', `更新日期：${new Date().toISOString().slice(0, 10)}`, '']
  const seriesDirs = (await readdir(seriesRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  for (const entry of seriesDirs) {
    const seriesDir = join(seriesRoot, entry.name)
    const seriesPath = join(seriesDir, 'series.json')
    if (!existsSync(seriesPath)) {
      warning(`略過 ${entry.name}：缺少 series.json`)
      continue
    }
    const series = await readJson(seriesPath, `${entry.name}/series.json`)
    if (!series) continue
    const allCharacterFiles = existsSync(join(seriesDir, 'characters'))
      ? (await readdir(join(seriesDir, 'characters'))).filter(file => file.endsWith('.md')).sort()
      : []
    const cast = []
    for (const file of allCharacterFiles) {
      const meta = parseFrontmatter(await readUtf8(join(seriesDir, 'characters', file)))
      cast.push(`${meta.name || basename(file, '.md')} ${meta.approved === true ? '✓ approved' : '○ 待核准'}`)
    }
    sections.push(`## ${series.name || entry.name}`, '', `角色：${cast.length ? cast.join('、') : '尚未建立'}`, '', '| 代號 | 標題 | stage | 發布日 | 距今天數 |', '|---|---|---|---|---:|')
    const episodesDir = join(seriesDir, 'episodes')
    const episodeDirs = existsSync(episodesDir)
      ? (await readdir(episodesDir, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => compareEpisodeNames(a.name, b.name))
      : []
    for (const episodeEntry of episodeDirs) {
      const path = join(episodesDir, episodeEntry.name, 'episode.json')
      if (!existsSync(path)) {
        warning(`${entry.name}/${episodeEntry.name} 缺少 episode.json`)
        continue
      }
      const episode = await readJson(path, `${episodeEntry.name}/episode.json`)
      if (!episode) continue
      const days = daysFromToday(episode.publishDate)
      const stageDate = episode.stageUpdatedAt ? new Date(`${episode.stageUpdatedAt}T00:00:00Z`) : new Date((await stat(path)).mtimeMs)
      const ageDays = Math.floor((Date.now() - stageDate.getTime()) / 86_400_000)
      const overdue = days !== null && days < 0 && episode.stage !== 'published'
      const stalled = ageDays > 14 && episode.stage !== 'published'
      const flags = `${overdue ? ' ⚠逾期' : ''}${stalled ? ` ⚠停滯${ageDays}天` : ''}`
      sections.push(`| ${episode.code || '?'} | ${episode.title || episodeEntry.name} | ${episode.stage || '?'}${flags} | ${episode.publishDate || '未定'} | ${days === null ? '—' : days} |`)
    }
    if (!episodeDirs.length) sections.push('| — | 尚無集數 | — | — | — |')
    sections.push('')
  }
  const output = join(seriesRoot, 'STATUS.md')
  await writeFile(output, `${sections.join('\n').trim()}\n`, 'utf8')
  report(true, `已寫入 ${output}`)
  return finish()
}

function finish() {
  console.log(`\n結果：${failures === 0 ? `全部通過（${results.length} 項檢查）` : `${failures} 項失敗`}\n`)
  process.exitCode = failures === 0 ? 0 : 1
  return failures === 0
}

if (statusMode) {
  await generateStatus(positional[0] || defaultSeriesRoot)
} else if (positional[0]) {
  await validateEpisode(positional[0])
} else {
  console.error('用法：node validate.mjs <episodeDir> [--gate <stage>] [--verbose]\n      node validate.mjs --status [seriesDir]')
  process.exitCode = 2
}
