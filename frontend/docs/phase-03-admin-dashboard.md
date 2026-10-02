# Phase 3 — Admin dashboard

## Summary
`/admin` now shows the gym's real state: twelve figures from
`GET /dashboard/admin`, two charts from the reporting endpoints, memberships
about to lapse, who owes money, recent payments and recent check-ins.

Nothing on this page is invented. Every number traces to one API field.

## Data sources
| Panel | Endpoint |
| --- | --- |
| All twelve KPI figures | `GET /dashboard/admin` |
| Revenue vs expenses chart | `GET /reports/profit?from&to&groupBy=day` |
| Check-ins chart | `GET /reports/attendance?from&to&groupBy=day` |
| Expiring memberships, top debtors | `dashboard/admin` (`expiringSoon`, `topDebtors`) |
| Recent payments | `GET /payments?page=1&limit=6` |
| Recent check-ins | `GET /attendance?page=1&limit=6` |

The charts come from the *reporting* endpoints rather than being computed in
the browser, so the dashboard and the reports pages cannot disagree — both
are bucketed by the backend in the gym's own timezone.

## First paint shows numbers, not skeletons
`GET /dashboard/admin` is prefetched on the server and handed to TanStack
Query through a hydration boundary, so the HTML that arrives already contains
the figures. Verified with JavaScript disabled — the raw response contains
`16`, `30`, `6`, `3`, `7` and `UZS 1,798.35`.

The prefetch helper is deliberately forgiving: a call that fails is simply
omitted from the dehydrated cache and the browser fetches it through the
proxy, which can refresh an expired token properly. A dashboard must not fail
to render because one panel could not be pre-filled.

## Verified against real data
An isolated database (`gym_e2e`) was created, migrated, seeded, and then
populated **entirely through the public API** — no direct SQL: 3 trainers,
30 members, 27 memberships, 23 payments, 30 expense entries, 20 workout plans
with 180 exercises, 80 measurements, 30 training sessions, and today's
check-ins.

Dashboard and reports agree exactly:
```
dashboard.monthlyRevenue  1798.35  = reports/revenue.revenue  1798.35
dashboard.monthlyExpenses 13035.00 = reports/expenses.expenses 13035.00
dashboard.monthlyProfit  -11236.65 = reports/profit.profit   -11236.65
```

Rendered in all three languages with the `lang` attribute set correctly and
**no raw translation keys** in any of them.

Worth noting what the seeding exposed: of 15 attempted check-ins, the backend
**admitted 6 and refused 9** — the refused members had expired or missing
memberships. The door logic is doing its job, and the dashboard reports the
real figure rather than the attempted one.

## Tests added
11 cases covering: the reported figures appearing and no others, money
formatted to two decimals, a loss shown as negative, the expiry alert with its
action link, the no-expiry case, click-through links, the error state with a
retry, full Russian and Uzbek rendering, and Russian plural selection for
both `one` (1 абонемент) and `many` (8 абонементов).

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      9 files, 258 passed
build      succeeded
```

## Known gaps
- **Historical attendance cannot be seeded through the API** — `POST
  /attendance/check-in` stamps the time itself and accepts no date, so the
  check-ins chart can only ever show days on which the system was actually
  used. This is correct behaviour, not a defect; it only limits demonstration
  data.
- `/admin` first-load JS is 302 kB, the bulk of it the charting library.
  Reviewed in Phase 10.
