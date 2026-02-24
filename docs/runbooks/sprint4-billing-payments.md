# Sprint 4 Billing + Stripe Runbook

## Delivered Scope

- Stripe Checkout session creation for plan subscriptions
- Stripe Customer Portal session generation
- Billing plan catalog API (`/api/billing/plans`)
- User billing state API (`/api/billing/me`)
- Admin billing visibility (`/api/admin/billing`, billing metrics in `/api/admin/overview`)
- Stripe webhook endpoint (`/api/stripe/webhook`) with signature validation and idempotency tracking
- Billing persistence models: `plans`, `subscriptions`, `payments`, `billing_webhook_events`

## APIs

### User Billing APIs

- `GET /api/billing/plans` (public)
- `GET /api/billing/me` (auth required)
- `POST /api/billing/checkout-session` (auth required)
- `POST /api/billing/portal-session` (auth required)

### Stripe Webhook

- `POST /api/stripe/webhook`

### Admin Billing APIs

- `GET /api/admin/overview`
- `GET /api/admin/billing?limit=25`

## Required Environment Variables

### API (`apps/api/.env`)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `WEB_APP_URL`
- `SESSION_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

### Web (`apps/web/.env.local`)

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_URL`

## Stripe Dashboard Setup

1. Go to Stripe Dashboard (test mode)
2. Create webhook endpoint:
   - URL: `https://<api-domain>/api/stripe/webhook`
3. Subscribe to events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy webhook signing secret into `STRIPE_WEBHOOK_SECRET`

## Local Smoke Test Commands

```bash
curl http://localhost:3001/api/billing/plans
curl http://localhost:3001/api/billing/me
```

Expected:

- `/api/billing/plans` returns seeded EUR plans
- `/api/billing/me` returns `401` when unauthenticated

## Pricing Defaults (EUR, editable)

- `starter_monthly`: €9/month
- `starter_yearly`: €90/year
- `growth_monthly`: €29/month
- `growth_yearly`: €290/year

Plan values are seeded from `BillingService` and can be updated later without schema changes.
