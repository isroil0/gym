# Gym CRM — web client

The browser front end for the Gym CRM API. Next.js 15 (App Router), React 19,
TypeScript, Material UI. Three languages — Uzbek, English and Russian — and
three roles: administrator, trainer and member.

The backend lives in the repository root and is a separate application. This
one has its own dependencies, lint, typecheck, tests and build.

## Getting started

```bash
# 1. The API must be running first (from the repository root)
cd ..
docker compose up -d
npm ci && npm run db:migrate:deploy && npm run db:seed
npm run start:dev                 # http://localhost:3000

# 2. This application
cd frontend
npm ci
cp .env.example .env.local        # set COOKIE_INSECURE=true for plain http
npm run dev                       # http://localhost:3001
```

Sign in with the seeded administrator — `admin@gym.local` and the password
from the backend's `SEED_ADMIN_PASSWORD` — then create a trainer and a member
from the Members and Trainers pages.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3001 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run i18n:check` | Translation coverage across all three locales |
| `npm run api:types` | Regenerate API types from `../openapi.json` |
| `npm run verify` | lint → typecheck → test → build |

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_URL` | — | Where the API is, as seen from the Next.js server. Required. |
| `NEXT_PUBLIC_API_URL` | — | The same address, shown on the settings page |
| `API_TIMEOUT_MS` | `20000` | Abort a backend call that takes longer |
| `NEXT_PUBLIC_TIMEZONE` | `Asia/Tashkent` | The clock timestamps are displayed in |
| `NEXT_PUBLIC_CURRENCY` | `UZS` | Currency amounts are shown in |
| `NEXT_PUBLIC_CURRENCY_DECIMALS` | `2` | Decimal places for money |
| `COOKIE_INSECURE` | `false` | Set `true` only to serve over plain http outside production |

## How authentication works

Access and refresh tokens are held in **httpOnly cookies** and never reach
page script. Every API call goes through this application's own
`/api/proxy/[...path]`, which attaches the token server-side, and refreshes
it transparently when the API says it has expired.

The cost is one extra hop on the server; the benefit is that an XSS hole
cannot exfiltrate a session from a system that moves money.

Concurrent refreshes are collapsed onto a single in-flight promise
(`src/lib/server/refresh.ts`). The API rotates refresh tokens and treats the
replay of an already-rotated one as theft by revoking every session, so two
tabs refreshing at the same instant would otherwise sign the user out
everywhere. **This lock is per server process** — a multi-instance deployment
behind a load balancer needs a shared lock, or sticky sessions.

## Three layers of protection, in order

1. **Middleware** — a cookie presence check, so an unauthenticated visitor is
   redirected without a round trip to the API.
2. **Layouts** — `requireUser()` and `requireRole()` verify the session with
   the API and send a role that wandered into the wrong area back to its own.
3. **The API** — the only one that matters. The first two are convenience.

## Internationalisation

18 namespaces × 3 locales. The locale lives in a **cookie, not the URL**, so
switching language does not navigate: the address, the filters and any
half-filled form survive it.

`npm run i18n:check` enforces that the three bundles carry identical keys,
that placeholders match (compared by parsing the ICU AST), that every message
compiles for its own locale, that Russian plurals declare `one`/`few`/`many`,
and that no Cyrillic has strayed into the Uzbek bundle.

## Typed against the API

`src/lib/api/schema.d.ts` is generated from the backend's own OpenAPI
document by `npm run api:types`. Refresh `../openapi.json` with:

```bash
curl -s http://localhost:3000/docs-json > ../openapi.json && npm run api:types
```

A backend change that breaks the contract then breaks this build, which is
the point.

## Deployment

```bash
npm ci
npm run build
API_URL=https://api.example.com NEXT_PUBLIC_API_URL=https://api.example.com npm start
```

The server binds `$PORT` when the platform sets one, falling back to 3001.
Do not hardcode a port on a host that assigns one.

### Railway

Two services from this one repository. The frontend service needs its **Root
Directory** set to `frontend`; both read their commands from the `railway.json`
beside them.

| | Backend (root) | Web (`frontend`) |
| --- | --- | --- |
| Build | `npx prisma generate && npm run build` | `npm run build` |
| Start | `npx prisma migrate deploy && npm run start:prod` | `npm start` |
| Health | `/api/health` | `/api/health` |

`npm start` on the **backend** runs `nest start`, which recompiles from source
at boot — use `start:prod`, which runs the build. `migrate deploy` is
idempotent, so it is safe on every boot.

Web service variables: `API_URL`, `NEXT_PUBLIC_API_URL` (both the backend's
public URL), `NEXT_PUBLIC_TIMEZONE`, `NEXT_PUBLIC_CURRENCY`. Leave
`COOKIE_INSECURE` unset so session cookies stay `Secure`.

Keep the web service at **one replica**: the refresh single-flight guard is
per process, and the API revokes every session when a rotated refresh token
is replayed. The backend scales freely.

Serve over HTTPS in production: the session cookies are marked `Secure`
unless `COOKIE_INSECURE=true`, and the QR scanner's camera needs a secure
context. Add the frontend's origin to the backend's `CORS_ORIGINS` — though
with the proxy in place the browser never calls the API cross-origin, so this
only matters if that ever changes.

## Project layout

```
src/
  app/
    (auth)/            sign in, forgot password, reset password
    (app)/             everything behind a session
      admin/ trainer/ me/
    api/               session routes, the API proxy, a health probe
  components/          layout, ui, data, forms, charts, feedback
  features/            one folder per business area
  i18n/                config, loader, locales/{uz,en,ru}/*.json
  lib/                 api client, formatters, hooks, server-only helpers
  providers/           theme, query, locale, session, toasts
  theme/               design tokens and the MUI theme
```

## Known limitations

These come from the API, not from choices made here. The full list with
evidence is in `frontend/docs/final-report.md`.

- Member search does not match phone numbers; no list endpoint sorts.
- No endpoint lets an account change its own name or email, so identity is
  read-only everywhere — including for administrators.
- `dashboard.totalOutstanding` sums only its top-five debtor page. This
  client computes the real total itself rather than display a wrong one.
- There is no gym-settings API, so name, currency and timezone are frontend
  configuration.
