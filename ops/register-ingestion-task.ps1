$TaskName = "FightBaseIngestion"
$ProjectDir = "C:\Users\merku\OneDrive\Рабочий стол\Проекты\Сайт ММА"
$NodePath = "C:\Program Files\nodejs\node.exe"
$ScriptPath = Join-Path $ProjectDir "scripts\trigger-ingest-cron.js"
$BaseUrl = "http://localhost:3000"
$Secret = $env:INGEST_CRON_SECRET

if (-not $Secret) {
  throw "Set INGEST_CRON_SECRET in the environment before registering the scheduled task."
}

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$ScriptPath`" --base-url $BaseUrl --secret $Secret" -WorkingDirectory $ProjectDir
$Trigger = New-ScheduledTaskTrigger -Daily -At 09:00

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "FightBase scheduled ingestion trigger"
