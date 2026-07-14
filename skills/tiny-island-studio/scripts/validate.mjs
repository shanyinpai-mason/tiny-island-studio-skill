#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STAGES = ['idea', 'script', 'storyboard', 'generate', 'edit', 'review', 'scheduled', 'published']
const NARRATION_MODES = ['spoken', 'nonverbal']
const BASE_EDIT_ITEMS = [
  '每個鏡頭只有一個清楚動作',
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
const REQUIRED_JIMENG_PHRASES = [
  'preserve composition and colors',
  'keep identity consistent',
  'keep location and prop geometry consistent',
  'avoid jitter',
  'avoid temporal flicker',
  'avoid identity drift',
  'avoid chaotic composition',
  'avoid bent limbs',
]
const REQUIRED_EPISODE_FIELDS = ['code', 'title', 'subtitle', 'stage', 'format', 'publishDate', 'hook', 'learning', 'emotion']
const REQUIRED_STORYBOARD_FIELDS = ['totalDuration', 'directorNote', 'shots']
const REQUIRED_SHOT_FIELDS = ['no', 'duration', 'description', 'locationId', 'propIds', 'sound']
const ALLOWED_STORYBOARD_FIELDS = new Set(REQUIRED_STORYBOARD_FIELDS)
const ALLOWED_SHOT_FIELDS = new Set([...REQUIRED_SHOT_FIELDS, 'jimengPrompt', 'seedancePrompt'])
const ALLOWED_CONTINUITY_FIELDS = new Set(['locations', 'props'])
const ALLOWED_CONTINUITY_ASSET_FIELDS = new Set(['id', 'name', 'anchors', 'promptFile', 'referenceImage', 'approved'])
const CAMERA_MOTIONS = [
  ['push-in', /\b(?:push[ -]?in|dolly in)\b|推镜|推进/i],
  ['pull-out', /\b(?:pull[ -]?out|dolly out)\b|拉镜|拉远/i],
  ['pan/lateral', /\b(?:pan|lateral)\b|横移|摇镜/i],
  ['tracking/follow', /\b(?:tracking|follow)\b|跟拍|跟随镜头/i],
  ['orbit/arc', /\b(?:orbit|arc)\b|环绕/i],
  ['aerial', /\b(?:aerial|drone)\b|航拍|鸟瞰/i],
  ['handheld', /\bhandheld\b|手持/i],
  ['fixed', /\b(?:fixed|locked[ -]?off)\b|固定镜头|镜头固定/i],
]

const scriptFile = fileURLToPath(import.meta.url)
const skillDir = resolve(dirname(scriptFile), '..')
const args = process.argv.slice(2)
const statusMode = args.includes('--status')
const continuityMode = args.includes('--continuity')
const verbose = args.includes('--verbose')
const gateIndex = args.indexOf('--gate')
const requestedGate = gateIndex >= 0 ? args[gateIndex + 1] : null
const positional = args.filter((arg, index) =>
  arg !== '--status' && arg !== '--continuity' && arg !== '--verbose' && arg !== '--gate' && !(gateIndex >= 0 && index === gateIndex + 1),
)

const results = []
let failures = 0

function report(ok, message) {
  results.push({ ok, message })
  if (!ok) failures += 1
  if (!ok || verbose || !/^(?:鏡頭 \d{2}|shot-\d{2}\.txt)/.test(message)) {
    console.log(`${ok ? '✓' : '✗'} ${message}`)
  }
}

function warning(message) {
  console.log(`⚠ ${message}`)
}

function note(message) {
  console.log(`ℹ ${message}`)
}

async function readUtf8(path) {
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
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

function narrationModeState(episode, series) {
  const episodeHasMode = Object.prototype.hasOwnProperty.call(episode ?? {}, 'narrationMode')
  const seriesHasMode = Object.prototype.hasOwnProperty.call(series ?? {}, 'narrationMode')
  const source = episodeHasMode ? 'episode.json' : seriesHasMode ? 'series.json' : 'default'
  const value = episodeHasMode ? episode.narrationMode : seriesHasMode ? series.narrationMode : 'spoken'
  return { value, source, valid: NARRATION_MODES.includes(value) }
}

function editItemsForMode(narrationMode) {
  const syncItem = narrationMode === 'nonverbal' ? '動作與聲音腳本與畫面同步' : '旁白與畫面同步'
  return [BASE_EDIT_ITEMS[0], syncItem, ...BASE_EDIT_ITEMS.slice(1)]
}

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

function workspaceFromSeriesRoot(seriesRoot) {
  if (process.env.TINY_ISLAND_WORKSPACE) return resolve(process.env.TINY_ISLAND_WORKSPACE)
  const absolute = resolve(seriesRoot)
  return basename(absolute).toLowerCase() === 'series' ? dirname(absolute) : findWorkspaceRoot(absolute)
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
  for (const file of (await readdir(directory)).filter(file => pattern.test(file))) {
    if ((await stat(join(directory, file))).size > 0) return true
  }
  return false
}

async function latestNonEmptyVersionedFile(directory, pattern) {
  if (!existsSync(directory)) return null
  const files = (await readdir(directory)).filter(file => pattern.test(file)).sort().reverse()
  for (const file of files) {
    const path = join(directory, file)
    if ((await stat(path)).size > 0) return path
  }
  return null
}

function workspacePath(workspaceRoot, relativePath) {
  if (!isNonEmptyString(relativePath)) return null
  const absolute = resolve(workspaceRoot, relativePath)
  const relative = absolute.slice(workspaceRoot.length)
  if (absolute !== workspaceRoot && !relative.startsWith('\\') && !relative.startsWith('/')) return null
  return absolute
}

function parseFrontmatter(markdown) {
  const clean = markdown.replace(/^\uFEFF/, '')
  const match = clean.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const data = {}
  for (const rawLine of match[1].split(/\r?\n/)) {
    const separator = rawLine.indexOf(':')
    if (separator < 1) continue
    const key = rawLine.slice(0, separator).trim()
    const rawValue = rawLine.slice(separator + 1).trim()
    if (rawValue === 'true' || rawValue === 'false') {
      data[key] = rawValue === 'true'
    } else if (rawValue.startsWith('[')) {
      try { data[key] = JSON.parse(rawValue) } catch { data[key] = [] }
    } else {
      data[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
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
  const metadata = parseFrontmatter(markdown)
  const narrationMode = Object.prototype.hasOwnProperty.call(metadata, 'narrationMode') ? metadata.narrationMode : 'spoken'
  const logline = section(markdown, ['Logline', '一句話故事'])
  const beatsText = section(markdown, ['故事節奏', 'Story Beats'])
  const narration = section(markdown, ['完整旁白', 'Narration'])
  const audioActionScript = section(markdown, ['動作與聲音腳本', 'Audio Action Script'])
  const beats = beatsText.split(/\r?\n/).filter(line => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line))
  return { narrationMode, logline, beatsText, narration, audioActionScript, beats }
}

function checkedLines(markdown, headingNames) {
  return section(markdown, headingNames).split(/\r?\n/).filter(line => /^\s*-\s*\[[xX]\]/.test(line))
}

function includesAsciiTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
}

function removeAll(text, value) {
  if (!value) return text
  return text.split(value).join('')
}

function riskVariantMatches(text, risk, term, allowlist) {
  let searchable = String(text)
  for (const exception of risk.exceptions ?? []) searchable = removeAll(searchable, exception)
  for (const allowed of allowlist) {
    const allowedTerms = [allowed?.term, ...(Array.isArray(allowed?.terms) ? allowed.terms : [])].filter(isNonEmptyString)
    if (allowedTerms.includes(term) && isNonEmptyString(allowed?.context)) searchable = removeAll(searchable, allowed.context)
  }
  return /^[\x00-\x7F]+$/.test(term) ? includesAsciiTerm(searchable, term) : searchable.includes(term)
}

async function loadRiskTerms() {
  const safetyPath = join(skillDir, 'references', 'safety.md')
  if (!existsSync(safetyPath)) {
    report(false, '缺少 references/safety.md')
    return []
  }
  const markdown = await readUtf8(safetyPath)
  const block = markdown.match(/<!-- RISK_TERMS_JSON_START -->([\s\S]*?)<!-- RISK_TERMS_JSON_END -->/)
  const json = block?.[1].match(/```json\s*([\s\S]*?)```/i)?.[1]
  if (!json) {
    report(false, 'safety.md 缺少機器可讀風險詞 JSON')
    return []
  }
  try {
    const risks = JSON.parse(json)
    if (!Array.isArray(risks)) throw new Error('根節點必須是陣列')
    return risks.map(risk => {
      const terms = Array.isArray(risk.terms) ? risk.terms : [risk.term]
      if (!terms.every(isNonEmptyString) || !isNonEmptyString(risk.reason)) throw new Error('每項都需要 terms 與 reason')
      return { ...risk, terms, exceptions: Array.isArray(risk.exceptions) ? risk.exceptions.filter(isNonEmptyString) : [] }
    })
  } catch (error) {
    report(false, `風險詞 JSON 解析失敗：${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

async function loadSafetyAllowlist(seriesDir) {
  const path = join(seriesDir, 'safety-allowlist.json')
  if (!existsSync(path)) return []
  const data = await readJson(path, 'safety-allowlist.json')
  if (!Array.isArray(data)) {
    report(false, 'safety-allowlist.json 根節點必須是陣列')
    return []
  }
  return data
}

async function loadCharacters(seriesDir) {
  const charactersDir = join(seriesDir, 'characters')
  if (!existsSync(charactersDir)) return []
  const characters = []
  for (const file of (await readdir(charactersDir)).filter(file => extname(file).toLowerCase() === '.md')) {
    const meta = parseFrontmatter(await readUtf8(join(charactersDir, file)))
    if (meta.approved !== true) continue
    const name = typeof meta.name === 'string' ? meta.name : basename(file, '.md')
    const aliases = [basename(file, '.md'), name, ...name.split(/\s+/)]
      .map(value => value.trim().toLowerCase()).filter(value => value.length >= 2)
    const anchors = Array.isArray(meta.anchors) ? meta.anchors.filter(isNonEmptyString) : []
    characters.push({ file, name, aliases: [...new Set(aliases)], anchors })
  }
  return characters
}

async function loadContinuity({ episodeDir, workspaceRoot, blocking }) {
  let valid = true
  const check = (ok, message) => {
    if (blocking) report(ok, message)
    else if (!ok) warning(`非目前關卡：${message}`)
    valid &&= ok
  }
  const path = join(episodeDir, 'continuity.json')
  check(existsSync(path), '缺少 continuity.json')
  if (!existsSync(path)) return { valid: false, locations: new Map(), props: new Map() }
  const continuity = await readJson(path, 'continuity.json')
  if (!continuity) return { valid: false, locations: new Map(), props: new Map() }

  const extraRootFields = Object.keys(continuity).filter(field => !ALLOWED_CONTINUITY_FIELDS.has(field))
  check(extraRootFields.length === 0, extraRootFields.length ? `continuity.json 有未允許欄位：${extraRootFields.join(', ')}` : 'continuity.json 欄位正確')
  const locations = Array.isArray(continuity.locations) ? continuity.locations : []
  const props = Array.isArray(continuity.props) ? continuity.props : []
  check(Array.isArray(continuity.locations) && locations.length > 0, 'continuity locations 必須是非空陣列')
  check(Array.isArray(continuity.props), 'continuity props 必須是陣列')

  const ids = new Set()
  const maps = { locations: new Map(), props: new Map() }
  for (const [kind, assets] of [['locations', locations], ['props', props]]) {
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index]
      const label = `${kind}[${index}]`
      const objectOk = asset && typeof asset === 'object' && !Array.isArray(asset)
      check(objectOk, `${label} 必須是物件`)
      if (!objectOk) continue
      const extraFields = Object.keys(asset).filter(field => !ALLOWED_CONTINUITY_ASSET_FIELDS.has(field))
      check(extraFields.length === 0, extraFields.length ? `${label} 有未允許欄位：${extraFields.join(', ')}` : `${label} 欄位正確`)
      const idOk = typeof asset.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(asset.id) && !ids.has(asset.id)
      check(idOk, `${label} id 必須是唯一 kebab-case：${asset.id ?? '(缺少)'}`)
      const anchorsOk = Array.isArray(asset.anchors) && asset.anchors.length >= 2 && asset.anchors.every(isNonEmptyString)
      check(anchorsOk, `${label} 至少需要兩個非空 anchors`)
      check(isNonEmptyString(asset.name) && isNonEmptyString(asset.promptFile) && isNonEmptyString(asset.referenceImage) && typeof asset.approved === 'boolean', `${label} name、路徑與 approved 格式正確`)
      if (idOk) {
        ids.add(asset.id)
        maps[kind].set(asset.id, asset)
      }
      check(asset.approved === true, `${label} ${asset.name || asset.id || ''} 必須由使用者核准`)
      for (const [field, description] of [['promptFile', 'reference prompt'], ['referenceImage', 'reference image']]) {
        const absolute = workspacePath(workspaceRoot, asset[field])
        check(absolute !== null, `${label} ${field} 必須是 workspace 內相對路徑`)
        const exists = absolute !== null && existsSync(absolute) && (await stat(absolute)).size > 0
        check(exists, `${label} ${description} 必須存在且非空：${asset[field] || '(缺少)'}`)
      }
    }
  }
  return { valid, ...maps }
}

function validateJimengPrompt(shot, check) {
  if (!isNonEmptyString(shot?.jimengPrompt)) return true
  const label = `鏡頭 ${String(shot.no).padStart(2, '0')}`
  const prompt = shot.jimengPrompt
  const lower = prompt.toLowerCase()
  let valid = true
  const verify = (ok, message) => {
    check(ok, message)
    valid &&= ok
  }
  verify(/动作\s*[:：]/.test(prompt) && /镜头\s*[:：]/.test(prompt), `${label} Seedance 2 必須分開標示主体动作與镜头`)
  for (const phrase of REQUIRED_JIMENG_PHRASES) verify(lower.includes(phrase), `${label} Seedance 2 缺少「${phrase}」`)
  verify(lower.includes(`${shot.duration} seconds`), `${label} Seedance 2 時長必須是 ${shot.duration} seconds`)
  const motions = CAMERA_MOTIONS.filter(([, pattern]) => pattern.test(prompt)).map(([name]) => name)
  verify(motions.length === 1, motions.length === 1
    ? `${label} Seedance 2 主鏡頭是 ${motions[0]}`
    : `${label} Seedance 2 必須且只能有一個主鏡頭指令；目前：${motions.join(', ') || '未辨識'}`)
  verify(!/(^|[^a-z])fast([^a-z]|$)/i.test(prompt), `${label} Seedance 2 不可使用未限定的 fast`)
  return valid
}

function findRisks(storyMarkdown, storyboard, risks, allowlist) {
  const findings = []
  const seen = new Set()
  const inspect = (location, field, text) => {
    if (typeof text !== 'string') return
    for (const risk of risks) {
      for (const term of risk.terms) {
        if (!riskVariantMatches(text, risk, term, allowlist)) continue
        const key = `${location}|${field}|${term.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        findings.push({ location, field, term, category: risk.category, reason: risk.reason })
      }
    }
  }
  const parsed = storyState(storyMarkdown)
  inspect('story.md', 'Logline', parsed.logline)
  inspect('story.md', '故事節奏', parsed.beatsText)
  inspect('story.md', '完整旁白', parsed.narration)
  inspect('story.md', '動作與聲音腳本', parsed.audioActionScript)
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
    note(`目標是進入 ${requested}；現在先驗證 ${current} 的完成條件`)
    return current
  }
  return requested
}

function localDateTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date.getTime()
}

function localTodayTimestamp() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function schedulableDate(value) {
  const timestamp = localDateTimestamp(value)
  return timestamp !== null && timestamp >= localTodayTimestamp()
}

function dateHasArrived(value) {
  const timestamp = localDateTimestamp(value)
  return timestamp !== null && timestamp <= localTodayTimestamp()
}

function validateAnchors(character, output) {
  const aliases = new Set(character.aliases.map(alias => alias.toLowerCase()))
  const anchors = character.anchors.map(anchor => anchor.trim())
  const valid = anchors.length >= 2
    && anchors.every(anchor => !/^todo(?:-|\b)/i.test(anchor))
    && anchors.every(anchor => !aliases.has(anchor.toLowerCase()))
  output(valid, `${character.name} 至少要有兩個有效 anchors，且不可只是角色名稱或 TODO`)
  return valid
}

async function validateStoryboard({ storyboard, episodeDir, episodeOutputDir, seriesDir, narrationMode, continuity, blocking }) {
  let valid = Boolean(storyboard)
  const check = (ok, message) => {
    if (blocking) report(ok, message)
    else if (!ok) warning(`非目前關卡：${message}`)
    valid &&= ok
  }
  if (!storyboard) {
    if (blocking) report(false, '缺少 storyboard.json')
    else note('尚未建立 storyboard.json')
    return false
  }

  for (const field of REQUIRED_STORYBOARD_FIELDS) check(Object.prototype.hasOwnProperty.call(storyboard, field), `storyboard.json 缺少 ${field}`)
  const extraRootFields = Object.keys(storyboard).filter(field => !ALLOWED_STORYBOARD_FIELDS.has(field))
  check(extraRootFields.length === 0, extraRootFields.length ? `storyboard.json 有未允許欄位：${extraRootFields.join(', ')}` : 'storyboard.json 欄位正確')
  const shots = Array.isArray(storyboard.shots) ? storyboard.shots : []
  check(Array.isArray(storyboard.shots), 'shots 必須是陣列')
  check(shots.length >= 12 && shots.length <= 20, `鏡頭數是 ${shots.length}，應為 12–20`)
  let calculatedDuration = 0
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index]
    const label = `鏡頭 ${String(index + 1).padStart(2, '0')}`
    const isObject = shot && typeof shot === 'object' && !Array.isArray(shot)
    check(isObject, `${label} 必須是物件`)
    if (!isObject) continue
    for (const field of REQUIRED_SHOT_FIELDS) check(Object.prototype.hasOwnProperty.call(shot, field), `${label} 缺少 ${field}`)
    const promptField = videoPromptField(shot)
    check(promptField !== null, `${label} 必須且只能有 jimengPrompt 或 legacy seedancePrompt`)
    const extraFields = Object.keys(shot).filter(field => !ALLOWED_SHOT_FIELDS.has(field))
    check(extraFields.length === 0, extraFields.length ? `${label} 有未允許欄位：${extraFields.join(', ')}` : `${label} 欄位正確`)
    check(Number.isInteger(shot.no) && shot.no === index + 1, `${label} no 必須連號`)
    check(Number.isInteger(shot.duration) && shot.duration >= 2 && shot.duration <= 15, `${label} duration 必須是 2–15 秒整數`)
    check(isNonEmptyString(shot.description) && isNonEmptyString(videoPrompt(shot)) && typeof shot.sound === 'string', `${label} 文字欄位格式正確`)
    check(isNonEmptyString(shot.locationId) && continuity.locations.has(shot.locationId), `${label} locationId 必須綁定已定義場景：${shot.locationId ?? '(缺少)'}`)
    check(Array.isArray(shot.propIds) && new Set(shot.propIds).size === shot.propIds.length && shot.propIds.every(id => continuity.props.has(id)), `${label} propIds 必須是不重複且全部已定義的陣列`)
    validateJimengPrompt(shot, check)
    if (narrationMode === 'nonverbal') check(isNonEmptyString(shot.sound), `${label} nonverbal sound 必須描述短聲、擬聲、環境音、音樂提示或刻意靜默`)
    if (Number.isInteger(shot.duration)) calculatedDuration += shot.duration
  }
  check(calculatedDuration >= 90 && calculatedDuration <= 180, `總時長 ${calculatedDuration} 秒，應為 90–180 秒`)
  check(storyboard.totalDuration === calculatedDuration, `totalDuration 應等於鏡頭秒數總和 ${calculatedDuration}`)
  check(isNonEmptyString(storyboard.directorNote), 'directorNote 不可空白')

  const promptsDir = join(episodeDir, 'prompts')
  const promptFiles = existsSync(promptsDir) ? (await readdir(promptsDir)).filter(file => /^shot-\d{2}\.txt$/i.test(file)).sort() : []
  check(existsSync(promptsDir), '缺少 prompts/ 目錄')
  check(promptFiles.length === shots.length, `prompt 檔數 ${promptFiles.length} 應等於鏡頭數 ${shots.length}`)
  for (let index = 0; index < shots.length; index += 1) {
    const file = `shot-${String(index + 1).padStart(2, '0')}.txt`
    const path = join(promptsDir, file)
    check(existsSync(path), `${file} 存在`)
    if (existsSync(path)) check((await readUtf8(path)).trim() === videoPrompt(shots[index]).trim(), `${file} 與 storyboard.json 一致`)
  }

  const characters = await loadCharacters(seriesDir)
  check(characters.length > 0, '至少需要一位 approved 角色')
  for (const character of characters) validateAnchors(character, check)
  for (const shot of shots) {
    const prompt = videoPrompt(shot)
    const searchable = `${shot.description}\n${prompt}`.toLowerCase()
    const promptLower = prompt.toLowerCase()
    for (const character of characters) {
      if (!character.aliases.some(alias => searchable.includes(alias))) continue
      for (const anchor of character.anchors) check(promptLower.includes(anchor.toLowerCase()), `鏡頭 ${String(shot.no).padStart(2, '0')} ${character.name} 缺少 anchor「${anchor}」`)
    }
    for (const phrase of REQUIRED_NEGATIVES) check(promptLower.includes(phrase), `鏡頭 ${String(shot.no).padStart(2, '0')} 缺少必要負面詞「${phrase}」`)
  }
  return valid
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
  for (const field of REQUIRED_EPISODE_FIELDS) report(Object.prototype.hasOwnProperty.call(episode, field), `episode.json 包含 ${field}`)
  report(STAGES.includes(episode.stage), `stage 合法：${episode.stage ?? '(缺少)'}`)
  report(typeof episode.code === 'string' && /^EP\d+$/i.test(episode.code), 'code 使用 EP 加數字格式')
  for (const field of ['title', 'subtitle', 'format', 'publishDate']) report(typeof episode[field] === 'string', `${field} 是字串`)

  if (requestedGate && !STAGES.includes(requestedGate)) report(false, `未知 gate：${requestedGate}`)
  const effectiveGate = resolveGate(requestedGate, episode.stage)
  const effectiveIndex = effectiveGate ? STAGES.indexOf(effectiveGate) : -1
  const storyboardBlocking = !effectiveGate || effectiveIndex >= STAGES.indexOf('storyboard')
  const seriesDir = dirname(dirname(episodeDir))
  const seriesPath = join(seriesDir, 'series.json')
  const series = existsSync(seriesPath) ? await readJson(seriesPath, 'series.json') : null
  const narrationMode = narrationModeState(episode, series)
  report(narrationMode.valid, narrationMode.valid
    ? `narrationMode 為 ${narrationMode.value}（來源：${narrationMode.source}）`
    : `${narrationMode.source} 的 narrationMode 必須是 spoken 或 nonverbal`)
  const seriesId = series?.id || basename(seriesDir)
  const workspaceRoot = findWorkspaceRoot(episodeDir)
  const outputRoot = resolve(workspaceRoot, series?.outputRoot || join('outputs', seriesId))
  const episodeOutputDir = join(outputRoot, basename(episodeDir))
  const storyPath = join(episodeDir, 'story.md')
  const storyboardPath = join(episodeDir, 'storyboard.json')
  const reviewPath = join(episodeDir, 'review.md')
  const storyMarkdown = existsSync(storyPath) ? await readUtf8(storyPath) : ''
  const reviewMarkdown = existsSync(reviewPath) ? await readUtf8(reviewPath) : ''
  const parsedStory = storyState(storyMarkdown)
  if (existsSync(storyPath) && narrationMode.valid) {
    report(parsedStory.narrationMode === narrationMode.value, `story.md narrationMode 為 ${parsedStory.narrationMode}，應為 ${narrationMode.value}`)
  }
  const storyboard = existsSync(storyboardPath) ? await readJson(storyboardPath, 'storyboard.json') : null
  const continuity = (storyboard || continuityMode)
    ? await loadContinuity({ episodeDir, workspaceRoot, blocking: storyboardBlocking || continuityMode })
    : { valid: !storyboardBlocking, locations: new Map(), props: new Map() }
  const storyboardValid = await validateStoryboard({ storyboard, episodeDir, episodeOutputDir, seriesDir, narrationMode: narrationMode.value, continuity, blocking: storyboardBlocking || continuityMode })

  const risks = findRisks(storyMarkdown, storyboard, await loadRiskTerms(), await loadSafetyAllowlist(seriesDir))
  const unresolvedRisks = risks.filter(finding => !riskConfirmed(finding, reviewMarkdown))
  for (const finding of risks) {
    const confirmed = riskConfirmed(finding, reviewMarkdown)
    warning(`${finding.location} / ${finding.field} / 風險詞「${finding.term}」：${finding.reason}${confirmed ? '（已人工確認）' : ''}`)
  }
  if (!risks.length) note('沒有偵測到風險詞')

  if (continuityMode) {
    console.log('\nContinuity 預檢\n')
    report(Boolean(storyboard), 'storyboard.json 已建立，可檢查逐鏡 continuity 綁定')
    report(continuity.valid && storyboardValid, '所有 location／prop references 已核准、檔案存在且逐鏡綁定有效')
  }

  if (effectiveGate) {
    console.log(`\n關卡驗證：${effectiveGate}\n`)
    if (effectiveGate === 'idea') {
      for (const field of ['hook', 'learning', 'emotion']) report(isNonEmptyString(episode[field]), `${field} 已填寫`)
    }
    if (effectiveGate === 'script') {
      report(existsSync(storyPath), 'story.md 存在')
      report(isNonEmptyString(parsedStory.logline), 'story.md 有 Logline')
      report(parsedStory.beats.length >= 6 && parsedStory.beats.length <= 8, `story.md 有 ${parsedStory.beats.length} 個故事節奏，應為 6–8`)
      if (narrationMode.value === 'nonverbal') {
        report(isNonEmptyString(parsedStory.audioActionScript), 'story.md 有動作與聲音腳本')
        report(!isNonEmptyString(parsedStory.narration), 'nonverbal story.md 不含完整旁白')
      } else {
        report(isNonEmptyString(parsedStory.narration), 'story.md 有完整旁白')
      }
    }
    if (effectiveGate === 'storyboard') {
      report(storyboardValid && continuity.valid, '分鏡結構、continuity 綁定、提示詞與角色一致性通過')
      const shots = Array.isArray(storyboard?.shots) ? storyboard.shots : []
      const requireStills = series?.requireStoryboardStills !== false
      const imagePromptDir = join(episodeDir, 'image-prompts', 'storyboard')
      const storyboardImageDir = join(episodeOutputDir, 'images', 'storyboard')
      for (const shot of shots) {
        const stem = `shot-${String(shot.no).padStart(2, '0')}`
        const imagePromptPath = await latestNonEmptyVersionedFile(imagePromptDir, new RegExp(`^${stem}-v\\d{3}\\.txt$`, 'i'))
        const promptExists = imagePromptPath !== null
        const imageExists = await hasNonEmptyVersionedFile(storyboardImageDir, new RegExp(`^${stem}-v\\d{3}\\.(?:png|jpe?g|webp)$`, 'i'))
        if (requireStills) {
          report(promptExists, `${stem} 有版本化靜態圖提示詞`)
          if (imagePromptPath) {
            const imagePrompt = await readUtf8(imagePromptPath)
            const boundAssets = [
              continuity.locations.get(shot.locationId),
              ...(Array.isArray(shot.propIds) ? shot.propIds.map(id => continuity.props.get(id)) : []),
            ].filter(Boolean)
            for (const asset of boundAssets) {
              report(imagePrompt.includes(asset.referenceImage), `${stem} 靜態圖提示詞缺少 reference image「${asset.referenceImage}」`)
              for (const anchor of asset.anchors) report(imagePrompt.toLowerCase().includes(anchor.toLowerCase()), `${stem} 靜態圖提示詞缺少 ${asset.id} anchor「${anchor}」`)
            }
            report(
              imagePrompt.toLowerCase().includes('preserve exact layout, geometry, colors, materials and object count from the approved references'),
              `${stem} 靜態圖提示詞缺少 continuity preservation 約束`,
            )
          }
          report(imageExists, `${stem} 有 storyboard 靜態圖`)
        } else if (!promptExists || !imageExists) {
          note(`${stem} 未完成 storyboard still（系列設定為非必要）`)
        }
      }
      if (requireStills) report(episode.storyboardImagesApproved === true, '使用者已核准 storyboard 圖（storyboardImagesApproved: true）')
      else note('series.json 的 requireStoryboardStills=false，略過 stills 與核准硬性要求')
    }
    if (effectiveGate === 'generate') {
      for (const shot of storyboard?.shots ?? []) {
        const stem = `shot-${String(shot.no).padStart(2, '0')}`
        report(await hasNonEmptyVersionedFile(join(episodeOutputDir, 'shots', stem), /^take-\d{2}\.mp4$/i), `${stem} 至少有一個 take-NN.mp4`)
      }
      report(episode.generateConfirmed === true, '使用者已確認生成完成（generateConfirmed: true）')
    }
    if (effectiveGate === 'edit') {
      report(existsSync(reviewPath), 'review.md 存在')
      const checked = checkedLines(reviewMarkdown, ['剪輯清單'])
      for (const item of editItemsForMode(narrationMode.value)) report(checked.some(line => line.includes(item)), `剪輯確認：${item}`)
    }
    if (effectiveGate === 'review') {
      report(existsSync(reviewPath), 'review.md 存在')
      const checked = checkedLines(reviewMarkdown, ['發布前審核清單', '安全審核清單'])
      for (const item of REVIEW_ITEMS) report(checked.some(line => line.includes(item)), `安全確認：${item}`)
      report(unresolvedRisks.length === 0, unresolvedRisks.length ? `仍有 ${unresolvedRisks.length} 個風險詞需要人工確認` : '所有風險詞已人工確認')
    }
    if (requestedGate === 'scheduled' && episode.stage === 'review') {
      report(schedulableDate(episode.publishDate), `publishDate ${episode.publishDate || '(空白)'} 必須是本地今天或未來`)
      note('上傳 YouTube 時請標記 Made for Kids')
    }
    if (effectiveGate === 'scheduled') {
      if (requestedGate === 'published' && episode.stage === 'scheduled') report(dateHasArrived(episode.publishDate), `publishDate ${episode.publishDate || '(空白)'} 已到，可進入 published`)
      else report(schedulableDate(episode.publishDate), `publishDate ${episode.publishDate || '(空白)'} 必須是本地今天或未來`)
      note('上傳 YouTube 時請標記 Made for Kids')
    }
    if (effectiveGate === 'published') note('published 階段請記錄 views、retention、subs 與短回顧')
  }
  return finish()
}

function daysFromToday(dateText) {
  const timestamp = localDateTimestamp(dateText)
  return timestamp === null ? null : Math.round((timestamp - localTodayTimestamp()) / 86_400_000)
}

function compareEpisodeNames(left, right) {
  const leftNumber = Number(left.match(/^EP(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
  const rightNumber = Number(right.match(/^EP(\d+)/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
  return leftNumber - rightNumber || left.localeCompare(right, 'zh-Hant')
}

async function generateStatus(seriesRootInput) {
  const fallbackWorkspace = findWorkspaceRoot(process.cwd())
  const seriesRoot = resolve(seriesRootInput || join(fallbackWorkspace, 'series'))
  workspaceFromSeriesRoot(seriesRoot)
  console.log(`\n更新 STATUS.md：${seriesRoot}\n`)
  report(existsSync(seriesRoot), 'series/ 目錄存在')
  if (!existsSync(seriesRoot)) return finish()
  const sections = ['# Tiny Island Studio 製作狀態', '', `更新日期：${new Date().toLocaleDateString('en-CA')}`, '']
  const seriesDirs = (await readdir(seriesRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  for (const entry of seriesDirs) {
    const seriesDir = join(seriesRoot, entry.name)
    const seriesPath = join(seriesDir, 'series.json')
    if (!existsSync(seriesPath)) { warning(`略過 ${entry.name}：缺少 series.json`); continue }
    const series = await readJson(seriesPath, `${entry.name}/series.json`)
    if (!series) continue
    const cast = []
    const charactersDir = join(seriesDir, 'characters')
    for (const file of existsSync(charactersDir) ? (await readdir(charactersDir)).filter(file => file.endsWith('.md')).sort() : []) {
      const meta = parseFrontmatter(await readUtf8(join(charactersDir, file)))
      cast.push(`${meta.name || basename(file, '.md')} ${meta.approved === true ? '✓ approved' : '○ 待核准'}`)
    }
    sections.push(`## ${series.name || entry.name}`, '', `角色：${cast.length ? cast.join('、') : '尚未建立'}`, '', '| 集數 | 標題 | stage | 發布日 | 距今天數 |', '|---|---|---|---|---:|')
    const episodesDir = join(seriesDir, 'episodes')
    const episodeDirs = existsSync(episodesDir) ? (await readdir(episodesDir, { withFileTypes: true })).filter(item => item.isDirectory()).sort((a, b) => compareEpisodeNames(a.name, b.name)) : []
    for (const episodeEntry of episodeDirs) {
      const path = join(episodesDir, episodeEntry.name, 'episode.json')
      if (!existsSync(path)) { warning(`${entry.name}/${episodeEntry.name} 缺少 episode.json`); continue }
      const episode = await readJson(path, `${episodeEntry.name}/episode.json`)
      if (!episode) continue
      const days = daysFromToday(episode.publishDate)
      let stageDate
      if (episode.stageUpdatedAt && localDateTimestamp(episode.stageUpdatedAt) !== null) stageDate = new Date(localDateTimestamp(episode.stageUpdatedAt))
      else { stageDate = new Date((await stat(path)).mtimeMs); warning(`${episode.code || episodeEntry.name} 缺少 stageUpdatedAt，暫以檔案時間估算停滯天數`) }
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
  report(true, `已更新 ${output}`)
  return finish()
}

function finish() {
  console.log(`\n結果：${failures === 0 ? `通過（${results.length} 項檢查）` : `${failures} 項失敗`}\n`)
  process.exitCode = failures === 0 ? 0 : 1
  return failures === 0
}

if (statusMode) await generateStatus(positional[0])
else if (positional[0]) await validateEpisode(positional[0])
else {
  console.error('用法：node validate.mjs <episodeDir> [--continuity] [--gate <stage>] [--verbose]\n      node validate.mjs --status [seriesDir]')
  process.exitCode = 2
}
