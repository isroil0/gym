# Phase 8 — Trainer portal

## Summary
The complete trainer experience: a dashboard, their own members, the workout
plan editor, measurements with charts, and session scheduling.

## Pages
| Route | What |
| --- | --- |
| `/trainer` | Assigned members, today's and upcoming sessions, member activity |
| `/trainer/members` | The members this trainer coaches |
| `/trainer/members/[id]` | Overview, workouts, progress, attendance |
| `/trainer/workout-plans` | Every programme they have written |
| `/trainer/workout-plans/[id]` | The plan editor: days, exercises, archive |
| `/trainer/sessions` | Schedule, reschedule, complete, cancel, no-show |
| `/trainer/progress` | Pick a member and look at their measurements |
| `/trainer/notifications`, `/trainer/profile` | From Phases 2 and 9 |

## A wrong assumption the generated types caught
`MetricProgressDto.readings` reads like a series. It is a **count** — the
points themselves are in `progress.measurements`. The chart was written
against the wrong field and the compiler refused it, so the series is now
built from the measurements array, filtered to the selected metric and sorted
oldest first. Confirmed live: `weightKg` first 75.2 → latest 72.5, change
−2.7, readings 5, with 5 measurement rows returned for the chart.

The panel also decides which direction is good — down for body fat, waist and
resting heart rate, up for muscle mass — which is a judgement the API does
not make and should not.

## A conflict worth saying precisely
The backend allows one measurement set per member per day and answers a
second with `409 CONFLICT`. The generic translated "that value is already in
use" would throw away what matters, so the dialog catches the 409 and puts a
specific translated message on the **date field**, where the fix is.

## Isolation, verified rather than assumed
```
members visible:  admin 32 · trainer A 10 · trainer B 10
their member sets overlap:                 false
trainer A opening trainer B's member:      404 NOT_FOUND
trainer A writing a plan for B's member:   404 NOT_FOUND
trainer → /admin, /admin/accounting, …     307 to /trainer
trainer → GET /trainers, /payments,
          /accounting/entries,
          /dashboard/admin, /reports/revenue  403 each
trainer → GET /members                     200, scoped to their own
```
The backend answers 404 rather than 403 for another trainer's member, which
is the stronger posture: it does not confirm the record exists.

## Workout editing, verified end to end as the trainer
```
plan created            0 days, 0 exercises
day added               plan returned whole, 1 day
exercise added          1 exercise, "Bench press"
exercise edited         5 sets, 75.00 kg
exercise deleted        0 exercises
day deleted             0 days
plan archived           ARCHIVED
```
Every one of those endpoints returns the entire plan, so the editor redraws
from the server's answer rather than guessing what its own edit did.

## Sessions, verified
```
booked                              SCHEDULED, 60 min
overlapping session                 409 CONFLICT   (the backend's exclusion constraint)
rescheduled by moving the start     60 min preserved
completed with notes                COMPLETED
cancelling a completed session      400 — refused, so the action is hidden for non-scheduled rows
trainer dashboard                   10 members, 5 active, 10 plans, 4 completed this month,
                                    3 sessions today, 6 upcoming
```
Rescheduling moves the end with the start, keeping the booked length — which
is what "reschedule" means, and what the backend's own validation expects.

## Tests added
10 cases on the plan editor: the programme rendered, sets × reps shown with
and without a weight (no phantom "0 kg"), an empty day inviting content,
editing controls present for the owner, **absent entirely in read-only mode
and on an archived plan**, a missing `days` array handled, and Russian and
Uzbek rendering.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      14 files, 303 passed
build      succeeded
```
