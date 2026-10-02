# Gym CRM frontend — final report

## 1. Repository structure

The backend was found as a single NestJS application at the repository root
with its own `package.json`, `tsconfig.json` and lint globs
(`{src,test,prisma}/**/*.ts`). Moving it would have been a large change with
no technical justification, so the frontend was added as a sibling with an
independent dependency tree, lint, typecheck, test and build. **No backend
file was modified.**

```
gym/
  src/  prisma/  test/        NestJS API — untouched
  openapi.json                exported API contract; the source of frontend types
  frontend/
    src/
      app/
        (auth)/               login, forgot-password, reset-password
        (app)/                everything behind a session
          admin/ trainer/ me/
        api/                  session routes, the API proxy, a health probe
      components/             layout · ui · data · forms · charts · feedback
      features/               one folder per business area
      i18n/                   config, loader, locales/{uz,en,ru}/*.json
      lib/                    api client, formatters, hooks, server-only helpers
      providers/              theme · query · locale · session · toasts
      theme/                  design tokens and the MUI theme
    docs/                     ten phase reports and this one
```

214 TypeScript files, ~23,200 lines, excluding the generated API types.

## 2. Phase results

| Phase | Outcome |
| --- | --- |
| 1 — Foundation and design system | Pass. Tokens, themes, shell, typed API, i18n, 228 tests |
| 2 — Authentication and accounts | Pass. httpOnly cookies, transparent refresh, role routing |
| 3 — Admin dashboard | Pass. Twelve live figures, two charts, server-prefetched |
| 4 — Members and trainers | Pass. Directories, detail pages, full lifecycle |
| 5 — Memberships | Pass. Plans and the whole membership lifecycle |
| 6 — Payments and accounting | Pass. Six accounting views; books reconcile |
| 7 — Attendance and QR | Pass. Scanner, manual desk, all 13 denial reasons |
| 8 — Trainer portal | Pass. Dashboard, plan editor, measurements, sessions |
| 9 — Member portal | Pass. Mobile-first, nine screens |
| 10 — Polish and acceptance | Pass. 29/29 steps; two real defects found and fixed |

Each has its own report in `docs/`.

## 3. Pages

36 pages and 3 route handlers.

**Administrator** — dashboard · members · member detail (overview,
membership, payments, trainer) · trainers · trainer detail (overview,
compensation, members) · memberships · plans · attendance (desk and history)
· payments · accounting (overview, income, expenses, debts, trainer pay,
period breakdown) · reports (nine) · audit log · notifications · settings.

**Trainer** — dashboard · my members · member detail (overview, workouts,
progress, attendance) · workout plans · the plan editor · sessions ·
progress · notifications · profile.

**Member** — home · membership · QR card · trainer · workout · progress ·
attendance · payments · profile.

**Unauthenticated** — sign in · forgot password · reset password · forbidden
· not found.

## 4. Backend endpoints integrated

45 distinct paths across auth, members, trainers, membership plans,
memberships, payments, billing, accounting, attendance, membership cards,
workout plans, measurements, training sessions, dashboards, reports,
notifications and audit.

Types for all 139 operations are generated from the backend's own OpenAPI
document (`npm run api:types`), so a contract change breaks this build.

## 5. Translation coverage

18 namespaces × 3 locales = 54 files. Uzbek is the default; English is the
fallback, deep-merged underneath so a missing key renders readable English
rather than a raw key.

202 automated assertions enforce: identical key sets across locales; no
empty values; placeholder parity compared by **parsing the ICU AST** rather
than regex; every message compiling for its own locale; Russian plurals
declaring `one`/`few`/`many`; no Cyrillic in the Uzbek bundle; and no long
English string left untranslated in Russian.

Verified live: 27 pages × 3 languages, all 200, correct `<html lang>`, no raw
key anywhere.

## 6. Account permissions

```
                        ADMIN   TRAINER  MEMBER
members                   200      200*    403      * scoped to their own
trainers                  200      403     403
payments                  200      403     403
accounting/entries        200      403     403
dashboard/admin           200      403     403
reports/*                 200      403     403
audit/logs                200      403     403
own records (/me)          —       200     200

trainer → another trainer's member      404   (does not confirm it exists)
member  → another member's records      403
member/trainer → /admin/*               307 to their own area
```

Three layers: middleware cookie check, layout verification, and the backend —
which is the only one that decides.

## 7. Tests

```
frontend   16 files · 326 tests · all passing
  of which translation coverage: 202
backend    44 unit files · 726 tests
           29 e2e files  · 917 tests     (unchanged by this work)
acceptance 29/29 steps from a clean database, through the frontend
```

## 8. Lint, typecheck, build

```
frontend   lint 0 errors 0 warnings · typecheck 0 errors · build succeeded
backend    lint 0 errors 0 warnings · typecheck 0 errors
```

Largest first-load bundles: `/admin/accounting` 540 kB, `/admin/reports`
488 kB — both chart-heavy administrator screens on desktop. The member
portal, which matters most on a phone, ranges 184–311 kB.

## 9. Defects found and fixed during this work

Two in the frontend, caught by its own verification:

1. **Wrong error-code map.** The translation bundles mapped invented codes
   (`BUSINESS_RULE_VIOLATION`, `RATE_LIMIT_EXCEEDED`) that the backend never
   emits, so every refused action fell back to English. Replaced with the
   real sixteen from `error-codes.ts`.
2. **`/memberships/me` is not a page.** The member's membership screen
   assumed a paginated list and rendered nothing. Fixed, with a test that
   asserts the declared shape of twelve own-record endpoints.

Plus one performance defect: the member portal shipped 390 kB per page
because every route imported one barrel file. Split; roughly halved.

## 10. Missing backend capabilities

Each was verified against the running API or its source, not assumed.

| # | Gap | What this client does |
| --- | --- | --- |
| 1 | No language or locale field on any user DTO | Language is a per-device cookie |
| 2 | No gym-settings API — `gym.name`, `gym.currency` (`USD`), `gym.timezone` (`UTC`) exist in `app_settings` but no controller exposes them | Currency and timezone are frontend configuration, defaulting to UZS and Asia/Tashkent; the settings page says so |
| 3 | No endpoint for an account to change its own name or email. `/users/{id}` exposes only status, so **an administrator cannot edit their own profile at all** | Identity is read-only on all three account pages, with a notice |
| 4 | No user-preference storage | Theme, language and density are per-device |
| 5 | Member search does not match phone numbers — name, email and member number only | The placeholder says exactly what it searches |
| 6 | No sort parameter on any list endpoint | Column sorting is disabled rather than faked |
| 7 | No freeze allowance on plans; freezing is unlimited | The field was removed, with its six translation keys |
| 8 | **`dashboard.totalOutstanding` sums only its top-five debtor page** while counting all debtors. Measured: reported 863.48 against a true 958.46 | The client sums `billing/outstanding` across pages in integer minor units |
| 9 | `reports/unpaid-balances.totalOutstanding` has the same flaw, capped at 100 | Same; the report page states the 100 cap |
| 10 | Historical attendance cannot be created — `check-in` stamps its own time | Affects demonstration data only |
| 11 | No payroll calculation; expenses can be attributed to a trainer but nothing works out what is owed | The trainer-pay page says so plainly |

**Recommended backend fix.** Gaps 8 and 9 are the only ones that produce a
*wrong number* rather than a missing feature. Both are one-line changes —
sum over all debtors rather than the fetched page. Until then this client
computes the figure itself, so nothing incorrect is displayed.

**Recommended configuration change.** The backend buckets reports using
`gym.timezone`, currently `UTC`. Setting it to `Asia/Tashkent` aligns the
API's idea of "today" with the one shown on screen.

## 11. Local development

```bash
# API
docker compose up -d
npm ci && npm run db:migrate:deploy && npm run db:seed && npm run start:dev

# Web
cd frontend && npm ci && cp .env.example .env.local
#   set COOKIE_INSECURE=true for plain http
npm run dev            # http://localhost:3001
```

Sign in as `admin@gym.local` with the backend's `SEED_ADMIN_PASSWORD`.

## 12. Environment variables

See the table in `frontend/README.md`. `API_URL` is the only one without a
default.

## 13. Production deployment

```bash
cd frontend && npm ci && npm run build
API_URL=https://api.example.com NEXT_PUBLIC_API_URL=https://api.example.com npm start
```

- Serve over **HTTPS**: session cookies are `Secure` unless
  `COOKIE_INSECURE=true`, and the QR scanner's camera needs a secure context.
- Running **more than one instance** needs sticky sessions or a shared lock:
  the refresh single-flight guard is per process, and the backend revokes all
  sessions when a rotated refresh token is replayed.
- Add the frontend origin to the backend's `CORS_ORIGINS`, though with the
  proxy in place the browser never calls the API cross-origin.

## 14. Known issues

None outstanding in the frontend. Everything in section 10 is a backend
limitation, each handled explicitly rather than hidden.
