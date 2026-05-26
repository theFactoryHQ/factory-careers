#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

for env_file in .env .env.local; do
  if [ -f "$env_file" ]; then
    set -a
    . "./$env_file"
    set +a
  fi
done
