#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="/Users/min-macmini-m1/.openclaw/workspace-webmaster/minhsiuh.github.io"
PY_SCRIPT="$REPO/scripts/update_index_scholar_stats.py"
STATE_FILE="$REPO/data/scholar-stats-state.json"
OPENCLAW_BIN="/opt/homebrew/bin/openclaw"
GIT_AUTH=(-c credential.helper= -c "credential.helper=!gh auth git-credential")

cd "$REPO"

send_notification() {
  if [[ -x "$OPENCLAW_BIN" ]]; then
    "$OPENCLAW_BIN" message send \
      --channel telegram \
      --account min_webmaster_bot \
      --target 7361677318 \
      --message "$1" || true
  fi
}

notify_on_failure() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    send_notification "[Scholar refresh] Failed (exit ${exit_code}). Check scholar-refresh.err.log."
  fi
}

trap notify_on_failure EXIT

# Synchronize before editing so manual website updates do not cause a
# non-fast-forward push failure later.
git "${GIT_AUTH[@]}" fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Cannot rebase Scholar refresh while the repository has uncommitted changes." >&2
    exit 1
  fi
  git rebase origin/main
fi

python_out=$(python3 "$PY_SCRIPT")
print -r -- "$python_out"

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

git add -- index.html "$STATE_FILE"
commit_created=false

if ! git diff --cached --quiet; then
  git commit -m "content(index): daily refresh Google Scholar citation stats"
  commit_created=true
fi

ahead_count=$(git rev-list --count origin/main..HEAD)
if (( ahead_count > 0 )); then
  if ! git "${GIT_AUTH[@]}" push origin main; then
    # Retry once after integrating a concurrent website update.
    git "${GIT_AUTH[@]}" fetch origin main
    git rebase origin/main
    git "${GIT_AUTH[@]}" push origin main
  fi

  latest_commit=$(git rev-parse --short HEAD)
  if [[ "$commit_created" == true ]]; then
    notify_msg="[Scholar refresh] Updated and pushed (${latest_commit}): ${stats}"
  else
    notify_msg="[Scholar refresh] Pushed ${ahead_count} pending commit(s) (${latest_commit}): ${stats}"
  fi
else
  notify_msg="[Scholar refresh] No change: ${stats}"
fi

send_notification "$notify_msg"
