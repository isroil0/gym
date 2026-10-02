# Phase 9 — Member portal

## Summary
A mobile-first portal for members: home, membership, QR card, trainer,
workout, progress, attendance, payments and profile.

## Pages
| Route | What |
| --- | --- |
| `/me` | Status, days and visits left, debt if any, and the QR button |
| `/me/card` | The scannable card, with a full-screen mode |
| `/me/membership` | Current term and full history |
| `/me/trainer` | Their trainer and their booked sessions |
| `/me/workout` | Their programme, read-only |
| `/me/progress` | Their measurements and charts |
| `/me/attendance` | Their visit history |
| `/me/payments` | What they owe and what they have paid |
| `/me/profile` | Contact details, language, theme, password (Phase 2) |

## Built for a phone at a turnstile
The QR button is the largest target on the home screen because it is why the
page gets opened. The card page is **prefetched on the server**, so the code
is in the first HTML response rather than after a round trip — verified: 24
SVG path elements, the member's name and code, all present with no JavaScript
having run.

The QR panel is white whatever the theme. A scanner reading a dark-mode code
off a phone at a turnstile is a bad time for everyone. A brightness hint sits
under it, which is as much as a web page can do.

## Nothing is left blank
Every absent value says what it means: "No membership" with "Speak to the
front desk", "No trainer assigned", "No workout plan yet", "Unlimited visits"
instead of an empty visit counter. Debt is shown only when there is some, and
links to the page that explains it.

## Member sees their own records and nothing else
```
own-data endpoints, all 200:
  dashboard/member · memberships/me · payments/me · billing/me
  attendance/me · workout-plans/me · measurements/progress/me · membership-cards/me

staff endpoints, all 403:
  members · trainers · payments · accounting/entries
  dashboard/admin · dashboard/trainer · reports/revenue · audit/logs

another member's records:
  GET /members/{other}                       403
  GET /billing/members/{other}               403
  GET /measurements/progress/members/{other} 403
  GET /membership-cards/members/{other}      403
  GET /workout-plans/{someone else's}        404

routes:
  /admin, /admin/accounting, /admin/members  307 → /me
  /trainer, /trainer/members                 307 → /me
```

## The workout page reuses the trainer's editor
`/me/workout` renders the same `WorkoutPlanEditor` the trainer uses with
`readOnly`, which removes every control. One component means a member and
their trainer are always looking at the same programme rendered the same way,
and a test asserts that read-only mode offers no add, edit, delete or archive
button at all.

## Tests added
11 cases: the QR card leading the page, the membership stated plainly,
"unlimited" instead of a blank count, the limited-plan count shown, no
nagging when nothing is owed, a debt surfaced and linked, a missing
membership explained, missing trainer and plan explained, Russian and Uzbek
greetings, and an error state with a retry.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      15 files, 314 passed
build      succeeded
```
All nine member pages return 200, render in all three languages with the
correct `lang` attribute, and leak no translation keys.
