#!/bin/bash
set -euo pipefail

echo "Starting LawMinded monorepo (web + api)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install with: npm install -g pnpm@9.15.4"
  exit 1
fi

pnpm install
pnpm dev
