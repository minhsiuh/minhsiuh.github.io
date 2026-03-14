#!/bin/zsh
set -euo pipefail

REPO="/Users/min-macmini-m1/.openclaw/workspace-webmaster/minhsiuh.github.io"
PY_SCRIPT="$REPO/scripts/update_index_scholar_stats.py"

cd "$REPO"

before_hash=$(shasum index.html | awk '{print $1}')
python_out=$(python3 "$PY_SCRIPT")
after_hash=$(shasum index.html | awk '{print $1}')

stats=$(python3 - <<'PY'
import json, pathlib
p=pathlib.Path('/Users/min-macmini-m1/.openclaw/workspace-webmaster/minhsiuh.github.io/data/scholar-stats-state.json')
if p.exists():
    d=json.loads(p.read_text())
    s=d.get('stats',{})
    print(f"citations={s.get('citations','?')}, h={s.get('hindex','?')}, i10={s.get('i10','?')}")
else:
    print('citations=?, h=?, i10=?')
PY
)

notify_msg="[Scholar refresh] ${stats}"

if [[ "$before_hash" != "$after_hash" ]]; then
  git add index.html data/scholar-stats-state.json || true
  git commit -m "content(index): daily refresh Google Scholar citation stats" || true
  git push origin main
  latest_commit=$(git rev-parse --short HEAD)
  notify_msg="[Scholar refresh] Updated and pushed (${latest_commit}): ${stats}"
else
  notify_msg="[Scholar refresh] No change: ${stats}"
fi

openclaw message send --channel telegram --account min_webmaster_bot --target 7361677318 --message "$notify_msg" || true
