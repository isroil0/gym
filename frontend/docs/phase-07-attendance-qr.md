# Phase 7 — Attendance and QR

## Summary
The front desk: scan a card or find the member, get one unmistakable answer,
and a record of everyone who has been in.

## Pages
| Route | What |
| --- | --- |
| `/admin/attendance` | Today's tally, the check-in desk, and today's visits |
| `/admin/attendance?view=history` | Visit history with date range and method filters |

## The backend decides who comes in
The desk never evaluates eligibility. It posts a scan or a member id and
reports what the API said — including the refusal reason, which arrives as
one of thirteen `EntryDenialReason` codes in `details[0].messages[0]` and is
translated for the reader. An unrecognised code falls back to the server's own
sentence rather than printing a raw enum.

All thirteen reasons have a translation in all three languages, and a test
renders every one of them to prove none falls through.

## The answer is readable without colour
Admitted is green, refused is red — but the words say so too, the panel is
`role="status"` with `aria-live="assertive"`, and the member's name is
repeated back. Somebody who cannot tell the two colours apart can still work
the desk.

Admissions also surface what the member should be told while they are
standing there: fewer than four visits left, or fewer than eight days.

## Camera handling
The ZXing decoder is imported only when the scanner is started — it is large,
and most people on a laptop will use manual check-in. The stream is stopped on
unmount, on error, and when the tab is hidden; a camera light left on at a
front desk is both rude and a privacy problem. Repeat reads of the same code
are ignored for 2.5 seconds, so holding a card in front of the lens does not
fire ten check-ins. Camera refusal, no camera, and a non-HTTPS origin each get
their own message pointing at manual check-in.

## Verified against the live backend
```
card issued                M-000031, v1, active
token contents             76 chars, contains neither the member's name nor their email
QR check-in                admitted, method QR, 37 days left
same card again            422 ALREADY_INSIDE
garbage token              422 CARD_INVALID
check out                  stillInside false
regenerate card            v2, token changed
  old token                422 CARD_SUPERSEDED
revoke card                422 CARD_REVOKED
member with no membership  422 NO_MEMBERSHIP
frozen membership          422 MEMBERSHIP_FROZEN
today                      7 visits, 0 inside
```
Every denial path the UI translates was produced by the real backend, not
assumed.

## Tests added
11 cases: admission announced assertively, expiry and low-visit warnings
shown only when they apply, the backend's reason repeated and translated,
**every one of the thirteen denial reasons rendering without leaking its
code**, an unknown future reason falling back to the server's sentence, the
member named even on a refusal, Russian and Uzbek refusals, and nothing
rendered when there is no outcome.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      13 files, 293 passed
build      succeeded
```

## Notes
- Historical attendance cannot be seeded: `POST /attendance/check-in` stamps
  the time itself and takes no date. Noted in Phase 3; it limits demonstration
  data only.
- Offline check-in is deliberately not attempted. The gym's server decides who
  may enter, so queuing admissions locally would mean admitting people the
  backend might refuse. The scanner says so plainly instead.
