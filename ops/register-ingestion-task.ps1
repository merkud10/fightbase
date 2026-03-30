$TaskName = "FightBaseIngestion"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$NodePath = "C:\Program Files\nodejs\node.exe"
$ScriptPath = Join-Path $ProjectDir "scripts\trigger-ingest-cron.js"
$BaseUrl = "http://localhost:3000"
$Secret = $env:INGEST_CRON_SECRET
$Job = if ($env:INGEST_CRON_JOB) { $env:INGEST_CRON_JOB } else { "ai-discovery" }
$LookbackHours = if ($env:AI_DISCOVERY_LOOKBACK_HOURS) { $env:AI_DISCOVERY_LOOKBACK_HOURS } else { "8" }
$ItemLimit = if ($env:AI_DISCOVERY_ITEM_LIMIT) { $env:AI_DISCOVERY_ITEM_LIMIT } else { "8" }
$ArticleStatus = if ($env:AI_DISCOVERY_STATUS) { $env:AI_DISCOVERY_STATUS } else { "published" }

if (-not $Secret) {
  throw "Set INGEST_CRON_SECRET in the environment before registering the scheduled task."
}

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$ScriptPath`" --base-url $BaseUrl --secret $Secret --job $Job --lookback-hours $LookbackHours --limit $ItemLimit --status $ArticleStatus" -WorkingDirectory $ProjectDir
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 9999)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "FightBase scheduled ingestion trigger" -Force
