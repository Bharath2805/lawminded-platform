# Sprint 5 GDPR + Privacy Runbook

## Delivered Scope

- Cookie consent state API and consent evidence logging
- Consent preference persistence for authenticated users and anonymous visitors
- DSAR self-service flows (create + list own requests)
- Data export endpoint for authenticated users
- Admin privacy operations APIs:
  - consent log review
  - DSAR queue review
  - DSAR status updates
  - user data export by user id
  - privacy admin audit log listing
- Web implementation:
  - cookie consent banner with category controls
  - account privacy settings page with DSAR + export controls
  - admin privacy tables for consent + DSAR workflow

## API Endpoints

### Public / Mixed

- `GET /api/privacy/consent?anonymousId=<id>`
- `POST /api/privacy/consent`

### Authenticated User

- `GET /api/privacy/dsar/me`
- `POST /api/privacy/dsar`
- `GET /api/privacy/export/me`

### Admin (role: `admin`)

- `GET /api/admin/privacy/consents?limit=25`
- `GET /api/admin/privacy/dsar?limit=25`
- `PATCH /api/admin/privacy/dsar/:requestId/status`
- `GET /api/admin/privacy/export/:userId`
- `GET /api/admin/privacy/audit?limit=25`

## Required Environment Variables

### API (`apps/api/.env`)

- `SESSION_SECRET`
- `DATABASE_URL`
- `PRIVACY_POLICY_VERSION` (default used if omitted: `2026-02-17`)

### Web (`apps/web/.env.local`)

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_COOKIE_POLICY_VERSION`

## Local Validation

```bash
curl http://localhost:3001/api/privacy/consent
```

With authenticated cookie jar:

```bash
curl -b /tmp/lm.cookie http://localhost:3001/api/privacy/dsar/me
curl -b /tmp/lm.cookie http://localhost:3001/api/privacy/export/me
```

Admin checks:

```bash
curl -b /tmp/lm_admin.cookie http://localhost:3001/api/admin/privacy/consents
curl -b /tmp/lm_admin.cookie http://localhost:3001/api/admin/privacy/dsar
```

## UI Validation

- Open `/` and confirm cookie banner appears when no consent exists
- Open `/app/settings` and verify:
  - DSAR request submission works
  - DSAR request history table loads
  - export downloads JSON payload
  - cookie preference manager reopens from settings
- Open `/admin` and verify privacy sections load:
  - consent logs table
  - DSAR workflow table
  - DSAR status update action
