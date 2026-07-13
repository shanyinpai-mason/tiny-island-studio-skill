---
name: tiny-island-studio
description: Manage multi-series AI children's animation production with GPT Image 2 stills, approved references, Simplified-Chinese Jimeng prompts, manual video takes, safety gates, dashboards, and git. Use for creating or continuing a series or episode, character sheets, storyboards, 「繼續做動畫」「做 EP05」「開新系列」「設計角色」「核准角色」「改某一鏡」「生成分鏡圖」, safety review, or production status.
---

# Tiny Island Studio

Treat the repository file tree as the only state. Work on one stage at a time. Let the validator, not model judgment, decide whether a stage can advance.

## Locate the workspace

Treat the current ChatGPT/Codex workspace containing `series/` as the project root. If the current workspace has no `series/`, ask the user to open the production workspace or provide its path; never create production data beside the globally installed skill.

- State: `series/`
- Dashboard: `series/STATUS.md`
- Large generated media: `outputs/`
- Validator and schemas: resolve relative to this loaded `SKILL.md`

Never store series data inside the skill folder. Never mix style or cast data across series.

## Route every request

1. Read `series/STATUS.md` when present; otherwise list `series/*/series.json` and each `episodes/*/episode.json`.
2. If the user names a series or episode, select it. If exactly one series exists, enter it directly. If multiple series exist and none is named, ask one short question.
3. If no episode is named, recommend the unpublished episode with the earliest `stage`, breaking ties by nearest `publishDate`.
4. Read the selected `series.json`, `style-bible.md`, approved `characters/*.md`, and episode files needed for the current stage.
5. State the current stage and the single next action. Do not expose unrelated stages unless the user asks.

## Create a series

Read [references/new-series-guide.md](references/new-series-guide.md) before interviewing or creating files.

1. Ask no more than three questions per turn.
2. Run `git rev-parse --is-inside-work-tree` in the confirmed workspace. If it is not a repository, initialize git there before creating production files.
3. Ensure `.gitignore` contains `outputs/**` and `!outputs/.gitkeep`, then create `outputs/.gitkeep`.
4. Create `series/<series-id>/series.json` and `style-bible.md`.
5. Set `series.json.outputRoot` to `outputs/<series-id>` and `requireStoryboardStills` to `true` unless the user explicitly chooses a lighter storyboard workflow.
6. Design 2–4 principal characters through the character workflow.
7. Generate and approve the character stills and cast lineup through the built-in image workflow.
8. Generate the dashboard, then commit with `series: 建立 <名稱> 系列`.

## Design and approve characters

Read the character template in [references/prompts.md](references/prompts.md).

1. Collect name, story role, personality/appearance keywords, and lead color.
2. Read the current style bible and the existing cast's lead colors. Avoid silhouette and lead-color collisions.
3. Generate one object conforming to `schemas/character.schema.json`.
4. Write `characters/<slug>.md` with `approved: false` and at least two short English `anchors` that must appear verbatim in video prompts.
5. Save the turnaround, expression, and pose prompts without displaying them, then directly generate all three images through the built-in image workflow in [references/image-workflow.md](references/image-workflow.md).
6. Show the generated images for visual review. On 「核准 <角色>」, record the approved image paths, set `approved: true`, add the character slug to `series.json.cast`, and commit. Regenerate the lineup image whenever cast membership changes.

Do not approve a character before its required stills exist. Only approved characters and their approved reference images may enter story or storyboard context.

## Advance an episode

Use these stages in order:

`idea → script → storyboard → generate → edit → review → scheduled → published`

| Current stage | Do one thing | Completion rule |
|---|---|---|
| `idea` | Fill `hook`, `learning`, and `emotion` in `episode.json` | All three are non-empty |
| `script` | Generate or edit `story.md` | Non-empty logline, 6–8 beats, and narration |
| `storyboard` | Generate `storyboard.json`, saved prompts, and storyboard stills when required | Schema-valid 12–20 shots, 2–15 seconds each, 90–180 seconds total; prompts synchronized; when `requireStoryboardStills` is not `false`, every storyboard still is generated and user-approved |
| `generate` | Let the user generate each animation take in Jimeng and ingest the files | Every shot has at least one `take-NN.mp4`; user confirms completion; set `generateConfirmed: true` |
| `edit` | Present and record the edit checklist in `review.md` | Every edit checkbox is checked |
| `review` | Present safety findings and record human decisions | Every review checkbox and every risk warning is confirmed |
| `scheduled` | Confirm the release date and Made for Kids setting | Valid scheduling or publication date |
| `published` | Record `views`, `retention`, and `subs`; write a short retrospective | No further gate |

Before changing `stage`, run:

```powershell
node <skill-dir>/scripts/validate.mjs <episode-directory> --gate <target-stage>
```

The validator maps the immediately following target to the current stage's completion rules. Passing the current stage name directly validates that stage. Change `stage` and update `stageUpdatedAt` only after exit code 0.

When targeting `scheduled`, require a `publishDate` of local today or later. When targeting `published`, require that the scheduled date has arrived and remind the user to mark the upload Made for Kids.

## Generate the script

Read the corresponding template in [references/prompts.md](references/prompts.md) and the applicable schema.

1. Inject the complete style bible.
2. Inject `name` and `視覺聖經` only for approved characters selected for the episode.
3. Generate one JSON object without a Markdown fence.
4. Validate against `schemas/story.schema.json`, then write only `story.md`. Do not create `storyboard.json` or shot prompt files during the script stage.
5. If validation fails, repair and retry at most twice. Report the blocker after the second failure.
6. Run the validator, then commit with `<EP>: script 完成`.

## Generate the storyboard

1. Read the approved `story.md`, style bible, and approved character cards.
2. Generate and validate one JSON object against `schemas/storyboard.schema.json`.
3. Write a Simplified-Chinese `jimengPrompt` for each shot. Keep English character anchors and required negative phrases verbatim. Keep legacy `seedancePrompt` readable, but never emit both fields in one shot.
4. Keep each shot's `jimengPrompt` or legacy `seedancePrompt` byte-for-byte equal to `prompts/shot-NN.txt` after trimming surrounding whitespace.
5. Save one static-image prompt per shot under `image-prompts/storyboard/`. When `series.json.requireStoryboardStills` is not `false`, directly generate the stills and save them under the matching `outputs/` path. Never paste static-image prompts into chat unless the user asks.
6. Run the validator, then commit with `<EP>: storyboard 完成` or `<EP>: 重新生成分鏡`.

Before regenerating any episode file, run `git status --short -- <episode-directory>`. If that episode has uncommitted changes, first commit them with `<EP>: 保存手動編修`. Do not ask for another confirmation before regeneration after this safeguard. Afterward, say that the previous version remains available in git.

## Generate static images

Read [references/image-workflow.md](references/image-workflow.md) for every static image, including style frames, character sheets, lineups, locations, props, storyboard panels, keyframes, and thumbnails.

1. Save the final prompt to the prescribed `image-prompts/` path before generation.
2. Invoke the built-in `$imagegen` / `image_gen` capability immediately; do not show the prompt or request a separate generation confirmation.
3. Use one image-generation call per asset. Use approved character images as references whenever characters appear.
4. Move or copy the selected result into the prescribed workspace `outputs/` path and inspect it there.
5. Show the generated image, not its prompt, for human approval. Apply revisions non-destructively with the next version number.
6. If built-in image generation is unavailable, stop and report that limitation. Do not silently switch to an API-key CLI workflow or another image model.

## Generate animation takes manually

1. Write each Jimeng prompt in Simplified Chinese with English character anchors and negative phrases left verbatim.
   Use Simplified Chinese as a practical default because Jimeng's first-party interface and prompt documentation use it; do not claim that Traditional Chinese is unsupported or inherently worse.
2. Do not generate video inside Codex. Tell the user which `prompts/shot-NN.txt` to paste into Jimeng and which approved storyboard or keyframe image to attach.
3. Ask the user to place each returned video at `outputs/<series-id>/<episode-folder>/shots/shot-NN/take-NN.mp4`.
4. Detect files already placed there, list missing shots, and never overwrite a take. After the user selects a take, record its relative path in the episode notes.

## Store generated media

Keep text state and prompts under `series/` in git. Keep large images, audio, video takes, editor projects, and final renders under the git-ignored `outputs/` tree:

```text
outputs/<series-id>/<episode-folder>/
├── shots/shot-01/take-01.mp4
├── images/storyboard/shot-01-v001.png
├── images/keyframes/
├── images/thumbnail/
├── audio/
├── project/
└── final/<episode-code>-<short-title>-v001.mp4
```

Store shared series images under `outputs/<series-id>/shared/images/`. Mirror the exact series ID and episode folder used under `series/`. Use two-digit shot and take numbers. Increment `v001`, `v002`, and so on; never overwrite an image, take, or final render. Store relative media paths in text state when approving an asset or take.

## Make local changes

For requests such as 「第 7 鏡太刺激」 or 「旁白第二段改短」:

1. Edit only the relevant `story.md`, shot object, and matching prompt file.
2. Never regenerate unrelated shots or the whole story.
3. Run the validator without advancing the stage.
4. Commit the focused change.

## Handle safety review

Read [references/safety.md](references/safety.md) when editing `review.md`, interpreting warnings, or preparing publication.

- Treat risk-term matches as warnings requiring human judgment, not automatic rejection.
- Explain the stored reason for each warning.
- Record an accepted warning as `- [x] 已人工確認 <location> <term> — <reason for acceptance>`.
- Never mark a human checkbox on the user's behalf. Ask for the decision.

## Import the retired GUI state

When the user has browser localStorage data, instruct them to export the `tis-v2-*` keys with the one-line command in the importer help, save the JSON, then run:

```powershell
node <skill-dir>/scripts/import-localstorage.mjs <export.json> --series <series-id>
```

Review imported character anchors and validation failures before committing. Use `--force` only after showing what existing files would be replaced.

## End every session

1. Run `node <skill-dir>/scripts/validate.mjs --status <workspace>/series`.
2. Review `series/STATUS.md` for overdue or stalled work.
3. Commit the dashboard together with the session's final coherent change if it changed.
4. Report the selected series/episode, current stage, files changed, validation result, commit hash, and one recommended next action.
