# Sprint 0 Bootstrap Runbook

## 1) Configure Private Environment Variables

Set these in `apps/api/.env` (local) and Render (production):

- `NODE_ENV`
- `PORT`
- `CORS_ORIGIN`
- `OPENAI_API_KEY`
- `TAVILY_API_KEY` (optional but recommended)
- `VECTOR_STORE_ID`
- `DATABASE_URL`
- `REDIS_URL`
- `RESEND_API_KEY`
- `SESSION_SECRET`
- `CSRF_SECRET`
- `ADMIN_EMAIL`
- `SESSION_COOKIE_NAME` (optional, default `lm_session`)
- `SESSION_TTL_HOURS` (optional, default `336`)
- `COOKIE_DOMAIN` (optional for shared cookie on prod domain)
- `WEB_APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Set these in `apps/web/.env.local` (local) and Vercel (production):

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## 2) Bootstrap Commands

From repo root:

```bash
pnpm install
DATABASE_URL="postgresql://..." pnpm --filter @lawminded/api prisma:generate
cd apps/api && pnpm exec prisma migrate deploy && cd ../..
pnpm dev
```

## 3) Verify Core Endpoints

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

## 4) Render Setup (API)

1. Create Web Service from GitHub repo.
2. Select Docker runtime.
3. Dockerfile path: `apps/api/Dockerfile`.
4. Health check path: `/ready`.
5. Add API environment variables.

## 5) Vercel Setup (Web)

1. Import the same GitHub repo.
2. Set Root Directory to `apps/web`.
3. Add web environment variables.
4. Ensure Preview Deployments remain enabled.

## 6) Post-Deploy Validation

- Web can send chat messages.
- Streaming responses render token-by-token.
- File upload works.
- `GET /health` returns status.
- `GET /ready` returns ready=true.
