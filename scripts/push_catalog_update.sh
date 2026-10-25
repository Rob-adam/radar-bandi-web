#!/usr/bin/env bash
# Preserve content/code merged while the collectors were running. Never force-push.
set -euo pipefail
for attempt in 1 2 3; do
  git fetch origin main
  git rebase origin/main
  if git push origin HEAD:main; then
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      echo "catalog_commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
    fi
    exit 0
  fi
done
echo "Catalog publication failed after three attempts; no forced update performed." >&2
exit 1
