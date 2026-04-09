# Plan Guardian

## Run Forever (PowerShell)

Run from the repository root (`MASTER_PLAN`).

### Foreground (continuous)

```powershell
$env:OPENROUTER_API_KEY = [Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY','User')
$env:LLM_REQUEST_TIMEOUT_MS = '30000'
& 'C:\Program Files\nodejs\npm.cmd' run guardian -- --concurrency 20
```

This runs indefinitely because `--max-iterations` is omitted (default is infinite).

### Background (detached with logs)

```powershell
$env:OPENROUTER_API_KEY = [Environment]::GetEnvironmentVariable('OPENROUTER_API_KEY','User')
$env:LLM_REQUEST_TIMEOUT_MS = '30000'
Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run guardian -- --concurrency 20' -WorkingDirectory 'C:\Users\lbsa7\Documents\Source\rookdaemon\MASTER_PLAN' -RedirectStandardOutput 'guardian-live.log' -RedirectStandardError 'guardian-live.err.log'
```

### Stop background run

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*src/plan-guardian/main.ts*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
