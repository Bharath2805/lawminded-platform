# Sprint 3 Auth + RBAC Runbook

## Scope Delivered

- Session-based authentication (`register`, `login`, `logout`, `me`)
- Role-based authorization (`user`, `admin`)
- Protected web routes for dashboard (`/app`) and admin (`/admin`)
- Admin bootstrap by email (`ADMIN_EMAIL`)
- Admin API endpoints (`/api/admin/overview`, `/api/admin/users`)

## Required API Environment Variables

- `SESSION_SECRET` (required)
- `ADMIN_EMAIL` (required for admin bootstrap target)
- `SESSION_COOKIE_NAME` (optional, default `lm_session`)
- `SESSION_TTL_HOURS` (optional, default `336`)
- `COOKIE_DOMAIN` (optional; set to `.yourdomain.com` in production)

## API Endpoints

### Public Auth Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Session-Protected Endpoint

- `GET /api/auth/me`

### Admin-Protected Endpoints

- `GET /api/admin/overview`
- `GET /api/admin/users?limit=25`

## Cookie Behavior

- Cookie name defaults to `lm_session`
- Cookie options:
  - `httpOnly: true`
  - `sameSite: lax`
  - `secure: true` in production
  - `domain`: from `COOKIE_DOMAIN` when set

## Local Verification Commands

```bash
curl http://localhost:3001/api/auth/me
curl -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -c /tmp/lm.cookie \
  -d '{"email":"test@example.com","password":"StrongPass!123"}'
curl -b /tmp/lm.cookie http://localhost:3001/api/auth/me
curl -b /tmp/lm.cookie http://localhost:3001/api/admin/overview
```

Expected:

- Unauthenticated `/api/auth/me` returns `401`
- Authenticated `/api/auth/me` returns user + session metadata
- Non-admin `/api/admin/overview` returns `403`

## Web Flow Verification

- Open `/login` and authenticate
- Confirm redirect to `/app`
- Confirm `/admin` redirects to `/app` for non-admin users
- Confirm `/app` and `/admin` redirect to `/login` when logged out
