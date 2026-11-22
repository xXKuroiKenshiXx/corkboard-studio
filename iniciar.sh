#!/usr/bin/env bash
# Corkboard Studio - web version at http://localhost:5173
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required: https://nodejs.org (or your distro's package manager)."
  exit 1
fi
echo "Installing dependencies..."
npm install --no-audit --no-fund --loglevel=error
echo
echo "  Corkboard Studio at http://localhost:5173  (Ctrl+C to stop)"
echo
npm run dev
