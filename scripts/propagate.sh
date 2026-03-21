#!/usr/bin/env bash
# propagate.sh — Push MASTER_PLAN to all configured propagation targets
# Part of card 0.7.3: Plan Resilience and Propagation
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$REPO_ROOT/propagation/manifest.json"
ROOT_MD="$REPO_ROOT/plan/root.md"

# --- Helpers ---

log() { echo "[propagate] $*" >&2; }
die() { echo "[propagate] ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# --- Pre-flight checks ---

[ -f "$MANIFEST" ] || die "Manifest not found: $MANIFEST"
[ -f "$ROOT_MD" ]  || die "root.md not found: $ROOT_MD"
require_cmd git
require_cmd jq

# --- 1. Push to all configured git remotes ---

push_git_remotes() {
  log "Pushing to git remotes..."
  local remotes
  remotes=$(cd "$REPO_ROOT" && git remote)
  local count=0

  for remote in $remotes; do
    log "  Pushing to remote: $remote"
    (cd "$REPO_ROOT" && git push "$remote" HEAD) && count=$((count + 1)) || \
      log "  WARNING: Push to $remote failed (non-fatal)"
  done

  if [ "$count" -lt 2 ]; then
    log "WARNING: Fewer than 2 git remotes pushed successfully ($count). Erasure resistance reduced."
  fi
  log "Pushed to $count git remote(s)."
}

# --- 2. Create plan tarball ---

create_tarball() {
  local tarball="$REPO_ROOT/propagation/master_plan.tar.gz"
  log "Creating plan tarball..."
  tar -czf "$tarball" -C "$REPO_ROOT" \
    plan/ \
    propagation/manifest.json \
    scripts/propagate.sh
  echo "$tarball"
}

# --- 3. Compute content hash (IPFS-compatible CIDv1 fallback: SHA-256) ---

compute_content_hash() {
  local file="$1"
  if command -v ipfs >/dev/null 2>&1; then
    # If IPFS is available, add and get the real CID
    ipfs add --only-hash --cid-version=1 -Q "$file"
  else
    # Fallback: SHA-256 hash prefixed with sha256: for clarity
    local hash
    hash=$(sha256sum "$file" | awk '{print $1}')
    echo "sha256:$hash"
  fi
}

# --- 4. Add to IPFS ---

add_to_ipfs() {
  local tarball="$1"
  if command -v ipfs >/dev/null 2>&1; then
    log "Adding to IPFS..."
    local cid
    cid=$(ipfs add --cid-version=1 -Q "$tarball")
    log "  IPFS CID: $cid"
    echo "$cid"
  else
    log "IPFS not available. Computing content hash as fallback..."
    compute_content_hash "$tarball"
  fi
}

# --- 5. Extract version from root.md ---

extract_version() {
  local version
  version=$(grep -m1 '^\*\*Version:\*\*' "$ROOT_MD" | sed 's/.*\*\*Version:\*\* *\([^ ]*\).*/\1/')
  if [ -z "$version" ]; then
    log "WARNING: Could not extract version from root.md"
    echo "unknown"
  else
    echo "$version"
  fi
}

# --- 6. Update manifest ---

update_manifest() {
  local cid="$1"
  local root_hash="$2"
  local version="$3"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  log "Updating manifest..."

  local tmp
  tmp=$(mktemp)
  jq --arg cid "$cid" \
     --arg ts "$timestamp" \
     --arg rh "$root_hash" \
     --arg ver "$version" \
     '
     .version = $ver |
     .timestamp = $ts |
     (.propagation_endpoints[] | select(.type == "ipfs")).cid = $cid |
     (.propagation_endpoints[] | select(.type == "ipfs")).status = "active" |
     .content_addressed_endpoints[0].cid = $cid |
     .content_addressed_endpoints[0].root_md_hash = $rh
     ' "$MANIFEST" > "$tmp"
  mv "$tmp" "$MANIFEST"

  log "Manifest updated."
}

# --- Main ---

main() {
  log "Starting propagation from $REPO_ROOT"

  # Push git remotes
  push_git_remotes

  # Create tarball
  local tarball
  tarball=$(create_tarball)

  # Add to IPFS (or compute hash fallback)
  local cid
  cid=$(add_to_ipfs "$tarball")

  # Compute root.md hash
  local root_hash
  root_hash=$(compute_content_hash "$ROOT_MD")

  # Extract version from root.md
  local version
  version=$(extract_version)
  log "  root.md version: $version"

  # Update manifest
  update_manifest "$cid" "$root_hash" "$version"

  log "Propagation complete."
  log "  CID: $cid"
  log "  root.md hash: $root_hash"
}

main "$@"
