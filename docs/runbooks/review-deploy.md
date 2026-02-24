# Review Deployment (Temporary Share Link)

Use this flow when you need a non-production URL for stakeholder review.

## Architecture

- API: Render web service (Docker, `apps/api/Dockerfile`)
- Web: Vercel project (`apps/web`)
- Browser API calls: proxied through web app via `/backend/*`

This avoids cross-domain session/cookie issues in review environments.

## 1. Deploy API on Render

Create a new Render Web Service:

- Environment: `Docker`
- Repo: `Bharath2805/lawminded-platform`
- Dockerfile path: `apps/api/Dockerfile`
- Docker context: repository root
- Health check: `/ready`

Set API environment variables (Render):

- `NODE_ENV=production`
- `PORT=10000`
- `CORS_ORIGIN=https://<your-vercel-review-domain>`
- `WEB_APP_URL=https://<your-vercel-review-domain>`
- `DATABASE_URL=<neon>`
- `DIRECT_URL=<neon direct>`
- `REDIS_URL=<upstash redis>`
- `OPENAI_API_KEY=<openai>`
- `TAVILY_API_KEY=<optional>`
- `VECTOR_STORE_ID=<if used>`
- `RESEND_API_KEY=<resend>`
- `SESSION_SECRET=<strong random string>`
- `CSRF_SECRET=<strong random string>`
- `ADMIN_EMAIL=<your admin email>`
- `SESSION_COOKIE_NAME=lm_session`
- `SESSION_TTL_HOURS=336`
- `COOKIE_DOMAIN=` (leave empty for review)
- `STRIPE_SECRET_KEY=<stripe test key>`
- `STRIPE_WEBHOOK_SECRET=<stripe webhook secret if enabled>`
- `PREMIUM_PLAN_KEYS=growth_monthly,growth_yearly`
- `PRIVACY_POLICY_VERSION=2026-02-17`

Optional storage variables (if gated file downloads are used):

- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`
- `STORAGE_FORCE_PATH_STYLE`
- `STORAGE_SIGNED_URL_TTL_SECONDS`
- `STORAGE_KEY_PREFIX`

After deploy, note the API URL, e.g. `https://lawminded-api-review.onrender.com`.

## 2. Deploy Web on Vercel

Create/import Vercel project:

- Framework: Next.js
- Root Directory: `apps/web`

Set Web environment variables (Vercel):

- `NEXT_PUBLIC_APP_URL=https://<your-vercel-review-domain>`
- `NEXT_PUBLIC_API_URL=/backend`
- `API_URL=https://<your-render-api-domain>`
- `API_PROXY_TARGET=https://<your-render-api-domain>`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<stripe test publishable key>`
- `NEXT_PUBLIC_COOKIE_POLICY_VERSION=2026-02-17`

Redeploy Vercel after setting env vars.

## 3. Smoke Test Checklist

Run these checks on the deployed URLs:

1. Web home page loads without console errors.
2. API health:
   - `GET https://<render-api-domain>/health` returns `status: ok`
   - `GET https://<render-api-domain>/ready` returns `ready: true`
3. Login/signup works.
4. Admin page opens for admin account.
5. Assistant opens and sends a message.
6. Billing page loads and "Recent Payments" shows finalized records only.

## 4. Share for Review

Send only:

- Vercel review URL
- Test login credentials
- Short scope note (review-only, not production)

Do not share secrets or provider keys.
