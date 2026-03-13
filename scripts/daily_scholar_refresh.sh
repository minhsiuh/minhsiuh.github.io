#!/bin/zsh
set -euo pipefail

REPO="/Users/min-macmini-m1/.openclaw/workspace-webmaster/minhsiuh.github.io"
PY_SCRIPT="$REPO/scripts/update_index_scholar_stats.py"

cd "$REPO"

before_hash=$(shasum index.html | awk '{print $1}')
python3 "$PY_SCRIPT"
after_hash=$(shasum index.html | awk '{print $1}')

if [[ "$before_hash" != "$after_hash" ]]; then
  git add index.html data/scholar-stats-state.json || true
  git commit -m "content(index): daily refresh Google Scholar citation stats" || true
  git push origin main
fi
