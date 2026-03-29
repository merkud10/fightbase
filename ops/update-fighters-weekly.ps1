$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $projectRoot

Write-Host "[FightBase] Refreshing fighters roster and profiles with official UFC and ONE sync..."
cmd /c npm.cmd run content:refresh-fighters-full

if ($LASTEXITCODE -ne 0) {
  throw "Fighter refresh failed with exit code $LASTEXITCODE"
}

Write-Host "[FightBase] Fighter refresh completed successfully."
