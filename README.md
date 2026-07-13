# Tiny Island Studio Skill

Tiny Island Studio 是供 ChatGPT Work／Codex 使用的檔案導向兒童動畫製作 Skill。

- 使用內建 GPT Image 2 直接生成角色定裝照、lineup、storyboard、keyframe、縮圖等靜態圖片。
- 靜態圖片提示詞只保存到專案檔案，不在對話中展開。
- 逐鏡產生簡體中文即夢提示詞，由創作者在即夢手動生成動畫。
- 使用角色 anchors、安全審核、人工核准與硬性關卡維持系列一致性。

這個 repo 只存放 Skill，不包含任何系列作品、生成圖片或影片。

## 建議安裝：clone 後一鍵連結

這種安裝方式可同時供 ChatGPT Work 與 Codex 使用；之後執行 `git pull` 即可更新 Skill。

### Windows

```powershell
git clone https://github.com/shanyinpai-mason/tiny-island-studio-skill.git
Set-Location .\tiny-island-studio-skill
.\install.ps1
```

安裝位置：

```text
%USERPROFILE%\.agents\skills\tiny-island-studio
%USERPROFILE%\.codex\skills\tiny-island-studio
```

### macOS／Linux

```bash
git clone https://github.com/shanyinpai-mason/tiny-island-studio-skill.git
cd tiny-island-studio-skill
./install.sh
```

安裝位置：

```text
~/.agents/skills/tiny-island-studio
~/.codex/skills/tiny-island-studio
```

如果目的地已有其他同名檔案或 Skill，安裝器會停止，不會覆蓋。

## 只安裝到 Codex

已安裝 Codex 系統 Skill 的電腦，也可以使用官方 `skill-installer`：

### Windows PowerShell

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" `
  --repo shanyinpai-mason/tiny-island-studio-skill `
  --path skills/tiny-island-studio
```

### macOS／Linux

```bash
python "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo shanyinpai-mason/tiny-island-studio-skill \
  --path skills/tiny-island-studio
```

這個方式只安裝到 `~/.codex/skills/`。若同時需要 ChatGPT Work，使用前面的 clone＋安裝器方式。

## 準備作品工作區

Skill 與作品資料分離。請在另一個專案資料夾建立：

```text
my-animation-project/
├── series/
└── outputs/
```

把這個資料夾開成 ChatGPT／Codex workspace，然後輸入：

```text
$tiny-island-studio 開一個新系列
```

文字狀態與提示詞放在 `series/`；大型圖片、動畫與完成影片放在 `outputs/`。建議把 `series/` 納入 Git，並將 `outputs/` 排除後另行備份。

## 需求

- ChatGPT Work 或 Codex，並具備 Skills 與內建 image generation 能力。
- Node.js 18 以上，用於工作流驗證器。
- 即夢帳號，用於手動生成動畫鏡頭。

## 驗證 Skill

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" .\skills\tiny-island-studio
node --check .\skills\tiny-island-studio\scripts\validate.mjs
node --check .\skills\tiny-island-studio\scripts\import-localstorage.mjs
```
