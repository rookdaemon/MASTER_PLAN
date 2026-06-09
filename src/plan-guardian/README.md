# Plan Guardian

The guardian selects the next actionable card (DAG + priority), runs one action,
checks integrity, and commits. It has two execution "brains":

- **`provider` mode (default)** — calls an inference API (OpenRouter free models
  by default) and applies the file blocks the model returns.
- **`agentic` mode (`--agentic`)** — shells out to the **Claude Code CLI**
  (`--dangerously-skip-permissions`), which reads the `@`-referenced card + root
  and edits the files directly on disk (the "Ralph Wiggum" pattern). The guardian
  then commits the *observed* git diff. Reuses the same DAG/priority selection,
  integrity gate, and git commit; runs **one card per epoch** (serial) so diffs
  stay scoped, and **reverts** any edit that fails the integrity gate.

## Agentic mode (Claude Code CLI)

Requires the `claude` CLI on `PATH` (or set `CLAUDE_PATH`). Cost is governed by
whatever the CLI is authenticated with — a **Claude subscription** (flat-rate,
rate-limited) rather than metered API billing is the intended setup. Rate-limit
events from the CLI are handled by the existing backoff machinery.

```bash
# Preview one action without writing anything (invokes claude, then reverts):
npm run guardian -- --agentic --dry-run --max-iterations 1

# Run continuously, agentic:
npm run guardian -- --agentic

# Useful flags:
#   --claude-timeout <ms>     per-invocation CLI timeout (default 300000)
#   --quarantine-branch <b>   commit onto a side branch
#   --strict-integrity false  disable the integrity gate (not recommended)
```

`--concurrency` is forced to 1 in agentic mode (strictly serial). A card whose
edit yields no diff is treated as converged for that round.

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
