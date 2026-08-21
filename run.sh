#!/usr/bin/env bash
# Installs dependencies (if needed), sets up .env (if missing), and starts the server.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ ! -f .env ]; then
  echo "No .env found — copying .env.example to .env (offline demo mode until you add an API key)."
  cp .env.example .env
fi

npm start
