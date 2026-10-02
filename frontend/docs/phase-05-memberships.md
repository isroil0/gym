# Phase 5 — Memberships

## Summary
Plans and the full membership lifecycle: sell, renew, extend, freeze,
unfreeze, cancel, discount — each wired to the endpoint that performs it, with
the backend's own rules reflected in what the UI offers.

## Pages
| Route | What |
| --- | --- |
| `/admin/memberships` | All memberships: status, plan and expiry filters |
| `/admin/memberships?view=plans` | Plan management: create, edit, archive, reactivate |
| `/admin/members/[id]?tab=membership` | A member's current term, its actions, and their history |

## The guided sale
Find member → choose plan → review → confirm, as specified. The review step
earns its place: it is the moment money is committed, so it shows the exact
price and dates that will be written down, and **warns before the button is
pressed** if the member already holds a membership covering those days. The
backend refuses overlaps with a 422; finding that out beforehand is kinder
than after.

The member picker searches the server rather than filtering a preloaded list
— a thousand members is too many to ship into every dialog.

## Actions follow the backend's rules
Freeze is hidden for a term that has not started and for one already frozen;
unfreeze appears only when frozen; nothing destructive is offered on an
archived member. Unfreeze states how many days are being credited, counting
both the days already banked and the stretch still running.

## A real defect found and fixed: wrong error codes
The translation bundles mapped invented error codes — `BUSINESS_RULE_VIOLATION`,
`RATE_LIMIT_EXCEEDED` — that the backend never emits. Every refused action
would have fallen through to the server's English prose regardless of the
reader's language.

Reading `src/common/errors/error-codes.ts` gave the real set:
`UNPROCESSABLE_ENTITY`, `TOO_MANY_REQUESTS`, `BAD_REQUEST`, `UNIQUE_CONSTRAINT`,
`FOREIGN_KEY_CONSTRAINT`, `DATABASE_ERROR`, `SERVICE_UNAVAILABLE`,
`METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` and the
rest. All sixteen are now mapped in all three languages, and `ApiError`'s
status fallback uses the backend's spellings. A test asserts that a real 422
renders as "Сейчас это действие недоступно." rather than English.

## A feature the brief asked for that the backend does not have
**Freeze allowance.** The brief listed it under plans. `MembershipPlan` has
only name, description, durationDays, price, visitLimit and displayOrder —
there is no freeze allowance anywhere in the schema or the service, and
`FreezeMembershipDto` takes nothing but a reason. Freezing is unlimited and
staff-controlled. The field was removed from the plan form and the six
related translation keys were deleted from all three bundles, rather than
shipping an input that could never save.

## Verified against the live backend
```
sell                        ACTIVE, 49.99 due, 30 days
overlapping second sale     422 UNPROCESSABLE_ENTITY   (the warning is real)
discount 10.00              49.99 − 10.00 = 39.99 due
freeze                      FROZEN, daysRemaining null (the clock stops)
unfreeze                    ACTIVE, ends 2026-10-31
extend 7 days               2026-10-31 → 2026-11-07, extendedDays 7
renew                       PENDING, 2026-11-08 → 2026-12-07, linked to predecessor
cancel                      CANCELLED, reason recorded
plan create                 25.50, 14 days, 8 visits
plan edit → unlimited       29.90, unlimitedVisits true
plan archive / reactivate   ARCHIVED → ACTIVE → ARCHIVED
```

## Tests added
8 cases: the discount preview computing 39.99 before submission, a discount
larger than the price being refused, the amount sent as a number, the extend
preview computing 6 November from 30 October, nonsensical day counts blocked,
unfreeze counting banked plus running frozen days, and a backend 422 rendering
as translated Russian.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      11 files, 277 passed
build      succeeded
```

## Backend integration gaps found
7. **No freeze allowance on plans.** Freezing has no configured limit; the
   brief's "freeze allowance" field does not exist and was not built.
