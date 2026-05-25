#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Checking agent docs sync"
bash .githooks/pre-commit

echo "==> Running focused convention tests"
npm run test:unit -- \
  tests/unit/agent-guidance.test.ts \
  tests/unit/git-hooks-preflight.test.ts \
  tests/unit/merge-conflict-hygiene.test.ts \
  tests/unit/theme-neutrality.test.ts \
  tests/unit/cli-documentation.test.ts \
  tests/unit/cli-parity-changed-files.test.ts \
  tests/unit/cli-ci-coverage.test.ts

echo "==> Checking CLI parity guard"
npm run preflight:cli-parity

echo "==> Convention checks passed"
