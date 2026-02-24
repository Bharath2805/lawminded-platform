#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
API_URL="${API_URL:-http://localhost:3001}"
WEB_URL="${WEB_URL:-http://localhost:3000}"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[PASS] %s\n' "$1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf '[WARN] %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '[FAIL] %s\n' "$1"
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    echo "__MISSING__"
    return
  fi

  local value="${line#*=}"
  value="$(printf '%s' "$value" | sed -e 's/^["'\'']//; s/["'\'']$//')"
  value="$(printf '%s' "$value" | awk '{$1=$1; print}')"

  if [ -z "$value" ]; then
    echo "__EMPTY__"
    return
  fi

  echo "__SET__"
}

check_env_file() {
  local file="$1"
  shift
  local keys=("$@")

  if [ ! -f "$file" ]; then
    fail "Missing env file: $file"
    return
  fi

  local missing=()
  local empty=()
  local key
  for key in "${keys[@]}"; do
    local state
    state="$(read_env_value "$file" "$key")"
    if [ "$state" = "__MISSING__" ]; then
      missing+=("$key")
    elif [ "$state" = "__EMPTY__" ]; then
      empty+=("$key")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    warn "$file missing keys: ${missing[*]}"
  fi

  if [ "${#empty[@]}" -gt 0 ]; then
    warn "$file empty values: ${empty[*]}"
  fi

  if [ "${#missing[@]}" -eq 0 ] && [ "${#empty[@]}" -eq 0 ]; then
    pass "$file required keys look set"
  fi
}

check_endpoint() {
  local name="$1"
  local url="$2"
  local expected="$3"

  local body_file
  body_file="$(mktemp)"
  local status
  status="$(curl -sS -o "$body_file" -w '%{http_code}' "$url" || true)"

  if [ "$status" = "000" ]; then
    fail "$name unreachable: $url"
    rm -f "$body_file"
    return
  fi

  if [ "$status" = "$expected" ]; then
    pass "$name returned $status"
  else
    fail "$name returned $status (expected $expected)"
  fi

  if [ "$name" = "API /ready" ]; then
    if command -v jq >/dev/null 2>&1; then
      local ready
      ready="$(jq -r '.ready // "unknown"' "$body_file" 2>/dev/null || true)"
      if [ "$ready" = "true" ]; then
        pass "API readiness flag is true"
      else
        warn "API readiness flag is $ready"
      fi
    fi
  fi

  rm -f "$body_file"
}

echo "== Local Doctor =="
echo "Root: $ROOT_DIR"
echo "API:  $API_URL"
echo "WEB:  $WEB_URL"
echo

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v)"
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
  echo "Node runtime: $NODE_VERSION"
  if [ "$NODE_MAJOR" -ge 25 ] || [ "$NODE_MAJOR" -lt 20 ]; then
    warn "Unsupported Node.js version detected ($NODE_VERSION). Use Node 22 LTS."
  else
    pass "Node.js version is in supported range (20-24)"
  fi
else
  fail "Node.js is not installed"
fi

echo
echo "Checking env files..."
check_env_file "$ROOT_DIR/apps/api/.env" \
  DATABASE_URL REDIS_URL OPENAI_API_KEY SESSION_SECRET ADMIN_EMAIL WEB_APP_URL
check_env_file "$ROOT_DIR/apps/web/.env.local" \
  NEXT_PUBLIC_APP_URL NEXT_PUBLIC_API_URL

echo
echo "Checking listeners..."
if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  pass "API port 3001 is listening"
else
  fail "API port 3001 is not listening"
fi

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  pass "Web port 3000 is listening"
else
  fail "Web port 3000 is not listening"
fi

echo
echo "Checking endpoints..."
check_endpoint "API /health" "$API_URL/health" "200"
check_endpoint "API /ready" "$API_URL/ready" "200"
check_endpoint "API /api/resources" "$API_URL/api/resources" "200"
check_endpoint "Web /" "$WEB_URL/" "200"

echo
echo "== Summary =="
echo "PASS: $PASS_COUNT"
echo "WARN: $WARN_COUNT"
echo "FAIL: $FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "Result: issues detected. Fix FAIL items first."
  exit 1
fi

echo "Result: no hard failures detected."
