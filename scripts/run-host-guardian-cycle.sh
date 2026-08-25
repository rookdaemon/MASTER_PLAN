#!/usr/bin/env bash
# Cron entry point: serialized, isolated host Guardian worktree with CI left as
# the deterministic verification boundary.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$repo_root/.guardian"
worktree_dir="$runtime_dir/host-worktree"
branch="guardian/host-supervisor"
lock_file="$runtime_dir/host-guardian.lock"
repository="${MASTER_PLAN_GITHUB_REPOSITORY:-rookdaemon/MASTER_PLAN}"

mkdir -p "$runtime_dir"
exec 9>"$lock_file"
flock -n 9 || exit 0

if test -n "$(git -C "$repo_root" status --porcelain)"; then
  echo "Refusing to run: primary checkout has uncommitted changes." >&2
  exit 1
fi
git -C "$repo_root" fetch origin main
if test -e "$worktree_dir/.git"; then
  test -z "$(git -C "$worktree_dir" status --porcelain --untracked-files=no)"
  git -C "$worktree_dir" fetch origin main
  git -C "$worktree_dir" reset --hard origin/main
else
  git -C "$repo_root" worktree add -B "$branch" "$worktree_dir" origin/main
fi
if test ! -e "$worktree_dir/node_modules"; then ln -s "$repo_root/node_modules" "$worktree_dir/node_modules"; fi

if test "$(gh pr list --repo "$repository" --head "$branch" --state open --json number --jq 'length')" -gt 0; then
  echo "Guardian PR remains open; waiting for deterministic CI."
  exit 0
fi

git -C "$worktree_dir" config user.name 'MASTER_PLAN Guardian'
git -C "$worktree_dir" config user.email 'guardian@users.noreply.github.com'
(
  cd "$worktree_dir"
  npm run guardian:host-cycle
  if test -n "$(git status --porcelain)"; then
    git add docs strategy
    git commit -m 'chore: run host guardian cycle'
  fi
  if test "$(git rev-list --count origin/main..HEAD)" -gt 0; then
    git push --set-upstream origin "$branch"
    gh pr create --base main --head "$branch" --title 'chore: run host guardian cycle' \
      --body 'Host-owned Codex Guardian cycle; deterministic CI validates the result.'
  fi
)
