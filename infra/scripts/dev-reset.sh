#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Cleaning local dev state..."

for port in 3000 3001; do
  pids="$(lsof -ti "tcp:${port}" || true)"
  if [ -n "${pids}" ]; then
    echo "Stopping processes on port ${port}: ${pids}"
    kill ${pids} || true
  fi
done

rm -rf \
  "${ROOT_DIR}/apps/web/.next" \
  "${ROOT_DIR}/apps/api/dist" \
  "${ROOT_DIR}/.turbo"

echo "Done. Start services with:"
echo "  pnpm dev:api"
echo "  pnpm dev:web"
