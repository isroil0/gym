# Phase 10 — Final polish and production acceptance

## What this phase added
- `/admin/reports` — the nine report endpoints with charts and CSV export.
  It was the one dead link in the navigation.
- `/admin/audit` — the audit log and the route-permission self-audit, so the
  `settings.audit` translations describe something real.
- A **bug fix found by acceptance**: `/memberships/me` answers
  `{ current, history }`, not a page. The member's membership screen assumed
  a paginated list and would have shown an empty page to every member.
- A **performance fix**: the member portal was shipping 390 kB per page.
- A guard test so the first mistake cannot recur silently.

## The bug acceptance caught
`api.get<Paginated<Membership>>('memberships/me')` compiles perfectly well —
the explicit type argument is a claim TypeScript accepts without checking it
against the endpoint. The screen rendered nothing for every member.

`src/lib/api/__tests__/endpoint-shapes.test.ts` now reads the OpenAPI
document and asserts what twelve "own records" endpoints actually return, so
the next shape change is caught by a test rather than by a member staring at
a blank page.

## The performance fix
Every member page imported from one `MemberPages.tsx` barrel, so
`/me/attendance` was paying for the charting library and the workout editor
it never renders. Splitting it into one module per route:

| Page | Before | After |
| --- | --- | --- |
| `/me/attendance` | 390 kB | **184 kB** |
| `/me/payments` | 390 kB | **186 kB** |
| `/me/trainer` | 390 kB | **188 kB** |
| `/me/membership` | 390 kB | **202 kB** |
| `/me/progress` | 390 kB | 311 kB (charts, legitimately) |
| `/me/workout` | 390 kB | 292 kB (the editor, legitimately) |

The member portal is the most mobile-first part of the product and was the
heaviest. It is now the lightest.

## The 29-step acceptance
Run against a **freshly created database** — dropped, migrated, seeded — with
every call going through the frontend's own proxy, so the whole stack is
exercised rather than the API alone.

```
   1. Admin logs in                        PASS  tokens in body: False
   2. Admin creates a trainer              PASS  T-000001
   3. Admin creates a member               PASS  M-000001
   4. Admin creates a membership plan      PASS  Acceptance Monthly 49.99
   5. Admin assigns a membership           PASS  ACTIVE due 49.99
   6. Admin receives payment               PASS  CARD
   7. Accounting reflects income           PASS  1 automatic entry, income 49.99
   8. Admin assigns the trainer            PASS  T-000001
   9. Trainer logs in                      PASS  coach@gym.local
  10. Trainer views their assigned member  PASS  1 member visible
  11. Trainer creates a workout plan       PASS  1 day, 1 exercise
  12. Trainer records progress             PASS  BMI 26.69
  13. Member logs in                       PASS  aziz@gym.local
  14. Member views their membership        PASS  Acceptance Monthly, history 1
  15. Member views their workouts          PASS  Strength block
  16. Member displays the QR card          PASS  v1, no personal data in the token
  17. Member checks in                     PASS  admitted, 30 days left
  18. Attendance is recorded               PASS  1 visit, 1 inside; duplicate refused (ALREADY_INSIDE)
  19. Admin adds an expense                PASS  Rent
  20. Accounting totals update             PASS  income 49.99, expenses 1200.00, result -1150.01
  21. Admin freezes the membership         PASS  FROZEN; door says MEMBERSHIP_FROZEN
  22. Admin unfreezes the membership       PASS  ACTIVE, ends 2026-10-31
  23. Admin renews the membership          PASS  PENDING from 2026-11-01
  24. All three dashboards verified        PASS  admin 1/1, trainer 1, member ACTIVE
  25. All nine reports verified and agree  PASS  revenue 49.99, sold 2, visits 1
  26. Permissions correct for all roles    PASS  trainer 403 except scoped /members; member 403 on all 7
  27. Critical workflows in Uzbek          PASS  27 pages, all 200, lang=uz, no raw keys
  28. Critical workflows in English        PASS  27 pages, all 200, lang=en, no raw keys
  29. Critical workflows in Russian        PASS  27 pages, all 200, lang=ru, no raw keys

  29/29 steps passed
```

Step 26 initially failed because the check called `reports/revenue` without
its required `from`/`to` and read the resulting 400 as a permission result.
A 400 means the administrator **reached the handler**, which is the
permission signal; a 401 or 403 would not be. The assertion was corrected,
not the application.

## Localisation audit
27 pages × 3 languages = 81 renders, every one returning 200 with the correct
`<html lang>` and **no raw translation key anywhere**. Backed by 202
automated assertions covering key parity, placeholder parity by ICU AST,
per-locale ICU compilation, Russian `one`/`few`/`many` plurals, and no
Cyrillic in the Uzbek bundle.

## Accessibility
```
skip-to-content link           present
main landmark                  present
navigation landmark labelled   present
current page marked            aria-current="page"
html lang                      set per locale
viewport                       maximum-scale=5, no user-scalable=no
theme-color                    both colour schemes
reduced motion                 honoured globally in the theme
menus for choosing one of N    role="menuitemradio" + aria-checked
check-in result                role="status" aria-live="assertive", never colour alone
```

## Themes
Light and dark both render **server-side**, so there is no flash of the wrong
theme. Verified by resolved CSS variables in the first response:
light `background #f8f9fb / text #13161d / primary #5048ce`;
dark `background #0c0e13 / text #f1f2f6 / primary #8286f6` — the accent is
lightened in dark mode for contrast.

## Security
```
tokens in the login response body      none
gym_at, gym_rt cookies                 both HttpOnly
token references in page script        0 files
X-Content-Type-Options                 nosniff
Referrer-Policy                        strict-origin-when-cross-origin
X-Frame-Options                        DENY
robots                                 noindex (internal tool)
QR token                               carries neither name nor email
admin-only accounting                  trainer and member 403
trainer ↔ member isolation             another trainer's member → 404
member privacy                         another member's records → 403
```

## Verification
```
FRONTEND   lint 0 · typecheck 0 · 326 tests in 16 files · i18n 202 · build OK
BACKEND    lint 0 · typecheck 0 · 726 unit + 917 e2e = 1,643 tests
ACCEPTANCE 29/29 from a clean database, through the frontend
```

## Housekeeping
Both scratch databases (`gym_e2e`, `gym_accept`) were dropped and every
scratch server stopped. `gym_dev` is left exactly as it was: one seeded
administrator, no members, no payments, no ledger entries.
