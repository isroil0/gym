# Phase 1 — Foundation and design system

## Summary
Established the frontend as a separate application at `frontend/`, alongside the
untouched NestJS backend at the repository root. Delivered the design system,
the responsive application shell, the typed API layer, and complete
three-language internationalisation.

No business screens yet — those begin in Phase 2. Nothing in this phase
fabricates data: there are no mock records anywhere in the codebase.

## Repository decision
The backend is a single NestJS application at the repository root with its own
`package.json`, `tsconfig.json` and lint globs (`{src,test,prisma}/**/*.ts`).
Moving it into `apps/api` would have been a large, risky change with no
technical justification, so the frontend was added as a sibling directory with
its own dependency tree, lint, typecheck, test and build commands. The two
share a repository and nothing else.

```
gym/
  src/ prisma/ test/      # NestJS backend, unchanged
  openapi.json            # exported API contract, the source of frontend types
  frontend/               # this application
```

## What was built
- **Tooling** — Next.js 15.5 (App Router), React 19.3, TypeScript 5.9 strict
  (plus `noUncheckedIndexedAccess`), ESLint flat config, Vitest + Testing
  Library, Prettier.
- **Design tokens** (`src/theme/tokens.ts`) — neutral and accent ramps, semantic
  colours, two-layer shadows, a 4px spacing base, motion durations and easings,
  layout constants.
- **Theme** (`src/theme/theme.ts`) — light and dark, ~30 component overrides, an
  optically corrected type scale, and a global `prefers-reduced-motion` rule.
- **Application shell** — collapsible desktop sidebar with a shared-element
  active indicator, mobile drawer plus bottom tab bar, translucent header,
  skip-to-content link.
- **Typed API layer** — `openapi-typescript` generates `schema.d.ts` from the
  backend's own OpenAPI document (139 operations), so a backend change that
  breaks the contract breaks the frontend build.
- **Authentication transport** — access and refresh tokens are held in
  **httpOnly cookies** and attached by a server-side proxy
  (`/api/proxy/[...path]`). No token is reachable from page script. The proxy
  refreshes expired tokens transparently and retries the original call once.
- **Internationalisation** — 18 namespaces × 3 locales = 54 message files,
  cookie-based locale with no URL prefix, English deep-merged underneath as the
  fallback.
- **Reusable components** — page header, search field, data table, filter bar,
  date range picker, status chips, metric cards, confirm dialog, form dialog,
  eight form field types, skeletons, empty and error states, language selector,
  theme toggle, user menu.

## Two decisions worth recording

**Tokens in httpOnly cookies behind a proxy, not in `localStorage`.** This is a
system that moves money. Tokens in `localStorage` are readable by any script
that gets onto the page. The cost is one extra hop on localhost; the benefit is
that an XSS hole cannot exfiltrate a session.

**Language lives in a cookie, not in the URL.** The usual `/en/...` prefix means
switching language is a navigation, which discards scroll position, open
dialogs and anything half-typed into a form. A cookie plus `router.refresh()`
re-renders in place, so the reader stays exactly where they were. This is what
the requirement "without losing important navigation context or unsaved form
data" actually needs.

## Concurrent-refresh hazard, handled
The backend rotates refresh tokens and treats the replay of an already-rotated
token as theft by revoking every session on the account. Two tabs refreshing at
the same instant would therefore sign the user out everywhere. `src/lib/server/refresh.ts`
collapses concurrent refreshes onto a single in-flight promise so the token is
spent exactly once. This is per server process; a multi-instance deployment
would need a shared lock.

## Internationalisation coverage
202 assertions in `src/i18n/__tests__/coverage.test.ts` enforce:
- every namespace present in every locale;
- Uzbek and Russian carry exactly the English key set — no missing, no extra;
- no empty values anywhere;
- placeholders match English, compared by parsing the ICU AST rather than by
  regex;
- every message compiles as valid ICU **for its own locale**;
- no Cyrillic in the Uzbek bundle (catches a Russian string pasted into `uz/`);
- no long English string left untranslated in Russian, ignoring format-only
  patterns such as `{sets} × {reps}`;
- Russian plurals declare `one`/`few`/`many`, so "5 дней" is not rendered
  "5 дня".

## Accessibility fix found by a test
The language and theme menus marked the active option with a tick icon only.
A test asserting the active language was announced failed, correctly: the tick
is invisible to a screen reader. Both menus now use `role="menuitemradio"` with
`aria-checked`, the correct pattern for choosing one of N.

## Verification
```
lint       0 errors, 0 warnings
typecheck  0 errors
tests      5 files, 228 passed
build      succeeded — 103 kB shared first-load JS
```

## Known gaps at the end of this phase
- `/login` does not exist yet, so `/` redirects to a 404 at runtime. Phase 2
  adds it. No other route is reachable yet by design.
- Trainer, member and admin pages are not built. Phases 3–9.

## Backend integration gaps found (carried to the final report)
1. **No language or locale field** on any user DTO. Language preference is
   therefore persisted client-side in a cookie, which the specification
   explicitly permits.
2. **No settings API.** `gym.name`, `gym.currency` (`USD`) and `gym.timezone`
   (`UTC`) exist in the `app_settings` table but no controller exposes them.
   The admin settings page can display them read-only at best, and the display
   currency and timezone are frontend configuration
   (`NEXT_PUBLIC_CURRENCY`, `NEXT_PUBLIC_TIMEZONE`, defaulting to UZS and
   Asia/Tashkent per the requirement). Note that the backend buckets reports
   using its own `gym.timezone`, currently `UTC`; aligning that database value
   with the display timezone is recommended.
