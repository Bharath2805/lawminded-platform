# @lawminded/api

NestJS API for LawMinded.

## Modules

- `health`: `/health`, `/ready`
- `auth`: session auth + RBAC
- `billing`: checkout, plans, portal, webhooks
- `leads`: contact, request demo, newsletter
- `privacy`: cookie consent, DSAR, export workflows
- `admin`: overview + billing and user ops
- `chat`: `/api/chat/stream`, `/api/upload`
- `infrastructure`: Prisma, Redis, Resend

## Environment Variables

Required:

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `STRIPE_SECRET_KEY`
- `PRIVACY_POLICY_VERSION`

Optional:

- `TAVILY_API_KEY`
- `VECTOR_STORE_ID`
- `RESEND_API_KEY`
- `CORS_ORIGIN`
- `PORT`
- `STRIPE_WEBHOOK_SECRET`
- `WEB_APP_URL`
- `ADMIN_EMAIL`

## Commands

```bash
pnpm --filter @lawminded/api start:dev
pnpm --filter @lawminded/api build
pnpm --filter @lawminded/api prisma:generate
pnpm --filter @lawminded/api prisma:deploy
pnpm --filter @lawminded/api lint
pnpm --filter @lawminded/api typecheck
```
