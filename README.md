# LawMinded Platform

Production-oriented monorepo for LawMinded SaaS foundation.

## Stack

- Web: Next.js (App Router) + TypeScript (`apps/web`)
- API: NestJS + TypeScript (`apps/api`)
- DB: Neon PostgreSQL via Prisma
- Cache/Sessions: Upstash Redis
- Email: Resend
- AI: OpenAI Assistants API + restricted EU-domain web search

## Monorepo Layout

```text
apps/
  api/        NestJS API (auth, billing, chat, leads, privacy/GDPR)
  web/        Next.js web app (chat UI)
infra/
  render-api.yaml
docs/
  runbooks/   sprint runbooks (bootstrap, auth, billing, privacy)
```

## Prerequisites

- Node.js 22 LTS (recommended)
- pnpm 9+
- Neon database URL
- Upstash Redis URL
- OpenAI API key

## Environment Setup

1. Copy env templates:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

2. Fill `apps/api/.env` with private secrets (`DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `SESSION_SECRET`, etc.).
3. Set `apps/web/.env.local` with `NEXT_PUBLIC_API_URL`.
4. Optional for review/staging deployments: set `API_PROXY_TARGET` in `apps/web` and use `NEXT_PUBLIC_API_URL=/backend` to proxy browser calls through the web app.

Auth/RBAC-specific keys:

- `ADMIN_EMAIL`
- `SESSION_COOKIE_NAME` (default: `lm_session`)
- `SESSION_TTL_HOURS` (default: `336`)
- `COOKIE_DOMAIN` (set to `.yourdomain.com` in production)
- `WEB_APP_URL` (for auth/billing redirects)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRIVACY_POLICY_VERSION`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_COOKIE_POLICY_VERSION`

## Local Development

Install:

```bash
pnpm install
```

Generate Prisma client:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @lawminded/api prisma:generate
```

Apply first migration:

```bash
cd apps/api
pnpm exec prisma migrate deploy
```

Run both apps:

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- API health: http://localhost:3001/health
- API readiness: http://localhost:3001/ready
- Auth session check: http://localhost:3001/api/auth/me
- Billing plans: http://localhost:3001/api/billing/plans
- Privacy consent state: http://localhost:3001/api/privacy/consent

If web/API ports or Next cache get stuck:

```bash
pnpm dev:reset
pnpm dev:api
pnpm dev:web
```

Quick local diagnostics:

```bash
bash infra/scripts/local-doctor.sh
```

## Troubleshooting

1. `Error: listen EADDRINUSE 0.0.0.0:3001`

- Another API process is already running on port `3001`.
- Run:

```bash
pnpm dev:reset
pnpm dev:api
pnpm dev:web
```

2. `TypeError: Failed to fetch` in chat UI

- Most common causes:
  - API is not running on `http://localhost:3001`
  - `NEXT_PUBLIC_API_URL` is wrong in `apps/web/.env.local`
  - You are logged in without premium chatbot entitlement
- Verify:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

3. Resources upload fails from admin panel

- If file uploads fail with `Storage is not configured`, set these in `apps/api/.env`:
  - `STORAGE_BUCKET`
  - `STORAGE_ACCESS_KEY_ID`
  - `STORAGE_SECRET_ACCESS_KEY`
- Optional but recommended:
  - `STORAGE_REGION`
  - `STORAGE_ENDPOINT`
  - `STORAGE_FORCE_PATH_STYLE`
  - `STORAGE_SIGNED_URL_TTL_SECONDS`
  - `STORAGE_KEY_PREFIX`

4. Admin page redirects to `/app`

- The signed-in user must have role `admin`.
- Make sure `ADMIN_EMAIL` in `apps/api/.env` matches your login email, then restart API.

5. Turbopack/Next crashes or unstable behavior on Node 25

- This repo supports Node `20-24`; use Node `22 LTS`.
- `.nvmrc` is set for local alignment:

```bash
nvm use
```

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

Pipeline steps:

- install
- prisma generate
- lint
- typecheck
- test
- build

## Deploy

### API (Render)

- Use Docker deployment with `apps/api/Dockerfile`
- Health check path: `/ready`
- Set required environment variables in Render dashboard

### Web (Vercel)

- Import repository
- Root directory: `apps/web`
- Add environment variables:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_API_URL`
