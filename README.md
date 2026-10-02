# Gym CRM — Backend

NestJS + TypeScript + PostgreSQL + Prisma backend for a ~1,000 member gym.

> **Status: Phase 9 (Notifications + Audit + Security) complete.** Everything
> through dashboards and reports, plus in-app notifications with an idempotent
> reminder sweep, a full audit trail, a permission audit, rate limiting and
> database-level invariants. Phase 10 is the acceptance run.

## Requirements

- Node.js 20+
- Docker (for the local PostgreSQL instance), or an existing PostgreSQL 14+ server

## Getting started

```bash
npm install
cp .env.example .env            # adjust DATABASE_URL if you are not using docker-compose
docker compose up -d postgres   # starts PostgreSQL on localhost:55433
npm run db:migrate              # applies migrations + generates the Prisma client
npm run db:seed                 # baseline application settings (idempotent)
npm run start:dev
```

| URL | Purpose |
| --- | --- |
| `http://localhost:3000/api/v1` | API root (URI versioning) |
| `http://localhost:3000/api/v1/auth/login` | Sign in (seeded admin: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) |
| `http://localhost:3000/api/health` | Health check (version neutral) |
| `http://localhost:3000/api/health/live` | Liveness probe |
| `http://localhost:3000/docs` | Swagger UI |
| `http://localhost:3000/docs-json` | OpenAPI JSON |

## Test database

e2e tests run against a separate database defined in `.env.test`.

```bash
docker compose exec postgres psql -U gym -d postgres -c "CREATE DATABASE gym_test OWNER gym;"
npm run db:test:setup
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Watch-mode development server |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` | ESLint (flat config) + Prettier |
| `npm run typecheck` | `tsc --noEmit` over src, test and prisma |
| `npm test` | Unit tests |
| `npm run test:e2e` | e2e tests against the test database |
| `npm run test:all` | Unit + e2e |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:migrate:deploy` | Apply migrations (CI/production) |
| `npm run db:migrate:reset` | Drop, re-create and re-seed the dev database |
| `npm run db:seed` | Run the seed script |
| `npm run db:studio` | Prisma Studio |

## Architecture

```
src/
  main.ts                 process entrypoint
  bootstrap.ts            builds the configured app (shared by main.ts and e2e tests)
  app.module.ts           root module wiring
  config/                 env schema (zod), validation, typed config accessor
  prisma/                 PrismaService (lifecycle, ping, test-only truncate)
  health/                 health controller + Prisma health indicator
  common/
    security/             the credential rate limit
    time/                 the gym's calendar — timezone-aware day and month
                          boundaries (zoned-time.ts is pure; GymTimeService
                          reads gym.timezone and is global)
    money/                decimal money arithmetic (never floats)
    dto/                  shared error + pagination contracts
    errors/               stable error codes and domain exception base classes
    filters/              global exception filter (the single error envelope)
    middleware/           request correlation id
    logging/              pino configuration (structured logs, redaction)
    pipes/                shared ValidationPipe configuration
    swagger/              OpenAPI document setup
    transformers/         shared input normalizers (trim, lower-case email)
  modules/
    auth/                 login, refresh rotation, password flows, guards
      decorators/         @Public, @Roles, @CurrentUser
      guards/             JwtAuthGuard + RolesGuard (both registered globally)
    users/                account administration + account provisioning
    members/              member profiles, trainer assignment, scoping
    trainers/             trainer profiles and their member rosters
    memberships/          plans, membership lifecycle, pure date logic
                          (membership-period.ts)
    payments/             payments, refunds, and what members owe
                          (billing-math.ts holds the pure arithmetic)
    accounting/           the ledger, expense categories, revenue/profit totals
    attendance/           check-in/out, QR cards
                          (membership-card-token.ts, entry-eligibility.ts hold
                           the pure crypto and entry rules)
    workouts/             workout plans, measurements/progress, PT sessions
                          (progress-math.ts, session-scheduling.ts hold the pure
                           logic; member-access.service.ts holds the one
                           trainer-scope rule all three share)
    reports/              dashboards (one per role) and the nine reports
    notifications/        in-app messages and the idempotent reminder sweep
    audit/                audit trail (middleware writes, interceptor enriches)
                          and the permission audit
    settings/             shell awaiting its phase
prisma/
  schema.prisma           datasource, generator, models
  migrations/             SQL migration history
  seed.ts                 idempotent seed
test/                     e2e specs and the shared test harness
```

## Authentication

Every route requires a bearer access token unless it is explicitly marked
`@Public()`. New controllers are therefore protected by default.

```bash
# 1. Sign in
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@gym.local","password":"ChangeMe123!"}'

# 2. Call a protected route
curl -s http://localhost:3000/api/v1/auth/me -H "Authorization: Bearer <accessToken>"

# 3. Rotate the pair when the access token expires
curl -s -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' -d '{"refreshToken":"<refreshToken>"}'
```

| Token | Form | Lifetime | Storage |
| --- | --- | --- | --- |
| Access | JWT (`sub`, `email`, `role`, `type`, `iss`, `aud`) | `JWT_ACCESS_EXPIRES_IN` (15m) | stateless |
| Refresh | opaque 96-char random string | `REFRESH_TOKEN_EXPIRES_IN_DAYS` (30d) | SHA-256 hash only |
| Password reset | opaque 64-char random string | `PASSWORD_RESET_EXPIRES_IN_MINUTES` (60m) | SHA-256 hash only, single use |

Security properties worth knowing when building on this:

- **Refresh tokens rotate.** Each use revokes the presented token and issues a
  successor. Replaying an already-rotated token is treated as theft and revokes
  every session for that user. A token revoked by an explicit logout has no
  successor, so retrying it only fails that one session.
- **Authorization reads the live account**, not the token. Deactivating an
  account takes effect on its next request rather than when the token expires.
- **Login does not leak which emails exist** — an unknown address and a wrong
  password return the same message, and the unknown-address path burns
  comparable CPU. `forgot-password` always reports success.
- **Changing or resetting a password ends every session.**
- Passwords are bcrypt hashed at `BCRYPT_ROUNDS` and never leave the database.
  Authorization headers, cookies and every password field are redacted from logs.

### Roles

| Role | Scope |
| --- | --- |
| `ADMIN` | Full access, including account administration under `/users` |
| `TRAINER` | Own profile; assigned members (from Phase 3) |
| `MEMBER` | Own data only |

Use `@Roles(UserRole.ADMIN)` on a controller or handler to restrict it; a route
without `@Roles()` is open to any authenticated role. `@CurrentUser()` injects
the principal.

## Profiles

A **login account** (`users`) holds identity, credentials and role. A
**profile** (`members`, `trainers`) holds the gym-specific data and links 1:1
to an account. `POST /members` and `POST /trainers` either provision the
account and the profile together in one transaction, or link an existing
account of the matching role when you pass `userId`.

Profiles carry human-readable codes — `M-000001`, `T-000001` — derived from a
database sequence, so concurrent sign-ups cannot collide.

### Archive, not delete

Profiles are never deleted; memberships, payments and attendance will
reference them. Archiving keeps all history, deactivates the login account and
revokes its sessions. `POST /…/reactivate` reverses it.

Archiving a trainer also unassigns their members in the same transaction — the
response reports `unassignedMemberCount` so an administrator knows who needs
reassigning. Reactivating does **not** reassign them.

### Who can see which members

| Caller | `GET /members` | `GET /members/:id` |
| --- | --- | --- |
| `ADMIN` | every member | any member |
| `TRAINER` | only members assigned to them | assigned only; anything else is **404** |
| `MEMBER` | 403 — use `GET /members/me` | 403 — use `GET /members/me` |

The trainer restriction is enforced in the data layer as a `where` fragment,
not by filtering after the fact, so it also applies to counts, pagination and
search. A trainer passing `?assignedTrainerId=<someone-else>` cannot widen
their scope: the filter is honoured only for administrators.

Out-of-scope reads answer **404, not 403**, and identically to a genuinely
nonexistent id, so member ids cannot be probed.

Self-service routes (`/members/me`, `/trainers/me`) accept only contact-type
fields. Name, status, staff notes and trainer assignment stay administrator
decisions, and `forbidNonWhitelisted` rejects any attempt to send them. Staff
notes are omitted entirely from a member's view of their own profile.

## Memberships

A **plan** is what the gym sells: a duration in days, a price and a visit
allowance (`visitLimit: null` means unlimited). A **membership** is what a
member bought.

### Purchase price is preserved

Price and visit allowance are copied onto the membership at purchase and never
re-read. Repricing a plan affects future sales only; a membership sold at
£49.99 still reads `purchasePrice: "49.99"` after the plan moves to £59.99
(exposed alongside `plan.currentPrice` so both are visible). The plan relation
is `RESTRICT` for the same reason — history cannot be deleted from under a sale.

Money is returned as an exact **decimal string**, never a float.

### Lifecycle

```
PENDING ──(start date arrives)──> ACTIVE ──(end date passes)──> EXPIRED
                                    │  ▲
                            freeze  │  │  unfreeze (+ frozen days credited)
                                    ▼  │
                                   FROZEN
                        any non-terminal ──(cancel)──> CANCELLED
```

- **Freeze** stops the clock. The end date does not move until it resumes, at
  which point every whole day paused is credited back — so no paid-for days are
  lost. A frozen membership never expires underneath the member, and
  `daysRemaining` is `null` while paused. Every episode is kept in `freezes`.
- **Extend** adds days outright, tracked separately in `extendedDays` so it can
  always be told apart from freeze compensation. It is the one deliberate path
  that revives an expired membership.
- **Renew** creates a *new* term chained via `previousMembershipId`, by default
  starting the day after the current one ends (or today if it already lapsed),
  priced from the plan as it stands today. A membership can be renewed once.
- **Expire** ends a membership today; **cancel** ends it with a reason. Both are
  terminal — the status sweep will not revive them.

### Status is stored but date-derived

Status lives in a column so it can be filtered, counted and reported on, and is
reconciled against the calendar on every read of a single membership and before
every list query. `POST /memberships/sync-statuses` runs the sweep explicitly;
it is idempotent and is what Phase 9 will schedule.

Terminal statuses are never recomputed. That matters: a membership force-expired
on its own last day would otherwise be flipped back to ACTIVE by the next sweep.

### One live membership at a time

A member cannot hold two memberships covering the same day — otherwise visit
allowances and revenue would double-count. Back-to-back terms are fine; only
genuine overlap is rejected (422), and expired or cancelled memberships do not
occupy the calendar.

### Who sees what

| Caller | Plans | Memberships |
| --- | --- | --- |
| `ADMIN` | all, including archived; full write access | all; every lifecycle action |
| `TRAINER` | on sale only | read-only, assigned members only |
| `MEMBER` | on sale only | own only, via `GET /memberships/me` |

Trainer scoping reuses the Phase 3 member-visibility rule, so a trainer sees
memberships for exactly the members they can already see — and cannot widen it
with a `memberId` filter. Staff notes are omitted from a member's own view.

## Money

Every amount is a `NUMERIC(10,2)` column, handled in memory as a decimal (never
a JavaScript number), and returned over the API as an **exact two-decimal
string** — `"49.99"`, not `49.99`. Floats are never used for money anywhere in
the stack.

### A payment always posts to the ledger

`POST /payments` writes the payment **and** its `INCOME` ledger entry in one
transaction, and `accounting_entries.payment_id` carries a unique index. So a
payment cannot exist without its income entry, and a retry or a concurrent
duplicate cannot post the income twice — the invariant is enforced by the
database, not by remembering to call things in the right order. Refunds work the
same way via `refund_id`.

Entries created this way are marked `isAutomatic` and **cannot be edited or
voided**. Correcting one means refunding the payment, which keeps the money
records and the ledger in step.

### What a member owes

Balances are never stored — they are derived every time from the memberships and
the payments against them, so they cannot drift:

```
amountDue   = purchasePrice − discountAmount        (never below nil)
netPaid     = Σ payments − Σ refunds
balance     = amountDue − netPaid                   (negative ⇒ credit)
outstanding = max(0, balance)                       (the debt)
```

| Situation | `settlementStatus` |
| --- | --- |
| nothing paid | `UNPAID` |
| some paid, some owing | `PARTIALLY_PAID` |
| settled exactly, or fully discounted | `PAID` |
| more taken than owed | `OVERPAID` (the excess is `credit`) |

Partial payments, refunds that bring a debt back, and discounts all fall out of
that one formula. `GET /billing/outstanding` is the unpaid-balances report.

A **discount** lives on the membership, not on a payment, because it changes
what is *owed* rather than what was received. The purchase price is never
rewritten, so the original figure stays auditable.

A payment with no `membershipId` is other member income: it counts towards
revenue but offsets no membership debt, and is reported separately as
`unallocatedPayments`.

### Revenue and profit

The ledger is a single table with three entry types, so revenue and profit are
one query rather than a reconciliation:

```
revenue = income − refunds        (a refund is contra-revenue, not a cost)
profit  = revenue − expenses
```

Voided entries are excluded from every total but are never deleted.
`GET /accounting/summary`, `/daily` and `/monthly` report these, with
breakdowns by expense category and by payment method.

### Trainer pay

`PATCH /trainers/:id/compensation` stores how a trainer is paid (`NONE`,
`FIXED`, `COMMISSION`, `FIXED_PLUS_COMMISSION`, with a monthly salary and/or a
commission percentage). Fields that do not apply to the chosen type are cleared,
so a stale rate cannot be picked up later. Payouts are recorded as
trainer-attributed expenses through `POST /accounting/entries`. **Computing a
payroll run from this configuration is deliberately left to a later phase.**

## Attendance and QR cards

### The QR membership card

A card encodes `GYM1.<memberId>.<version>.<signature>`, where the signature is
an HMAC of the id and version under `QR_SECRET`.

**No secret is stored for a card.** The payload is derived on demand, which buys
three things at once: a member can always re-open their card (they lose a phone,
they sign in again), a database leak yields nothing replayable, and bumping
`version` invalidates every copy already printed, screenshotted or forwarded.

| Action | Effect |
| --- | --- |
| `GET /membership-cards/me` | issues a card on first request; always returns the same token |
| `POST …/regenerate` | bumps the version — every previous copy stops working, and any revocation is cleared, so this is also how a blocked card is reinstated |
| `POST …/revoke` | the card stops opening the door immediately |

The response carries the string to encode; rendering the QR bitmap is a client
concern. The signature is compared in **constant time**, so a forgery cannot be
refined from response timings, and the signature is checked before the database
is touched — a foreign or forged QR never becomes a lookup.

### Getting in

Both `POST /attendance/check-in` (manual) and `POST /attendance/check-in/qr`
converge on one code path, so the rules cannot drift between the door and the
front desk. A refusal is a **422 whose `details` carries a stable reason code**
alongside a readable message:

| Reason code | Meaning |
| --- | --- |
| `MEMBER_ARCHIVED` / `ACCOUNT_INACTIVE` | the person is not a current member |
| `NO_MEMBERSHIP` | they hold none at all |
| `MEMBERSHIP_NOT_STARTED` / `FROZEN` / `EXPIRED` / `CANCELLED` | the membership cannot be used, and says why |
| `NO_VISITS_LEFT` | a limited pack is used up |
| `ALREADY_INSIDE` | they never checked out |
| `CARD_INVALID` / `CARD_REVOKED` / `CARD_SUPERSEDED` / `CARD_NOT_ISSUED` | the card, not the membership, is the problem |

Membership status is reconciled against the calendar on the way in, so a
membership that lapsed overnight is refused rather than admitted.

The checks run in the order the front desk needs them reported: a member whose
membership expired last week is told *that*, not "you're already inside".

### One visit at a time

A **partial unique index** — `UNIQUE (member_id) WHERE checked_out_at IS NULL` —
allows at most one open visit per member. Two concurrent scans can both pass the
application check, but only one row can exist, and the loser is reported as
`ALREADY_INSIDE`. This is what keeps a limited visit allowance honest; it is
enforced by the database, not by call-site care.

A visit is deducted only when the membership is limited, and the attendance row
records whether it was (`visitDeducted`), so a later plan change cannot
retroactively alter past counts. **Checking out does not give a visit back.**

Someone already inside can always leave: `POST /attendance/check-out/qr` accepts
a revoked or superseded card, because nothing is granted by letting them out.

## Trainer work

### One access rule, three features

Workout plans, measurements and training sessions all route through a single
`MemberAccessService`, so *a trainer may only touch their assigned members* is
stated once and reuses the member-visibility rule from Phase 3. Out of reach
reads as **404**, matching the rest of the API, so ids cannot be probed.

A **member can read their training data but never write it.** A plan the member
could edit is not their trainer's plan, and self-reported measurements would make
the progress figures meaningless. That is a `403` — a deliberate refusal rather
than a scope miss.

Unlike the staff notes elsewhere in the API, a plan's `trainerNotes` **are**
visible to the member: the point of a plan is that they read it.

### Workout plans

```
WorkoutPlan  (member, authoring trainer, goal, dates)
  └─ WorkoutDay       (dayOrder unique within the plan — "Push", "Pull")
       └─ WorkoutExercise (exerciseOrder unique within the day)
            sets · reps · weight + unit · rest · tempo · notes
```

`reps` is free text, so `8-12`, `AMRAP` and `30s` are all expressible. A load
carries its own `weightUnit` (`KG`/`LB`), so "80" is never ambiguous. Positions
are unique per parent, enforced in the database as well as checked in the
service, and a day or exercise belonging to a different parent reports 404
rather than being silently accepted.

List reads return the counts but not the programme; read one plan for the full
content. Plan content is editable and deletable — unlike financial and
attendance history, which is never destroyed.

### Progress

Measurements are **sparse by nature** — weight weekly, body fat monthly — so
progress is computed **per metric**, not per measurement row. Comparing whole
rows would report "no change" in body fat simply because the latest row left that
field blank. A metric with only one reading is omitted: one point is not progress.

`GET /measurements/progress/members/:id` returns the latest value of every
metric, the BMI where both weight and height are known, and the first-to-latest
change (absolute and percentage) for every metric with at least two readings.
Numeric bounds reject an impossible body rather than storing a typo.

### Sessions and the schedule

Neither a trainer nor a member can be booked twice over the same minutes.
Overlap uses **half-open** intervals, so 09:00–10:00 and 10:00–11:00 are both
bookable — a normal trainer's morning. Cancelled slots free up again;
`NO_SHOW` is distinct from `CANCELLED` because the trainer's time was still
consumed.

A trainer books as themselves and only for their own members; an administrator
must name the trainer. Rescheduling with only a new `startsAt` **keeps the
original length** — "move it to 2pm" means the same session later, not a window
that ends before it begins.

`GET /training-sessions/me` is keyed on the **trainer** for a trainer and on the
**member** for a member. A trainer's schedule therefore keeps a session whose
member has since been reassigned: the trainer still committed that time, even
though that member no longer appears in their general lists.

## Dashboards and reports

### The gym's calendar, not the server's

Every period — "today", "this month", a report's date range — is the gym's
**local** calendar, read from the `gym.timezone` setting. Set it to
`America/New_York` and a payment taken at 20:00 on the last day of the month
lands in that month's revenue rather than the next one's. Each report echoes
back the zone it used, so a figure can always be reconciled.

The conversion handles daylight saving properly: a spring-forward day is 23
hours and a fall-back day is 25, and both are tested. The default is `UTC`,
where behaviour is byte-for-byte what it was before.

Ledger entries store the gym's local date at write time, and attendance and
report buckets derive from the same `GymTimeService` — so the accounting
module, the attendance module and the reports can never disagree about when a
day ended.

### One definition per number

Reports delegate rather than recompute: revenue and profit come from
`AccountingService`, debts from `BillingService`, membership status from
`MembershipsService`. A report therefore cannot contradict the records it
summarises, and the e2e suite asserts that `/reports/revenue` and
`/accounting/summary` agree for the same period.

Series are **dense** — a quiet day appears as `0.00` rather than being omitted,
because a gap in a chart reads as missing data rather than as no money.

### Dashboards

| Endpoint | Role | Answers |
| --- | --- | --- |
| `GET /dashboard/admin` | ADMIN | active/expired members, memberships lapsing soon, today's check-ins and who is inside, this month's revenue/expenses/profit, unpaid balances with the biggest debtors, new members, active trainers |
| `GET /dashboard/trainer` | TRAINER | assigned members, today's and upcoming sessions, this month's tally, and member activity **ordered least-recently-seen first** so the members drifting away are at the top |
| `GET /dashboard/member` | MEMBER | membership status, days and visits remaining, assigned trainer, visits this month, next session, current plan, and anything owed |

The member dashboard's `canCheckInNow` applies the same conditions the door
does, so it never contradicts what happens when they turn up.

### Reports

`membership-sales`, `revenue`, `expenses`, `profit`, `attendance`, `renewals`,
`expired-memberships`, `unpaid-balances`, `trainer-stats` — all ADMIN-only, all
under `/api/v1/reports`, all taking `from`/`to` local dates, with
`groupBy=day|month` where a series makes sense.

Two judgement calls worth knowing: a **cancelled** session is not counted as
"due" in a trainer's completion rate (the slot was freed) but a **no-show** is
(the time was consumed); and a member counts as having "returned" in the
expired-memberships report if they bought *any* later membership, not only a
formal renewal.

## Notifications, audit and security

### Notifications

In-app messages, scoped to one user inside every query — there is no id a
caller can supply to reach another account's inbox, and an administrator cannot
either.

`POST /notifications/run-reminders` generates membership-expiry and
payment-due reminders. **It is idempotent**: every reminder carries a unique
`dedupeKey` scoped to the thing it is about and the day it covers, and the
sweep relies on the unique index rather than a prior read — so two sweeps
running at once still cannot double-send. Payment amounts come from
`BillingService`, so a reminder can never quote a figure the unpaid-balances
report disagrees with. A changed balance earns a fresh reminder; an unchanged
one does not nag daily.

Delivery beyond the app (email, SMS) is out of scope; these rows are what a
transport would read from.

### The audit trail

Every state-changing request is recorded — who, what, when, how long, and
whether it worked. Two pieces, deliberately:

- **`AuditMiddleware`** writes the row. Middleware runs *before* the guards, so
  an attempt refused by authorization is still recorded — which is the single
  most valuable thing in an audit trail, and is exactly what an interceptor
  would miss.
- **`AuditEnricherInterceptor`** adds what only the handler knows: the declared
  action name, the id of a created record, the domain error code.

Credentials never reach the log: passwords, tokens and authorization headers
are replaced at any depth, strings truncated and breadth capped, so a row stays
a summary rather than a mirror of the request. There is **no** update or delete
endpoint — a log an administrator can edit is not evidence.

### The permission audit

`GET /audit/permissions` reports what every route actually requires, read from
the running metadata rather than a hand-kept document, so it cannot drift.
Routes fall into exactly three buckets:

| Bucket | Meaning |
| --- | --- |
| `publicRoutes` | reachable without a token — currently 6, all intended |
| `roleRestricted` | guarded by `@Roles(...)` |
| `serviceScoped` | open to any role but narrowed in the service, and **declared** with `@ScopedAccess('…')` |
| `unrestricted` | open to any role with nothing declared — **each needs a human to confirm** |

`needsReview` lifts that last bucket out so it cannot be missed. It is
currently empty, and a test asserts it stays that way.

### Invariants in the database, not just the code

Rules the application already enforced are now restated where a bug, a direct
SQL edit or a race cannot bypass them:

- **No overlapping memberships** per member — a `gist` exclusion constraint over
  the inclusive date range, limited to the statuses that occupy the calendar.
- **No double-booked trainer or member** — exclusion constraints over half-open
  time ranges, so back-to-back sessions remain legal.
- **One open visit per member** (from Phase 6), **one ledger entry per payment
  and per refund** (Phase 5), **one reminder per dedupe key**.
- Check constraints: money above zero, a discount never exceeding its price,
  an end date never before its start, visits never negative, an expense always
  categorised and income never categorised.

These caught two sloppy test fixtures the day they were added, which is the
point.

### Rate limiting

One global throttler at `RATE_LIMIT_MAX` per window. Credential endpoints
tighten *that same* throttler with `@ThrottleCredentials()` rather than adding a
second named one — a second throttler would be applied to every route, not only
where it is named, and would throttle ordinary traffic at the credential limit.
Each credential endpoint keeps its own counter, so exhausting login does not
lock out password reset.

### Slow queries

Any query over `SLOW_QUERY_MS` (default 300 ms) is logged at warn level — a
standing tripwire, so a query that degrades as the gym's data grows announces
itself rather than waiting to be noticed. Set it to `0` to disable.

### Password reset without email

No mail transport exists yet — notifications are Phase 9. Outside production,
`POST /auth/forgot-password` returns the raw `resetToken` in its response so the
flow is usable and testable. In production the token is only written to the log.

### Error contract

Every failing request returns the same envelope:

```json
{
  "success": false,
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Member 'abc' not found",
  "details": [{ "field": "email", "messages": ["must be unique"] }],
  "path": "/api/v1/members/abc",
  "method": "GET",
  "timestamp": "2026-10-01T17:21:40.555Z",
  "requestId": "490c467b-19c8-4a69-b8a5-565078c1d048"
}
```

`error` is a stable machine-readable code (see `src/common/errors/error-codes.ts`);
`details` is present only for field-level problems. Successful responses return
the resource itself and are not wrapped.

Every response carries an `x-request-id` header; an inbound `x-request-id` is
reused so a caller's correlation id flows through the logs and the error body.

## Acceptance

Two end-to-end suites exercise the system the way the gym actually uses it,
through the HTTP API only — no service is called directly and nothing is
written to the database behind the API's back, apart from the first
administrator, who has to exist before anyone can log in.

`test/acceptance.e2e-spec.ts` runs one continuous narrative: an owner signs in,
hires a trainer, enrols a member, sells and collects for a membership, assigns
the trainer, has them write a workout plan, lets the member sign in and see
their own data and nothing else, scans them in at the door, records the visit,
books an expense, reconciles the ledger, freezes and unfreezes the membership
with the frozen days credited back, renews it, takes a second payment, and
checks that every dashboard and report tells the same story. The money is
asserted to the penny at each step, and the same figure is compared across the
billing, accounting, reporting and dashboard endpoints, which compute it by
different routes.

`test/acceptance-permissions.e2e-spec.ts` checks the three roles separately:
what each may reach, what each is refused, and — more importantly — that a
member sees only their own records and a trainer sees only the members assigned
to them. It finishes by asking the running application to enumerate its own
routes and confirming that every one of them is covered by an authorization
rule, so a route added later without a guard fails the suite rather than
shipping open.

```bash
npm run test:e2e -- acceptance          # the business narrative
npm run test:e2e -- acceptance-permissions
npm run test:all                        # everything
```

A release is additionally verified against a database created from nothing —
`prisma migrate deploy` followed by the seed, then the compiled `dist/main.js` —
to prove the migration chain and the first-boot path, not just the test
fixtures.
