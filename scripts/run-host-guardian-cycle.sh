#!/usr/bin/env bash
# Cron entry point: serialized Guardian execution in the primary main checkout.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$repo_root/.guardian"
lock_file="$runtime_dir/host-guardian.lock"

mkdir -p "$runtime_dir"
exec 9>"$lock_file"
flock -n 9 || exit 0

publish_pending_cycle() {
  if test -z "$(git -C "$repo_root" status --porcelain --untracked-files=no)"; then return; fi
  if git -C "$repo_root" diff HEAD --name-only | rg -qv '^(docs|strategy)/'; then
    echo "Refusing to publish Guardian changes outside docs/ or strategy/." >&2
    exit 1
  fi
  (
    cd "$repo_root"
    npm run strategy:verify
    npm run docs:verify
    npm run lint
    npm test
  )
  git -C "$repo_root" add docs strategy
  git -C "$repo_root" diff --cached --quiet && return
  git -C "$repo_root" commit -m 'chore: run host guardian cycle'
  git -C "$repo_root" push origin main
}

if test -n "$(git -C "$repo_root" status --porcelain)"; then
  echo "Refusing to run: primary checkout has uncommitted changes." >&2
  exit 1
fi
if test "$(git -C "$repo_root" branch --show-current)" != main; then
  echo "Refusing to run: primary checkout must be on main." >&2
  exit 1
fi

git -C "$repo_root" fetch origin main
git -C "$repo_root" merge --ff-only origin/main
git -C "$repo_root" config user.name 'MASTER_PLAN Guardian'
git -C "$repo_root" config user.email 'guardian@users.noreply.github.com'
(
  cd "$repo_root"
  npm run guardian:host-cycle
)
publish_pending_cycle
