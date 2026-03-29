$TaskName = "FightBaseWeeklyFighterRefresh"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$CommandPath = Join-Path $ProjectDir "ops\update-fighters-weekly.ps1"

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$CommandPath`"" `
  -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 09:00

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Description "FightBase weekly fighter roster and profile refresh"
