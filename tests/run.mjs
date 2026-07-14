#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const validateScript = join(repoRoot, 'skills', 'tiny-island-studio', 'scripts', 'validate.mjs')
const importScript = join(repoRoot, 'skills', 'tiny-island-studio', 'scripts', 'import-localstorage.mjs')
const riskPrompts = JSON.parse(await readFile(join(repoRoot, 'tests', 'fixtures', 'risk-prompts.json'), 'utf8'))
const root = await mkdtemp(join(tmpdir(), 'tiny-island-tests-'))
let passed = 0
let failed = 0

function assert(ok, message, detail = '') {
  if (ok) {
    passed += 1
    console.log(`✓ ${message}`)
  } else {
    failed += 1
    console.error(`✗ ${message}${detail ? `\n${detail}` : ''}`)
  }
}

async function write(path, content, bom = false) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${bom ? '\uFEFF' : ''}${content}`, 'utf8')
}

function runNode(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
  })
  return { code: result.status, output: `${result.stdout || ''}${result.stderr || ''}` }
}

function today() {
  return new Date().toLocaleDateString('en-CA')
}

function episodeData(overrides = {}) {
  return {
    code: 'EP01', title: '測試集', subtitle: '', stage: 'storyboard', stageUpdatedAt: today(),
    format: '主影片', publishDate: today(), hook: '問題出現', learning: '合作', emotion: '安心',
    storyboardImagesApproved: false, generateConfirmed: false, ...overrides,
  }
}

function storyMarkdown(extra = '') {
  return `# 測試集

## Logline

Lumi 和朋友一起解決小問題。${extra}

## 故事節奏

1. 發現問題
2. 停下來
3. 仔細觀察
4. 一起思考
5. 嘗試方法
6. 合作完成

## 完整旁白

Lumi 溫柔地邀請朋友合作。`
}

function modeStoryMarkdown(mode, script, extra = '') {
  const heading = mode === 'nonverbal' ? '動作與聲音腳本' : '完整旁白'
  return `---
narrationMode: ${mode}
---

# 測試集

## Logline

Lumi 和朋友一起解決小問題。${extra}

## 故事節奏

1. 發現問題
2. 停下來
3. 仔細觀察
4. 一起思考
5. 嘗試方法
6. 合作完成

## ${heading}

${script}`
}

function prompt(extra = '') {
  return `温柔儿童动画，Lumi 轻轻观察，blue crescent badge，round amber boots，固定柔光。${extra} no text, no watermark, no extra limbs, no existing IP`
}

function storyboard(extraPrompt = '', sound = '柔和環境音') {
  const shots = Array.from({ length: 12 }, (_, index) => ({
    no: index + 1,
    duration: 8,
    description: `Lumi 完成第 ${index + 1} 個安全動作。`,
    jimengPrompt: prompt(index === 0 ? extraPrompt : ''),
    sound,
  }))
  return { totalDuration: 96, directorNote: '低刺激、固定鏡頭。', shots }
}

async function createWorkspace(name, options = {}) {
  const workspace = join(root, name)
  const seriesDir = join(workspace, 'series', 'test-series')
  const episodeDir = join(seriesDir, 'episodes', 'EP01-test')
  const board = storyboard(options.extraPrompt || '', options.sound ?? '柔和環境音')
  const series = {
    id: 'test-series', name: '測試系列', targetAge: '3-7', format: '主影片', cadence: '每週',
    outputRoot: 'outputs/test-series', requireStoryboardStills: options.requireStoryboardStills ?? false,
    cast: ['lumi'], createdAt: today(),
    ...(options.seriesNarrationMode ? { narrationMode: options.seriesNarrationMode } : {}),
  }
  await write(join(seriesDir, 'series.json'), JSON.stringify(series, null, 2))
  const character = `---
name: Lumi
role: 主角
approved: true
leadColor: "#88aadd"
anchors: ${JSON.stringify(options.anchors || ['blue crescent badge', 'round amber boots'])}
---

## 視覺聖經

溫柔的原創角色。`
  await write(join(seriesDir, 'characters', 'lumi.md'), character, options.bom === true)
  await write(join(episodeDir, 'episode.json'), JSON.stringify(episodeData(options.episode || {}), null, 2), options.bom === true)
  await write(join(episodeDir, 'story.md'), options.storyContent ?? storyMarkdown(options.storyExtra || ''))
  if (options.withStoryboard !== false) {
    await write(join(episodeDir, 'storyboard.json'), JSON.stringify(board, null, 2))
    for (const shot of board.shots) {
      const stem = `shot-${String(shot.no).padStart(2, '0')}`
      await write(join(episodeDir, 'prompts', `${stem}.txt`), shot.jimengPrompt)
      if (options.createStills === true) {
        await write(join(episodeDir, 'image-prompts', 'storyboard', `${stem}-v001.txt`), 'saved static image prompt')
        await write(join(workspace, 'outputs', 'test-series', basename(episodeDir), 'images', 'storyboard', `${stem}-v001.png`), 'fake png fixture')
      }
    }
  }
  return { workspace, seriesDir, episodeDir }
}

try {
  const clean = await createWorkspace('clean')
  let result = runNode(validateScript, [clean.episodeDir, '--gate', 'storyboard'])
  assert(result.code === 0, '完整分鏡 fixture 通過，且 requireStoryboardStills=false 可略過靜態圖', result.output)

  const danger = await createWorkspace('danger', { extraPrompt: riskPrompts.simplifiedDanger })
  result = runNode(validateScript, [danger.episodeDir, '--gate', 'storyboard'])
  for (const term of ['触电', '枪', '马路', '插座']) assert(result.output.includes(`風險詞「${term}」`), `簡體風險詞 ${term} 可命中`, result.output)

  const firefly = await createWorkspace('firefly', { extraPrompt: riskPrompts.safeFirefly })
  result = runNode(validateScript, [firefly.episodeDir, '--gate', 'storyboard'])
  assert(!result.output.includes('風險詞「火」'), '萤火虫不會誤報「火」', result.output)

  const campfire = await createWorkspace('campfire', { extraPrompt: riskPrompts.unsafeCampfire })
  result = runNode(validateScript, [campfire.episodeDir, '--gate', 'storyboard'])
  assert(result.output.includes('風險詞「火」'), '营火仍會觸發「火」警告', result.output)

  const bom = await createWorkspace('bom', { bom: true })
  result = runNode(validateScript, [bom.episodeDir, '--gate', 'storyboard'])
  assert(result.code === 0 && !result.output.includes('不是有效 JSON') && result.output.includes('至少需要一位 approved 角色'), 'BOM episode.json 與角色卡可正常解析', result.output)

  const strictStills = await createWorkspace('strict-stills', { requireStoryboardStills: true, createStills: true, episode: { storyboardImagesApproved: true } })
  const unrelatedCwd = join(root, 'unrelated-cwd')
  await mkdir(unrelatedCwd, { recursive: true })
  result = runNode(validateScript, [strictStills.episodeDir, '--gate', 'storyboard'], { cwd: unrelatedCwd })
  assert(result.code === 0, '從任意 cwd 驗證絕對 episode 路徑時可找到正確 workspace', result.output)

  const invalidAnchors = await createWorkspace('invalid-anchors', { anchors: ['Lumi'] })
  result = runNode(validateScript, [invalidAnchors.episodeDir, '--gate', 'storyboard'])
  assert(result.code !== 0 && result.output.includes('至少要有兩個有效 anchors'), 'anchors 必須至少兩個且不可等於角色名稱', result.output)

  const scriptOnly = await createWorkspace('script-only', { withStoryboard: false, episode: { stage: 'script' } })
  result = runNode(validateScript, [scriptOnly.episodeDir, '--gate', 'script'])
  assert(result.code === 0, '舊版無 frontmatter spoken story 通過，且不受缺少 storyboard.json 影響', result.output)

  const spoken = await createWorkspace('spoken', {
    withStoryboard: false,
    episode: { stage: 'script', narrationMode: 'spoken' },
    storyContent: modeStoryMarkdown('spoken', 'Lumi 溫柔地邀請朋友合作。'),
  })
  result = runNode(validateScript, [spoken.episodeDir, '--gate', 'script'])
  assert(result.code === 0, '新版 spoken story 有非空完整旁白時通過 Script gate', result.output)

  const spokenMissing = await createWorkspace('spoken-missing', {
    withStoryboard: false,
    episode: { stage: 'script', narrationMode: 'spoken' },
    storyContent: modeStoryMarkdown('spoken', ''),
  })
  result = runNode(validateScript, [spokenMissing.episodeDir, '--gate', 'script'])
  assert(result.code !== 0 && result.output.includes('story.md 有完整旁白'), 'spoken 缺少完整旁白時 Script gate 失敗', result.output)

  const nonverbal = await createWorkspace('nonverbal', {
    withStoryboard: false,
    episode: { stage: 'script', narrationMode: 'nonverbal' },
    storyContent: modeStoryMarkdown('nonverbal', 'Lumi 看向歪掉的積木，低聲「hmm」；音樂停下，留兩秒思考。最後響起 Pom–Pi–Ko–Fix!'),
  })
  result = runNode(validateScript, [nonverbal.episodeDir, '--gate', 'script'])
  assert(result.code === 0, '新版 nonverbal story 有動作與聲音腳本且無旁白時通過 Script gate', result.output)

  const nonverbalMissing = await createWorkspace('nonverbal-missing', {
    withStoryboard: false,
    episode: { stage: 'script', narrationMode: 'nonverbal' },
    storyContent: modeStoryMarkdown('nonverbal', ''),
  })
  result = runNode(validateScript, [nonverbalMissing.episodeDir, '--gate', 'script'])
  assert(result.code !== 0 && result.output.includes('story.md 有動作與聲音腳本'), 'nonverbal 缺少動作與聲音腳本時 Script gate 失敗', result.output)

  const seriesNonverbal = await createWorkspace('series-nonverbal', {
    withStoryboard: false,
    seriesNarrationMode: 'nonverbal',
    episode: { stage: 'script' },
    storyContent: modeStoryMarkdown('nonverbal', 'Lumi 指向答案，朋友回以「oh」；柔和音樂轉亮。'),
  })
  result = runNode(validateScript, [seriesNonverbal.episodeDir, '--gate', 'script'])
  assert(result.code === 0 && result.output.includes('來源：series.json'), 'series narrationMode 在 episode 未設定時生效', result.output)

  const episodeOverride = await createWorkspace('episode-override', {
    withStoryboard: false,
    seriesNarrationMode: 'nonverbal',
    episode: { stage: 'script', narrationMode: 'spoken' },
    storyContent: modeStoryMarkdown('spoken', 'Episode 層級恢復完整繁體中文旁白。'),
  })
  result = runNode(validateScript, [episodeOverride.episodeDir, '--gate', 'script'])
  assert(result.code === 0 && result.output.includes('來源：episode.json'), 'episode narrationMode 優先於 series', result.output)

  const nonverbalRisk = await createWorkspace('nonverbal-risk', {
    withStoryboard: false,
    episode: { stage: 'script', narrationMode: 'nonverbal' },
    storyContent: modeStoryMarkdown('nonverbal', 'Lumi 指向插座並發出「uh-oh」，音樂停止。'),
  })
  result = runNode(validateScript, [nonverbalRisk.episodeDir, '--gate', 'script'])
  assert(result.output.includes('動作與聲音腳本') && result.output.includes('風險詞「插座」'), '風險詞掃描涵蓋 audioActionScript', result.output)

  const nonverbalEmptySound = await createWorkspace('nonverbal-empty-sound', {
    episode: { narrationMode: 'nonverbal' },
    storyContent: modeStoryMarkdown('nonverbal', 'Lumi 觀察並比出答案，朋友點頭。'),
    sound: '',
  })
  result = runNode(validateScript, [nonverbalEmptySound.episodeDir, '--gate', 'storyboard'])
  assert(result.code !== 0 && result.output.includes('nonverbal sound 必須描述'), 'nonverbal storyboard 每鏡 sound 不可空白', result.output)

  result = runNode(validateScript, ['--status', join(clean.workspace, 'series')])
  const statusMarkdown = await readFile(join(clean.workspace, 'series', 'STATUS.md'), 'utf8')
  assert(result.code === 0 && statusMarkdown.includes('Tiny Island Studio 製作狀態') && statusMarkdown.includes('EP01'), '--status 仍可更新 dashboard', result.output)

  const schedule = await createWorkspace('schedule', { episode: { stage: 'scheduled', publishDate: today() } })
  result = runNode(validateScript, [schedule.episodeDir, '--gate', 'scheduled'])
  assert(result.code === 0 && result.output.includes('本地今天或未來'), 'scheduled gate 接受本地今天', result.output)

  const allowlisted = await createWorkspace('allowlist', { extraPrompt: '萤火虫和消防车安全地停在展示区。' })
  await write(join(allowlisted.seriesDir, 'safety-allowlist.json'), JSON.stringify([{ term: '火', context: '消防车' }], null, 2))
  result = runNode(validateScript, [allowlisted.episodeDir, '--gate', 'storyboard'])
  assert(!result.output.includes('風險詞「火」'), '系列 safety allowlist 可按詞與上下文消除已裁決誤報', result.output)

  const importWorkspace = join(root, 'import')
  const importSeriesDir = join(importWorkspace, 'series', 'existing')
  await write(join(importSeriesDir, 'series.json'), `\uFEFF${JSON.stringify({
    id: 'existing', name: '既有系列', cadence: '每週六', customField: '保留我', cast: ['old'],
  }, null, 2)}`)
  const exportPath = join(importWorkspace, 'export.json')
  await write(exportPath, `\uFEFF${JSON.stringify({
    'tis-v2-episodes': '[]',
    'tis-v2-assets': JSON.stringify([{ kind: '角色', name: 'Nova', approved: true, design: { anchors: ['silver leaf cape', 'three dot satchel'] } }]),
  }, null, 2)}`)
  result = runNode(importScript, [exportPath, '--series', 'existing'], { env: { TINY_ISLAND_WORKSPACE: importWorkspace } })
  const merged = JSON.parse((await readFile(join(importSeriesDir, 'series.json'), 'utf8')).replace(/^\uFEFF/, ''))
  assert(result.code === 0 && merged.cast.includes('nova') && merged.cadence === '每週六' && merged.customField === '保留我', '既有系列匯入會合併 cast 並保留人工欄位', result.output)
  const importedCard = await readFile(join(importSeriesDir, 'characters', 'nova.md'), 'utf8')
  assert(importedCard.includes('approved: true') && importedCard.includes('silver leaf cape'), '匯入的有效 anchors 可直接保留', importedCard)

  const todoWorkspace = join(root, 'import-todo')
  const todoExport = join(todoWorkspace, 'export.json')
  await write(todoExport, JSON.stringify({ 'tis-v2-episodes': [], 'tis-v2-assets': [{ kind: '角色', name: 'Mika', approved: true }] }))
  result = runNode(importScript, [todoExport, '--series', 'todo'], { env: { TINY_ISLAND_WORKSPACE: todoWorkspace } })
  const todoCard = await readFile(join(todoWorkspace, 'series', 'todo', 'characters', 'mika.md'), 'utf8')
  const todoSeries = JSON.parse(await readFile(join(todoWorkspace, 'series', 'todo', 'series.json'), 'utf8'))
  assert(todoCard.includes('approved: false') && todoCard.includes('anchorStatus: needs-review') && todoCard.includes('TODO-visual-anchor-1') && !todoSeries.cast.includes('mika'), '缺少 anchors 的匯入角色會醒目標記、保持未核准且不加入 cast', result.output)

  const importNonverbalWorkspace = join(root, 'import-nonverbal')
  const importNonverbalExport = join(importNonverbalWorkspace, 'export.json')
  await write(importNonverbalExport, JSON.stringify({
    'tis-v2-episodes': [{
      code: 'EP02', title: '無語言測試', narrationMode: 'nonverbal',
      story: { logline: '用動作合作。', storyBeats: ['一', '二', '三', '四', '五', '六'], audioActionScript: '互看後點頭，響起 Pom–Pi–Ko–Fix!' },
    }],
    'tis-v2-assets': [],
  }))
  result = runNode(importScript, [importNonverbalExport, '--series', 'nv'], { env: { TINY_ISLAND_WORKSPACE: importNonverbalWorkspace } })
  const importedEpisodeDir = join(importNonverbalWorkspace, 'series', 'nv', 'episodes', 'EP02-無語言測試')
  const importedEpisode = JSON.parse(await readFile(join(importedEpisodeDir, 'episode.json'), 'utf8'))
  const importedStory = await readFile(join(importedEpisodeDir, 'story.md'), 'utf8')
  assert(result.code === 0 && importedEpisode.narrationMode === 'nonverbal' && importedStory.includes('narrationMode: nonverbal') && importedStory.includes('## 動作與聲音腳本') && !importedStory.includes('## 完整旁白'), 'importer 保留 nonverbal 模式並輸出新 story.md 規格', result.output)
} finally {
  if (process.env.KEEP_TINY_ISLAND_TESTS !== '1' && existsSync(root)) await rm(root, { recursive: true, force: true })
}

console.log(`\n測試結果：${passed} 通過，${failed} 失敗`)
if (failed > 0) process.exitCode = 1
