#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)
const skillDir = resolve(dirname(scriptFile), '..')
const workspaceRoot = resolve(process.env.TINY_ISLAND_WORKSPACE || process.cwd())
const seriesRoot = process.env.TINY_ISLAND_SERIES_ROOT ? resolve(process.env.TINY_ISLAND_SERIES_ROOT) : join(workspaceRoot, 'series')
const args = process.argv.slice(2)
const inputPath = args.find(arg => !arg.startsWith('--'))
const force = args.includes('--force')
const seriesIndex = args.indexOf('--series')
const seriesId = seriesIndex >= 0 ? args[seriesIndex + 1] : 'tiny-island'

const editItems = [
  '每個鏡頭只有一個清楚動作',
  '旁白與畫面同步',
  '前 3 秒問題清楚',
  '音效不突然、不過度刺激',
  '片尾保留合作成功的情緒落點',
]
const reviewItems = [
  '沒有危險模仿行為',
  '沒有現有角色或品牌元素',
  '角色顏色、比例、服裝一致',
  '沒有多餘肢體、亂碼或水印',
  '標題與縮圖沒有誤導兒童',
  '無快速閃爍或頻閃畫面（每秒不超過 3 次亮度變化）',
  '音量平穩，無突發巨響（目標 -14 LUFS）',
  '內容適合最低年齡 3 歲觀看（無恐懼、無威脅性角色）',
]

function usage() {
  console.error('用法：node import-localstorage.mjs <export.json> [--series tiny-island] [--force]')
  console.error('瀏覽器 Console 匯出：')
  console.error("copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('tis-v2-')).map(k => [k, localStorage.getItem(k)])), null, 2))")
}

function unpack(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function slug(value, fallback = 'item') {
  const ascii = String(value).match(/[A-Za-z][A-Za-z0-9_-]*/g)?.at(-1)
  const source = ascii || String(value)
  const normalized = source.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return normalized || fallback
}

function safeFolder(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/[. ]+$/g, '').trim()
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''))
}

async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true })
  if (!force && existsSync(path)) {
    console.log(`略過既有檔案：${path}`)
    return false
  }
  await writeFile(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  console.log(`寫入：${path}`)
  return true
}

function reviewMarkdown(episode) {
  const editChecks = new Set(Array.isArray(episode.editChecks) ? episode.editChecks : [])
  const safetyChecks = new Set(Array.isArray(episode.reviewChecks) ? episode.reviewChecks : [])
  const lines = [`# ${episode.code} 剪輯與安全審核`, '', '## 剪輯清單', '']
  for (const item of editItems) lines.push(`- [${editChecks.has(item) ? 'x' : ' '}] ${item}`)
  lines.push('', '## 審核清單', '')
  for (const item of reviewItems) lines.push(`- [${safetyChecks.has(item) ? 'x' : ' '}] ${item}`)
  lines.push('', '## 風險詞人工確認', '', '尚未掃描。', '')
  return lines.join('\n')
}

function storyMarkdown(episode) {
  const story = episode.story
  if (!story || typeof story !== 'object') return null
  const beats = Array.isArray(story.beats) ? story.beats : []
  return [
    `# ${episode.title}`,
    '',
    '## Logline',
    '',
    story.logline || '',
    '',
    '## 故事節奏',
    '',
    ...beats.map((beat, index) => `${index + 1}. ${beat}`),
    '',
    '## 完整旁白',
    '',
    story.narration || '',
    '',
  ].join('\n')
}

function characterMarkdown(asset, characterSlug) {
  const design = asset.design || {}
  const englishName = String(asset.name || '').match(/[A-Za-z][A-Za-z0-9_-]*/g)?.at(-1)
  const defaultAnchor = englishName || asset.name || characterSlug
  const visualBible = design.visualBible || asset.note || '請補上固定外觀、比例、材質與識別特徵。'
  const generic = `Original child-safe clay-toy character design of ${asset.name || characterSlug}, ${visualBible}`
  return [
    '---',
    `name: ${asset.name || characterSlug}`,
    `role: ${design.role || '待補角色定位'}`,
    `approved: ${asset.approved === true}`,
    `leadColor: ${yamlString(asset.color || '#7d9a88')}`,
    `anchors: ${JSON.stringify([defaultAnchor])}`,
    '---',
    '',
    '## 個性',
    '',
    design.personality || asset.note || '待補',
    '',
    '## 視覺聖經',
    '',
    visualBible,
    '',
    '## 定裝照提示詞',
    '',
    '### 四面轉身',
    '',
    design.turnaroundPrompt || `${generic}. Front, three-quarter, side and back views, light gray background, soft studio light, consistent proportions.`,
    '',
    '### 表情',
    '',
    design.expressionPrompt || `${generic}. Six friendly expressions, identical colors and proportions.`,
    '',
    '### 八姿勢',
    '',
    design.posePrompt || `${generic}. Standing, walking, observing, happy, worried, thinking, cooperating and celebrating.`,
    '',
    '### 負面提示詞',
    '',
    design.negativePrompt || 'no text, no watermark, no extra limbs, no existing IP, no photorealism',
    '',
  ].join('\n')
}

async function main() {
  if (!inputPath || seriesIndex >= 0 && !seriesId) {
    usage()
    process.exitCode = 2
    return
  }
  const absoluteInput = resolve(inputPath)
  let exported
  try {
    exported = JSON.parse(await readFile(absoluteInput, 'utf8'))
  } catch (error) {
    console.error(`無法讀取匯出檔：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
  const episodes = unpack(exported['tis-v2-episodes'] ?? exported.episodes, [])
  const assets = unpack(exported['tis-v2-assets'] ?? exported.assets, [])
  if (!Array.isArray(episodes) || !Array.isArray(assets)) {
    console.error('匯出檔需要 tis-v2-episodes 與 tis-v2-assets 陣列或 JSON 字串。')
    process.exitCode = 1
    return
  }

  const seriesDir = join(seriesRoot, seriesId)
  const seriesPath = join(seriesDir, 'series.json')
  const existingSeries = existsSync(seriesPath) ? JSON.parse(await readFile(seriesPath, 'utf8')) : {
    id: seriesId,
    name: seriesId,
    targetAge: '3-7',
    format: '主影片',
    cadence: '待設定',
    cast: [],
    createdAt: new Date().toISOString().slice(0, 10),
  }
  const cast = new Set(Array.isArray(existingSeries.cast) ? existingSeries.cast : [])
  for (const asset of assets.filter(item => item?.kind === '角色')) {
    const characterSlug = slug(asset.name, asset.id || 'character')
    cast.add(characterSlug)
    await writeText(join(seriesDir, 'characters', `${characterSlug}.md`), characterMarkdown(asset, characterSlug))
  }
  existingSeries.cast = [...cast]
  await writeText(seriesPath, `${JSON.stringify(existingSeries, null, 2)}\n`)

  for (const source of episodes) {
    if (!source || typeof source !== 'object') continue
    const code = /^EP\d+$/i.test(source.code || '') ? source.code.toUpperCase() : `EP${String(Date.now()).slice(-4)}`
    const folder = safeFolder(`${code}-${source.title || '未命名'}`)
    const episodeDir = join(seriesDir, 'episodes', folder)
    const episode = {
      code,
      title: source.title || '未命名',
      subtitle: source.subtitle || '',
      stage: source.stage || 'idea',
      stageUpdatedAt: new Date().toISOString().slice(0, 10),
      format: source.format || '主影片',
      publishDate: source.publishDate || '',
      hook: source.hook || '',
      learning: source.learning || '',
      emotion: source.emotion || '',
      storyboardImagesApproved: false,
      generateConfirmed: false,
    }
    if (source.generateConfirmed === true) episode.generateConfirmed = true
    await writeText(join(episodeDir, 'episode.json'), `${JSON.stringify(episode, null, 2)}\n`)
    const story = storyMarkdown(source)
    if (story) await writeText(join(episodeDir, 'story.md'), story)
    const shots = Array.isArray(source.shots) ? source.shots.map((shot, index) => ({
      no: index + 1,
      duration: Number.isInteger(shot.duration) ? shot.duration : 2,
      description: shot.description || '',
      seedancePrompt: shot.seedancePrompt || shot.prompt || '',
      sound: shot.sound || '',
    })) : []
    if (shots.length) {
      const storyboard = {
        totalDuration: shots.reduce((sum, shot) => sum + shot.duration, 0),
        directorNote: '從 Tiny Island Studio GUI localStorage 匯入；請由 agent 複查鏡頭節奏與安全。',
        shots,
      }
      await writeText(join(episodeDir, 'storyboard.json'), `${JSON.stringify(storyboard, null, 2)}\n`)
      for (const shot of shots) {
        await writeText(join(episodeDir, 'prompts', `shot-${String(shot.no).padStart(2, '0')}.txt`), shot.seedancePrompt)
      }
    }
    await writeText(join(episodeDir, 'review.md'), reviewMarkdown(source))
  }

  console.log(`\n匯入完成：${episodes.length} 集、${assets.length} 筆素材。`)
  console.log('請檢查新角色的 anchors，接著執行：')
  console.log(`node "${join(skillDir, 'scripts', 'validate.mjs')}" --status`)
  console.log('確認 diff 後再建立 git commit。')
}

await main()
