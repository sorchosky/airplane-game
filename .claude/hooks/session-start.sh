#!/bin/bash
# Installs dependencies at the start of a Claude Code web session so the agent
# never has to, and never reads npm's output. Silent on success; on failure it
# prints one line plus the log tail so the agent can react.
set -uo pipefail

# Local sessions manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

log="${TMPDIR:-/tmp}/session-start-npm.log"
if ! npm ci --no-audit --no-fund --loglevel=error >"$log" 2>&1; then
  echo "session-start: npm ci failed. Last lines of $log:"
  tail -n 20 "$log"
fi
exit 0
