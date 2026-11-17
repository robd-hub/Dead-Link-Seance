# Implementation Plan: Dead Link Séance

## Overview

Lean Next.js App Router + TypeScript build for a Halloween Wayback-restore app. The implementation centers on four route/page files backed by two shared `lib/` modules. All archive.org and AI calls are server-side Route Handlers; the client only submits a URL and renders the result. Tasks are grouped to keep the count minimal while staying independently testable, ending with wiring the results page to both routes.

## Tasks

- [x] 1. Project scaffold and config
  - [x] 1.1 Initialize Next.js App Router + TypeScript project and install dependencies
    - Scaffold `app/layout.tsx` with the dark séance theme (`#0b0b12` background, `#f4e9d8` body text, candle-glow accents); body-text/background contrast ≥ 4.5:1
    - Install runtime deps: `@mozilla/readability`, `jsdom`, `dompurify`; install dev deps: `fast-check` (for optional PBT) and test tooling
    - Add `tsconfig.json`, `next.config.*`, `package.json` with dev/build/start scripts
    - _Requirements: 7.1, 1.2_

  - [x] 1.2 Add `.gitignore` and `.env.example`
    - `.gitignore` ignores `.env`, `node_modules`, `.next`
    - `.env.example` documents `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` with defaults and required/optional status
    - _Requirements: 4.5, 8.2_

- [x] 2. Shared lib (isomorphic helpers + server-only extraction)
  - [x] 2.1 Implement `lib/seance.ts` (isomorphic — importable by client and server)
    - `isValidUrl(s)`: `new URL(s)` succeeds and scheme is `http:`/`https:`
    - `IN_THEME_MESSAGES` allowlist + `msg(kind)` accessor (`INVALID_URL`, `NOT_FOUND`, `TIMEOUT`, `UNREACHABLE`, `UNREADABLE`) and `mapErrorToInTheme(err)` classifying thrown values to the allowlist, never leaking raw text
    - `selectSnapshot(snapshots, hint?)`: closest-to-hint when an 8-digit `YYYYMMDD` hint is provided, else max timestamp; `null` for an empty list
    - `buildRawSnapshotUrl(timestamp, url)`: `https://web.archive.org/web/<ts>id_/<url>`
    - `EXAMPLE_DEAD_LINKS`: three `{url, timestamp}` pairs (Google Reader `20120601`, Vine `20150601`, Google+ `20160601`)
    - Shared response-envelope types (`LookupSuccess`, `LookupError`, `MediumResponse`)
    - _Requirements: 1.3, 1.6, 2.2, 2.3, 2.7, 3.1, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.2 Implement `lib/seance-server.ts` (server-only — imported only by Route Handlers)
    - `fetchWithTimeout(url, opts, timeoutMs)`: `fetch` + `AbortController`; clears timer in `finally`; throws an abort error on the 20s timeout that `mapErrorToInTheme` classifies as `TIMEOUT`
    - `extractReadable(html, finalUrl)`: `JSDOM` + `Readability` `.parse()`; returns `{title, content, textContent}` or `null` on any failure (try/catch, never throws)
    - Sanitize Readability `content` through DOMPurify before it reaches the client
    - _Requirements: 2.5, 3.2, 3.3, 3.4, 5.1_

- [ ] 3. Lookup + extract API route
  - [ ] 3.1 Implement `app/api/lookup/route.ts` (Route Handler, GET)
    - `export const maxDuration = 60` (Hobby ceiling; fits two sequential 20s ops with margin)
    - Validate `url` with `isValidUrl` → `INVALID_URL` on failure; read optional `timestamp` hint and reject a malformed hint (present but not exactly 8 digits) as `INVALID_URL`
    - `fetchWithTimeout(availabilityUrl, {}, 20000)` with `&timestamp=<hint>` appended when a valid hint is present
    - Map timeouts → `TIMEOUT`, non-2xx/network → `UNREACHABLE` via `mapErrorToInTheme`
    - Parse `archived_snapshots`; `selectSnapshot`; no snapshot or `available !== true` → `NOT_FOUND`
    - `buildRawSnapshotUrl` → `fetchWithTimeout(rawUrl, {}, 20000)`; timeouts → `TIMEOUT`, errors → `UNREACHABLE`
    - `extractReadable`; `null`/empty → `UNREADABLE`; wrap extraction so the route never crashes to the client
    - Return success envelope `{ok, title, content, textContent, snapshotTimestamp, snapshotDate, archiveUrl}` (`archiveUrl` is the replay URL without `id_`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.3_

- [ ] 4. Medium API route
  - [ ] 4.1 Implement `app/api/medium/route.ts` (Route Handler, POST)
    - `export const maxDuration = 30` (fits one 20s AI timeout with margin)
    - If `AI_API_KEY` unset/empty → return `{ok:true, skipped:true, summary:null, causeOfDeath:null}` without calling the AI
    - Resolve config from `process.env`: `AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_MODEL` (default `gpt-4o-mini`), `AI_API_KEY`; never hard-code keys
    - System message: séance persona requesting a three-sentence `summary` (friendly ghost voice) + a ≤1-sentence `cause_of_death`, as JSON `{summary, cause_of_death}`
    - `fetchWithTimeout(baseURL + '/chat/completions', {method:'POST', headers, body}, 20000)` with `response_format:{type:'json_object'}`
    - Timeout/error/non-2xx/unparseable/empty → `{ok:false}` (graceful, no raw error); success → `{ok:true, summary, causeOfDeath}`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.7_

- [ ] 5. Home page (ouija board)
  - [ ] 5.1 Implement `app/page.tsx` (`"use client"`)
    - `Ouija_Input` (`<input type="text" maxLength={2048}>`) + `Summon_Button`; `Summon_Button` ≥44×44 px touch target, layout fits within ≤768 px viewport with no horizontal scrolling
    - Render the three `EXAMPLE_DEAD_LINKS` from `lib/seance.ts`; selecting one populates both the input URL and the Timestamp_Hint
    - On submit: run `isValidUrl(value)`; invalid/empty → show the in-theme message `"That is not a valid link."` and do not navigate
    - Valid → `router.push('/results?url=' + encodeURIComponent(value) + (hint ? '&timestamp=' + hint : ''))`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 6. Results page
  - [ ] 6.1 Implement `app/results/page.tsx` (`"use client"`)
    - Read `url` and optional `timestamp` from `useSearchParams()`
    - `useEffect`: `fetch('/api/lookup?url=...&timestamp=...')`; on `ok:true` store title/content/textContent/snapshotTimestamp/snapshotDate/archiveUrl, then POST `/api/medium` with `{textContent, title}`; on `ok:false` store the in-theme error and stop
    - Medium `skipped`/`ok:false`/empty → omit Summary and Cause of Death, still show restored text (graceful)
    - Loading → themed "Summoning…"; Error → in-theme message + "Return to the board" link to `/`; Success → title, Summary + Cause of Death above the text when both non-empty, snapshot date, `Archive_Copy_Link` anchor, sanitized restored content (no raw HTML visible), "Summon another" link to `/`
    - Responsive ≤640 px: no horizontal scrolling, text wraps to viewport width
    - _Requirements: 4.4, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 7. README.md
  - [x] 7.1 Write `README.md`
    - Purpose (Dead Link Séance, Kiroween Resurrection hackathon); prerequisites (Node.js, npm); `npm install`
    - Environment variables table: `AI_BASE_URL` (optional, default OpenAI), `AI_API_KEY` (optional; enables the medium; unset → restored page without summary), `AI_MODEL` (optional, default `gpt-4o-mini`); note `.env` is gitignored and keys must never be committed
    - Commands: `npm run dev` (dev), `npm run build` (build), `npm run start` (serve build), Vercel deploy (push to a connected Vercel project)
    - How Kiro was used: steering `project.md` house rules + spec-driven workflow (requirements → design → tasks)
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 8. Checkpoint — build and verify
  - Ensure `npm run build` succeeds and all non-optional tests pass, ask the user if questions arise.

- [ ]* 9. Add property-based test suite (optional, not required for v1)
  - [ ]* 9.1 Write PBT for `isValidUrl`
    - Generate arbitrary strings (whitespace, missing scheme, `ftp:`/`mailto:`/`file:`, relative, valid http/https); assert the predicate matches the `new URL` + scheme rule; minimum 100 iterations
    - **Property 1: URL validity classification** — **Validates: Requirements 1.6, 2.3, 6.1**

  - [ ]* 9.2 Write PBT for `selectSnapshot`
    - Generate arbitrary non-empty timestamp lists with and without an 8-digit hint; with a hint assert the returned timestamp is closest to the hint, without a hint assert it is the chronological max
    - **Property 2: Snapshot selection respects the Timestamp_Hint** — **Validates: Requirements 2.2, 2.7**

  - [ ]* 9.3 Write PBT for `buildRawSnapshotUrl`
    - Generate arbitrary timestamps and URLs; assert the output template, the `id_` marker adjacent to the timestamp, exactly one `id_` marker, and that the URL is preserved verbatim
    - **Property 3: Raw snapshot URL construction** — **Validates: Requirements 3.1**

  - [ ]* 9.4 Write PBT for `mapErrorToInTheme`
    - Generate arbitrary errors whose messages/stacks embed HTTP codes, exception text, library/network strings; assert the mapped message is in the allowlist, shares none of those raw substrings, and each kind maps to its prescribed message
    - **Property 4: In-theme error mapping never leaks raw technical details** — **Validates: Requirements 2.4, 2.5, 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5**

  - [ ]* 9.5 Write PBT for medium route graceful degradation (with env mocked)
    - For arbitrary `textContent`/`title`: unset key → `{ok:true, skipped:true, summary:null, causeOfDeath:null}` with no AI call; mocked AI timeout/error/empty → `{ok:false}` with no raw error string
    - **Property 5: Graceful AI degradation** — **Validates: Requirements 4.4, 4.6, 5.7**

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all PBT tasks (group 9) are nice-to-have and not a blocker for v1.
- Each task references specific requirements for traceability.
- The design uses TypeScript (Next.js App Router) throughout, so all code examples are TypeScript.
- `lib/seance.ts` is isomorphic (no Node-only deps) so the client can import `isValidUrl` and the message map; `lib/seance-server.ts` imports `jsdom`/`@mozilla/readability` and is imported only by Route Handlers to keep jsdom out of the client bundle.
- `maxDuration` (60s lookup, 30s medium) is the Vercel function-duration ceiling, distinct from the per-operation 20s `AbortController` timeouts that enforce Reqs 2.5/3.3/4.6.
- The one deliberate extra dependency is DOMPurify, justified by rendering untrusted archived HTML; it is the security boundary between archived HTML and the Visitor's browser.
- Verify each `EXAMPLE_DEAD_LINKS` URL resolves to a real Wayback snapshot near its Timestamp_Hint at dev time; swap a non-resolving example if needed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "7.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.1", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 3, "tasks": ["6.1", "9.5"] }
  ]
}
```
