#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_path="$repo_root/skills/tiny-island-studio"
home_dir="${TINY_ISLAND_HOME:-$HOME}"
targets=(
  "$home_dir/.agents/skills/tiny-island-studio"
  "$home_dir/.codex/skills/tiny-island-studio"
)

for target in "${targets[@]}"; do
  mkdir -p "$(dirname "$target")"

  if [[ -L "$target" && "$(readlink "$target")" == "$source_path" ]]; then
    echo "Already installed: $target"
    continue
  fi

  if [[ -e "$target" || -L "$target" ]]; then
    echo "Install path already contains another item; refusing to overwrite: $target" >&2
    exit 1
  fi

  ln -s "$source_path" "$target"
  echo "Installed: $target -> $source_path"
done

echo 'Done. Start a new ChatGPT or Codex task to load the skill.'
