# Nexora Financials Portal

Staff-only finance portal for Nexora Academy.

## Live
- Production: https://nexora-financials-portal.vercel.app

## Purpose
Manage contributor earnings, review and approve payouts, view ledger activity, run revenue reports, and audit financial actions.

## Architecture
- **Frontend**: static SPA (HTML + CSS + vanilla JS) — this repo
- **Backend**: shared with the main Nexora Academy API at
  `https://nexora-api-sskg.onrender.com/api`
- **Auth**: session cookie shared with the main Academy site
- **Database**: same Postgres as the main API

## Access
Only users with these roles can log in:
- `finance_admin` — read-only (dashboard, ledger, reports)
- `finance_manager` — approve / reject / mark-paid payouts, override splits
- `super_admin` — everything, plus system jobs

Any other role is rejected at login.

## Files
- `index.html` — shell (login + sidebar + content root)
- `financials.css` — all styling
- `financials.js` — all app logic and API calls
- `vercel.json` — deploy config

## Default revenue split
- 70% contributor
- 30% Nexora
- 7-day hold on contributor credits

Overrides per course are possible via `POST /api/financials/revenue-config/course/:courseId`.

## Backend endpoints used
- `GET  /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/financials/dashboard`
- `GET  /api/financials/contributors`
- `GET  /api/financials/contributors/:id`
- `GET  /api/financials/contributors/:id/ledger`
- `GET  /api/financials/payouts`
- `POST /api/financials/payouts`
- `POST /api/financials/payouts/:id/approve`
- `POST /api/financials/payouts/:id/reject`
- `POST /api/financials/payouts/:id/mark-paid`
- `GET  /api/financials/audit-logs`
- `GET  /api/financials/reports/revenue`
- `POST /api/financials/revenue-config/course/:courseId`

## Deploy
Deployed via Vercel, connected to the `main` branch of this repo. Push to main → auto-deploy.
