#!/bin/bash
# Codex cloud environment setup. Paste `bash scripts/codex-setup.sh` into the
# environment's setup script in Codex settings. It runs while the network is
# still open, before the agent starts. Claude sessions use
# .claude/hooks/session-start.sh instead and must not run this.
set -euo pipefail

npm ci --no-audit --no-fund --loglevel=error

# Chromium for `npm run e2e` and PR screenshots. System deps need apt; fall
# back to the browser alone if that isn't permitted.
npx playwright install --with-deps chromium || npx playwright install chromium
