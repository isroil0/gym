# Phase 2 — Authentication and accounts

## Summary
Sign-in, password recovery, password change, per-role account pages, route
protection and session recovery — all against the real backend, with no
second authentication system introduced.

## Pages
| Route | Who | What |
| --- | --- | --- |
| `/login` | anyone | Sign in; resumes `?next=` after success |
| `/forgot-password` | anyone | Request a reset link |
| `/reset-password?token=` | anyone | Set a new password |
| `/admin/settings` | ADMIN | Identity, appearance, password, sessions, system |
| `/trainer/profile` | TRAINER | Identity, editable profile, appearance, password, sessions |
| `/me/profile` | MEMBER | Identity, editable profile, appearance, password, sessions |
| `/forbidden` | signed in | Shown when a role lands somewhere it may not go |

## Three layers of protection, in order
1. **Middleware** — a cookie presence check. Costs nothing, spares an
   unauthenticated visitor a round trip, and preserves the intended
   destination in `?next=`.
2. **Layouts** — `requireUser()` verifies the session with `GET /auth/me`;
   `requireRole()` sends a role that wandered into the wrong area back to its
   own dashboard rather than to a dead end.
3. **The backend** — the only one that matters. The first two are
   convenience; every request is authorised server-side regardless.

## Login tells the three outcomes apart
The backend answers differently and so does the UI, because the useful next
action differs in each case:

| Backend | Message | What the reader should do |
| --- | --- | --- |
| `401 UNAUTHORIZED` | "Invalid email or password" | Try again |
| `403 FORBIDDEN` | "This account is not active. Contact the gym administrator." | Call the gym |
| `429` | "Too many sign-in attempts. Please wait a minute." | Wait |

Collapsing the second into the first would send a member with a suspended
account round in circles retyping a password that was correct all along.

## Password policy corrected to match the backend
The frontend originally asked for 8 characters with upper case, lower case and
a digit. The backend's actual rule, read from `password-policy.ts`, is **at
least 10 characters containing at least one letter and one number**, max 128,
with no case requirement. The frontend was both stricter and differently
shaped, so it would have rejected passwords the server accepts. Validators,
the three validation bundles and the hint text now mirror the backend exactly,
and the strength meter scores anything below the real policy as the weakest
rather than flattering it.

## Verified against the running stack
Backend on `:3000`, production frontend build on `:3001`:

```
unauthenticated /admin/settings  → 307 /login?next=%2Fadmin%2Fsettings
wrong password                   → 401 UNAUTHORIZED
successful login body keys       → ['user']      (no tokens)
  accessToken in response body   → false
  refreshToken in response body  → false
cookies set                      → gym_at, gym_rt — both HttpOnly
GET /api/proxy/auth/me           → admin@gym.local ADMIN
/admin/settings signed in        → 200
admin → /trainer/profile         → 307 /admin          (role guard)
after logout → /admin/settings   → 307 /login?next=…   (cookies cleared)
```

**Transparent refresh**, tested by corrupting the access cookie while leaving
the refresh cookie valid:
```
/auth/me with a junk access token → 200, admin@gym.local
access token replaced             → yes
refresh token rotated             → yes
```

**Concurrent refresh**, the dangerous case. The backend revokes every session
when an already-rotated refresh token is replayed, so five simultaneous
requests carrying the same stale access token could have signed the user out
everywhere:
```
5 parallel calls → 200 200 200 200 200, all returning admin@gym.local
```
The single-flight lock in `src/lib/server/refresh.ts` spends the token once.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      8 files, 247 passed
build      succeeded
```
Tests added this phase: 11 login-form cases (including all three failure
modes and full Russian and Uzbek rendering), 4 password-strength cases,
4 role-area cases.

## Backend integration gaps found
3. **No endpoint for an account to change its own name, email or phone.**
   `PATCH /members/me` and `PATCH /trainers/me` cover a member's contact
   details and a trainer's professional details only; `/users/{id}` exposes
   nothing but status. **An administrator therefore cannot edit their own
   profile at all.** Identity is shown read-only on all three account pages
   with a notice explaining that the gym administrator manages it, rather than
   offering fields that could never save.
4. **No user-preference storage.** Language, theme and table density are
   per-device cookies, and the appearance card says so.

## Known gaps at the end of this phase
- `/admin`, `/trainer` and `/me` index routes do not exist yet, so the
  post-login redirect lands on a 404. Added in Phases 3, 8 and 9 respectively.
