# Phase 4 — Members and trainers

## Summary
The member and trainer directories, their detail pages, and the create, edit,
archive, reactivate and trainer-assignment flows — all against the real API.

## Pages
| Route | What |
| --- | --- |
| `/admin/members` | Directory: search, four filters, paging |
| `/admin/members/[id]` | Overview and trainer tabs, with actions |
| `/admin/trainers` | Directory: search, status filter, paging |
| `/admin/trainers/[id]` | Overview, compensation, assigned members |

## List state lives in the URL
Search, filters and page number are query parameters, so a view can be
bookmarked and sent to a colleague, and the back button steps through what
was actually looked at. Changing a filter resets to page one — staying on
page 7 of a different result set is never what anyone meant — and uses
`router.replace`, so adjusting a filter five times does not need five back
presses to escape.

## Two things the UI deliberately does not claim

**Search does not cover phone numbers.** The brief asked for "search by name
and phone", but `MembersService.searchFilter` matches first name, last name,
email and member number only. Rather than offer a search box that silently
fails on a phone number, the placeholder says exactly what it searches:
"Search by name, email or member code". Recorded as an integration gap.

**No column is sortable.** No list endpoint on the backend accepts a sort or
order parameter — verified by enumerating every query parameter in the
OpenAPI document. The grid therefore has sorting disabled rather than
offering controls that would reorder only the twenty rows currently on
screen, which would look like sorting and not be.

## Actions shipped in this phase
Create member, edit member, archive, reactivate, assign/change/remove trainer;
create trainer, edit trainer, archive, reactivate, set compensation.

Renew, freeze, take payment and check in are **not shown yet** — they belong
to Phases 5, 6 and 7. A disabled button for a feature that does not exist is
still a dead control, so they are simply absent until they work.

## Compensation mirrors the backend's conditional rules
`SetCompensationDto` requires a salary for `FIXED`, a rate for `COMMISSION`,
and both for `FIXED_PLUS_COMMISSION`. The form shows and requires exactly
those fields per type, so a refusal never arrives as a surprise from the
server.

## Verified against the live stack
```
/admin/members                     200, no raw translation keys
  placeholder promises only what the backend searches
/admin/trainers                    200
/admin/members/{id}                200
/admin/trainers/{id}               200

API, same filters the list sends:
  ?limit=20              → 30 total, 20 returned
  ?search=Aziz           → 1 total
  ?status=ACTIVE&limit=5 → 30 total, 5 returned
  ?unassigned=true       → 10 total

Defence in depth, as a MEMBER:
  GET /admin/members            → 307 /me        (route guard)
  GET /api/proxy/members        → 403 FORBIDDEN  (backend)
```

## Tests added
11 cases: rows rendered, filters read from the URL and sent to the API, blank
filters omitted rather than sent as empty strings, a search written back into
the URL, page reset on filter change, "no members yet" distinguished from
"nothing matched", no sort controls offered, an em dash for a missing trainer,
full Russian and Uzbek rendering, and an error state with a retry.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      10 files, 269 passed
build      succeeded
```

## Backend integration gaps found
5. **Member search does not match phone numbers** — name, email and member
   number only (`members.service.ts`).
6. **No sort parameter on any list endpoint** — rows arrive in the backend's
   chosen order and cannot be reordered from the UI.
