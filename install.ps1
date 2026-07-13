param(
    [string]$HomeDirectory = $HOME
)

$ErrorActionPreference = 'Stop'

$source = (Resolve-Path (Join-Path $PSScriptRoot 'skills\tiny-island-studio')).Path
$targets = @(
    (Join-Path $HomeDirectory '.agents\skills\tiny-island-studio'),
    (Join-Path $HomeDirectory '.codex\skills\tiny-island-studio')
)

foreach ($target in $targets) {
    $parent = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $parent -Force | Out-Null

    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target
        $resolvedTarget = @($item.Target)[0]
        if ($item.LinkType -eq 'Junction' -and $resolvedTarget -eq $source) {
            Write-Host "Already installed: $target"
            continue
        }
        throw "Install path already contains another item; refusing to overwrite: $target"
    }

    New-Item -ItemType Junction -Path $target -Target $source | Out-Null
    Write-Host "Installed: $target -> $source"
}

Write-Host 'Done. Start a new ChatGPT or Codex task to load the skill.'
