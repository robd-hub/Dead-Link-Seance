# Design Document

## Overview

Dead Link Séance is a small Next.js (App Router) + TypeScript web app for the Kiroween hackathon (Resurrection category). A Visitor pastes a dead link on a ouija-board home page; the app finds the most recent saved copy in the Internet Archive Wayback Machine, extracts the readable article text, and an AI "medium" produces a short, in-character summary plus a guess at why the page died. The result is shown on a results page as a clean modern page.

This design keeps the surface intentionally lean: **four route/page files** plus a minimal shared `lib/`. There is no database, no persistent state, and no authentication. All calls to archive.org and to the OpenAI-compatible AI endpoint happen server-side in Route Handlers under `app/api/**`; the client only submits a URL and renders the result.

Research findings that shaped this design (sources cited inline where used):

- The Wayback availability endpoint `https://archive.org/wayback/available?url=<url>` returns a JSON object whose `archived_snapshots.closest` holds a single snapshot: `{ status, available, url, timestamp }`, where `timestamp` is a 14-digit UTC string `YYYYMMDDhhmmss`. `closest` is already the most recent capture ([Internet Archive Developer Portal — availability tutorial](https://archive.org/developers/tutorial-get-snapshot-wayback.html)).
- Inserting `id_` immediately after the timestamp in a replay URL returns the original archived bytes without the Wayback toolbar/rewriting: `https://web.archive.org/web/<timestamp>id_/<url>` ([Wayback Machine API guide — dataimpulse.com](https://dataimpulse.com/blog/wayback-machine-api/)).
- Vercel Hobby functions can run up to 60 seconds via `export const maxDuration`, raised from the earlier 10s ceiling ([Vercel changelog — Hobby 60s](https://vercel.com/changelog/vercel-functions-for-hobby-can-now-run-up-to-60-seconds)). This matters because the combined lookup+extract route has two sequential 20s-capped network operations.

## Architecture

### High-level flow

```mermaid
flowchart LR
    V[Visitor] -->|paste URL + Summon| Home["app/page.tsx<br/>(home, client)"]
    Home -->|validate client-side<br/>navigate /results?url=[&timestamp=hint]| Results["app/results/page.tsx<br/>(results, client)"]
    Results -->|GET /api/lookup?url=[&timestamp=hint]| Lookup["app/api/lookup/route.ts<br/>(lookup + extract)"]
    Lookup -->|1. availability| WB1[(archive.org<br/>availability)]
    Lookup -->|2. raw snapshot id_| WB2[(web.archive.org<br/>raw snapshot)]
    Results -->|POST /api/medium<br/>{textContent,title}| Medium["app/api/medium/route.ts<br/>(AI medium)"]
    Medium -->|Chat Completions| AI[(OpenAI-compatible<br/>API)]
    Results -->|render title, text,<br/>date, archive link,<br/>summary+cause| V
```

The client never calls archive.org or the AI directly. The results page orchestrates two calls to our own Route Handlers: first the combined lookup+extract route (Requirements 2 + 3), then, on success, the medium route (Requirement 4).

### Why a combined lookup+extract route (Requirements 2 + 3)

The user direction mandates a single Route Handler that performs the Wayback availability lookup, picks the most recent snapshot, fetches the raw snapshot via the `id_` trick, and runs the HTML through `@mozilla/readability` + `jsdom`. This avoids an extra HTTP round-trip between the client and our own backend and keeps the route count to one for restoration. The two sequential 20s-capped network calls (availability, then raw fetch) define this route's worst-case runtime (~40s), which drives its `maxDuration`.

### Statelessness

Every request re-fetches from the Wayback Machine and (optionally) the AI. No database, no cache, no session, no auth. The only persisted state is environment variables for the AI key/base-URL/model.

### Rendering untrusted archived HTML

The restored text comes from an archived page we do not control. `@mozilla/readability` strips scripts and styles and produces a cleaned article fragment (`content`) plus plain text (`textContent`). To satisfy "no raw HTML markup visible to the user" safely, the results page renders Readability's `content` sanitized through **DOMPurify** before injecting it (the one deliberate extra dependency, justified by rendering untrusted HTML). This is the security boundary between archived HTML and the Visitor's browser. If an implementer prefers zero extra dependencies, the fallback is to render `textContent` as escaped plain text with paragraph splitting — safe but with poorer formatting. The primary design uses DOMPurify.

## Components and Interfaces

### Project / file layout

The core surface is exactly four route/page files. Everything else is boilerplate or one shared lib split for bundle hygiene.

```
/
  app/
    layout.tsx          # root layout (boilerplate: html/body, global theme)
    page.tsx            # (1) home page — ouija board input + examples  [CLIENT]
    results/
      page.tsx          # (2) results page — renders restored content     [CLIENT]
    api/
      lookup/
        route.ts        # (3) combined Wayback lookup + extract          [SERVER Route Handler]
      medium/
        route.ts        # (4) AI medium — summary + cause of death       [SERVER Route Handler]
  lib/
    seance.ts           # isomorphic pure helpers + types + in-theme message map (importable by client)
    seance-server.ts    # server-only: fetchWithTimeout, extractReadable (jsdom/Readability) — never imported by client
  .env.example
  .gitignore            # ignores .env, node_modules, .next
  README.md
  package.json
  tsconfig.json
  next.config.*
```

`lib/seance.ts` is isomorphic (no Node-only deps) so the client can import `isValidUrl` and the message map; this keeps client- and server-side URL validation identical. `lib/seance-server.ts` imports `jsdom` and `@mozilla/readability`, so it is imported only by the Route Handlers — keeping jsdom out of the client bundle.

### (1) Home page — `app/page.tsx` (`"use client"`)

**Responsibility:** render the ouija-board input, validate the URL client-side, and navigate to the results page.

- `Ouija_Input`: `<input type="text" maxLength={2048}>`. Accepts a URL up to 2048 characters (Req 1.1).
- `Summon_Button`: submit button. Min 44×44 px touch target; layout fits within viewport at ≤768 px with no horizontal scrolling (Req 1.5).
- Three `Example_Dead_Links` (Req 1.3, see [Example Dead Links](#example-dead-links)). Each example is a `{ url, timestamp }` pair; selecting one populates **both** the `Ouija_Input` with its URL and the Timestamp_Hint with its alive-era date. (Req 1.4 currently specifies only that the URL is populated; this design closes the loop by wiring the hint through — the example data structure carries `{ url, timestamp }` and selecting an example sets both.)
- Theme: dark background (`#0b0b12`), candle-glow accents, warm off-white body text (`#f4e9d8`). The body-text/background contrast is ≥ 4.5:1 (computed: ~14:1), satisfying Req 1.2.
- The page holds the selected example's Timestamp_Hint in state (empty when the Visitor types a URL directly). On submit: run `isValidUrl(value)` (from `lib/seance`). If invalid/empty → show the in-theme message `"That is not a valid link."` and do **not** submit (Req 1.6). If valid → `router.push('/results?url=' + encodeURIComponent(value) + (hint ? '&timestamp=' + hint : ''))`, forwarding the hint to the results page.

### (2) Results page — `app/results/page.tsx` (`"use client"`)

**Responsibility:** read the URL, fetch restoration then the medium, and render the result or an in-theme error.

- Reads `url` and the optional `timestamp` (the Timestamp_Hint) from `useSearchParams()`.
- State machine: `loading` → `success` | `error`; plus `summary`, `causeOfDeath`.
- On mount (`useEffect`):
  1. `fetch('/api/lookup?url=' + encodeURIComponent(url) + (timestamp ? '&timestamp=' + timestamp : ''))` → JSON, forwarding the hint to the lookup route as the `timestamp` query parameter (Req 2.7).
     - `ok: true` → store `title`, `content` (cleaned HTML), `textContent` (plain), `snapshotTimestamp`, `snapshotDate`, `archiveUrl`. Then proceed to step 2.
     - `ok: false` → store `error` (the in-theme string) and stop.
  2. `fetch('/api/medium', { method:'POST', body: JSON.stringify({ textContent, title }) })` → JSON.
     - `ok: true` with non-empty `summary` and `causeOfDeath` → store them.
     - `ok: true, skipped: true` (no AI key) or `ok: false` (AI failure/timeout/empty) → leave summary/cause absent (graceful; Req 4.4, 4.6, 5.7).
- Render:
  - **Loading:** themed "Summoning…" state.
  - **Error:** the in-theme message + a "Return to the board" link to `/`.
  - **Success:** title; the Summary and Cause of Death **above** the restored text when both are non-empty (Req 5.4); the Snapshot date (Req 5.2); an `Archive_Copy_Link` anchor to `archiveUrl` (Req 5.3); the restored text rendered from sanitized `content` so no raw HTML markup is visible (Req 5.1); a "Summon another" link to `/`.
  - **Responsive:** at ≤640 px, no horizontal scrolling, text wraps to viewport (Req 5.6).

### (3) Lookup+extract route — `app/api/lookup/route.ts` (Route Handler, GET)

**Responsibility:** Wayback availability lookup → closest-to-hint (or most-recent when no hint) snapshot → fetch raw snapshot → extract title + readable text. Returns an in-theme error on every failure mode.

```ts
export const maxDuration = 60; // Hobby ceiling; fits two sequential 20s ops (~40s worst case) with margin
```

`maxDuration` is the Vercel function-duration limit and is **distinct** from the per-operation 20s `AbortController` timeouts that enforce Reqs 2.5/3.3.

**Request:** `GET /api/lookup?url=<encoded URL>&timestamp=<optional 8-digit YYYYMMDD hint>`.

**Algorithm:**

1. Validate `url` with `isValidUrl`. If invalid → `{ ok:false, error: msg('INVALID_URL') }` (Req 2.3). Read the optional `timestamp` query param (the Timestamp_Hint). If present, it must be exactly 8 digits; a malformed hint is treated as invalid input → `{ ok:false, error: msg('INVALID_URL') }` for consistency with the in-theme invalid-link message (Req 2.7, 6.1).
2. Build the availability URL: `https://archive.org/wayback/available?url=<encoded url>`, appending `&timestamp=<hint>` when a valid hint is present (Req 2.7). `fetchWithTimeout(availabilityUrl, {}, 20000)`.
   - On abort/timeout → `{ ok:false, error: msg('TIMEOUT') }` (Req 2.5).
   - On non-2xx/network error → `{ ok:false, error: msg('UNREACHABLE') }` (Req 6.4).
3. Parse JSON. Extract the snapshot(s) from `archived_snapshots`. The availability API returns a single `closest` (closest to the hint when one was passed, otherwise the most recent); `selectSnapshot(snapshots, hint)` returns it — and is generalized to pick the closest-to-hint (or max-timestamp when no hint) if multiple ever appear (Req 2.2). If none or `available !== true` → `{ ok:false, error: msg('NOT_FOUND') }` (Req 2.4).
4. Build the raw URL: `buildRawSnapshotUrl(timestamp, url)` → `https://web.archive.org/web/<timestamp>id_/<url>` (Req 3.1).
5. `fetchWithTimeout(rawUrl, {}, 20000)` for the raw snapshot bytes.
   - On abort/timeout → `TIMEOUT` (Req 3.3); on non-2xx/network error → `UNREACHABLE` (Req 6.4).
6. `extractReadable(html, finalUrl)` (Readability + jsdom) → `{ title, content, textContent } | null`. If `null`/empty (jsdom parse fail or Readability yields no text) → `{ ok:false, error: msg('UNREADABLE') }` (Req 3.4). Wrap all extraction in try/catch so the route never crashes to the client.
7. Success → return the envelope below.

**Response (success):**

```json
{
  "ok": true,
  "title": "Google Reader",
  "content": "<cleaned article HTML from Readability>",
  "textContent": "plain readable text",
  "snapshotTimestamp": "20130628094127",
  "snapshotDate": "2013-06-28",
  "archiveUrl": "https://web.archive.org/web/20130628094127/https://www.google.com/reader/"
}
```

`snapshotDate` is a human-readable rendering derived from the 14-digit `snapshotTimestamp` (UTC). `archiveUrl` is the standard replay URL (`/<timestamp>/<url>`, **without** `id_`) so the Visitor sees the archived page in context.

**Response (error):**

```json
{ "ok": false, "error": "The spirits could not find this page." }
```

`error` is always one of the fixed in-theme strings (see [Error Handling](#error-handling)); never a raw exception, status code, or library message.

### (4) Medium route — `app/api/medium/route.ts` (Route Handler, POST)

**Responsibility:** call the OpenAI-compatible Chat Completions API with a séance system message and return the Summary + Cause of Death, with graceful degradation when AI is unavailable or fails.

```ts
export const maxDuration = 30; // fits one 20s AI timeout with margin; distinct from the 20s AbortController timeout
```

**Request (POST, JSON):**

```json
{ "textContent": "the readable text", "title": "the page title" }
```

**Algorithm:**

1. If `process.env.AI_API_KEY` is unset/empty → return `{ ok:true, skipped:true, summary:null, causeOfDeath:null }` **without** calling the AI (Req 4.4). No raw error.
2. Resolve config: `AI_BASE_URL` (default `https://api.openai.com/v1` if unset), `AI_MODEL` (default `gpt-4o-mini` if unset), `AI_API_KEY`. Keys read only from `process.env`, never hard-coded; `.env` gitignored (Req 4.5).
3. Build messages: a system message (the séance persona + output format) and a user message containing `title` + `textContent` (truncated to a safe token budget if very long).
4. `fetchWithTimeout(baseURL + '/chat/completions', { method:'POST', headers:{ Authorization:'Bearer '+key, 'Content-Type':'application/json' }, body: JSON.stringify({ model, messages, response_format:{ type:'json_object' } }) }, 20000)` (Req 4.1).
   - On abort/timeout or non-2xx/network error → `{ ok:false }` (graceful, no raw error) (Req 4.6).
5. Parse the AI JSON. Extract `summary` and `cause_of_death`. If parsing fails or either is empty → `{ ok:false }` (graceful) (Req 4.6, 5.7).
6. Return the envelope below.

**System message (Req 4.2):** a constant string setting the séance/medium persona and requesting exactly:

> A three-sentence `summary` of the page written in the voice of a friendly ghost, and a `cause_of_death` of at most one sentence guessing why the page died (e.g., domain expired, site moved, company shut down). Respond only as JSON `{"summary": "...", "cause_of_death": "..."}`.

**Response (success):**

```json
{ "ok": true, "summary": "...", "causeOfDeath": "..." }
```

**Response (no key / graceful):**

```json
{ "ok": true, "skipped": true, "summary": null, "causeOfDeath": null }
```

**Response (AI failure/timeout/empty):**

```json
{ "ok": false }
```

The results page treats `skipped` and `ok:false` identically: show the restored text without a summary. The medium route never exposes a raw error string (Req 4.6, 6.5).

### Shared lib

**`lib/seance.ts`** (isomorphic — imported by client and server):

- `isValidUrl(s: string): boolean` — `true` iff `new URL(s)` succeeds and `protocol` is `http:` or `https:`. Rejects empty, whitespace-only, and non-http(s) schemes.
- `selectSnapshot(snapshots: {timestamp:string}[], hint?: string): {timestamp:string} | null` — when `hint` (an 8-digit YYYYMMDD string) is provided, returns the snapshot closest to the hint (the hint is compared against each timestamp's date portion; equivalently, pad the hint to `YYYYMMDD000000` and minimize the absolute difference); when no hint, returns the entry with the maximum timestamp (lexicographic == chronological for 14-digit UTC). Returns `null` for an empty list.
- `buildRawSnapshotUrl(timestamp: string, url: string): string` — `https://web.archive.org/web/${timestamp}id_/${url}`.
- `IN_THEME_MESSAGES` — the fixed allowlist and `msg(kind)` accessor:
  - `INVALID_URL` → `"That is not a valid link."`
  - `NOT_FOUND` → `"The spirits could not find this page."`
  - `TIMEOUT` → `"The archive is too slow."`
  - `UNREACHABLE` → `"The archive could not be reached."`
  - `UNREADABLE` → `"The page could not be restored."`
- `mapErrorToInTheme(err: unknown): { kind, message }` — classifies any thrown value (AbortError/timeout → `TIMEOUT`; no-snapshot → `NOT_FOUND`; parse/empty → `UNREADABLE`; everything else → `UNREACHABLE`) and returns the corresponding in-theme string. Never leaks raw error text.
- Shared `types` (the response envelopes above).

**`lib/seance-server.ts`** (server-only — imported only by Route Handlers):

- `fetchWithTimeout(url, opts, timeoutMs)` — `fetch` with an `AbortController` set to abort at `timeoutMs`; clears the timer in `finally`. Throws an `AbortError`/DOMException on timeout that `mapErrorToInTheme` classifies as `TIMEOUT`.
- `extractReadable(html: string, finalUrl: string): { title, content, textContent } | null` — constructs a `JSDOM`, wraps `dom.window.document` in `Readability`, calls `parse()`. Returns `{ title, content, textContent }` when `parse()` yields a non-empty article, else `null`. Catches jsdom/Readability failures and returns `null` (so the route maps to `UNREADABLE`, never crashes).

### Example Dead Links

Three famous discontinued products, each carrying a Timestamp_Hint (an 8-digit YYYYMMDD date from when the site was alive), chosen for extensive, reliable Wayback coverage (Req 1.3, 2.7):

| Site | URL | Timestamp_Hint | Shutdown |
|------|-----|----------------|----------|
| Google Reader | `https://www.google.com/reader/` | `20120601` | July 2013 |
| Vine | `https://vine.co/` | `20150601` | January 2017 |
| Google+ | `https://plus.google.com/` | `20160601` | April 2019 |

**Verification step (honesty note):** these are selected for guaranteed snapshot availability, but the implementation **must** verify each resolves to a real snapshot near its Timestamp_Hint at dev time (call the availability endpoint for each with the hint). If any is found not to resolve near its date, swap it for another famous dead site — e.g., a Geocities page (`https://geocities.com/` or a specific GeoCities neighborhood URL) with its own alive-era date. The design does not assume availability; it verifies.

## Data Models

There is no database. The only "data models" are the JSON envelopes passed between pages and routes, and the env-var config.

### Response envelopes (TypeScript)

```ts
// lib/seance.ts
export type ErrorKind = 'INVALID_URL' | 'NOT_FOUND' | 'TIMEOUT' | 'UNREACHABLE' | 'UNREADABLE';

export interface LookupSuccess {
  ok: true;
  title: string;
  content: string;        // cleaned article HTML (Readability) — sanitized before render
  textContent: string;    // plain readable text — sent to the medium route
  snapshotTimestamp: string; // 14-digit UTC YYYYMMDDhhmmss
  snapshotDate: string;      // human-readable, e.g. "2013-06-28"
  archiveUrl: string;       // replay URL without id_
}
export interface LookupError { ok: false; error: string } // error is from IN_THEME_MESSAGES

export interface MediumSuccess { ok: true; summary: string; causeOfDeath: string }
export interface MediumSkipped { ok: true; skipped: true; summary: null; causeOfDeath: null }
export interface MediumFailure { ok: false } // graceful — client shows no summary
export type MediumResponse = MediumSuccess | MediumSkipped | MediumFailure;
```

### Wayback availability API shape (external, read-only)

As returned by `https://archive.org/wayback/available?url=<url>`:

```ts
interface AvailabilityResponse {
  url: string;
  archived_snapshots?: {
    closest?: {
      status: string;     // e.g. "200"
      available: boolean;
      url: string;        // replay URL, e.g. http://web.archive.org/web/20180427130634/https://...
      timestamp: string;  // 14-digit UTC
    };
  };
}
```

### Environment variables

| Variable | Required? | Purpose | Default if unset |
|----------|-----------|---------|------------------|
| `AI_API_KEY` | Optional | Enables the AI medium. If unset, restored text is shown with no summary (Req 4.4). | (none — AI disabled) |
| `AI_BASE_URL` | Optional | Base URL of an OpenAI-compatible Chat Completions API. | `https://api.openai.com/v1` |
| `AI_MODEL` | Optional | Model name to send to the API. | `gpt-4o-mini` |

Keys live only in environment variables / `.env` (gitignored); never hard-coded in source (Req 4.5).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

PBT applies narrowly here. This is mostly a Next.js UI + HTTP-integration app, where PBT is not appropriate (UI rendering, external service calls, build/deploy config). PBT **is** appropriate for the small set of **pure functions** in `lib/seance.ts` and the medium route's config-gate logic, where behavior varies with input and 100+ iterations cheaply exercise edge cases. The five properties below are the consolidated result of the prework analysis and reflection.

### Property 1: URL validity classification

*For any* string `s`, `isValidUrl(s)` is `true` if and only if `new URL(s)` succeeds and `s`'s scheme is `http` or `https`. All empty strings, whitespace-only strings, strings with a non-http(s) scheme (e.g., `ftp:`, `mailto:`, `file:`), and strings that are relative or otherwise not absolute URLs yield `false`.

**Validates: Requirements 1.6, 2.3, 6.1**

### Property 2: Snapshot selection respects the Timestamp_Hint

*For any* non-empty list of snapshots each carrying a 14-digit UTC timestamp and any optional 8-digit YYYYMMDD hint, `selectSnapshot` returns the snapshot closest to the hint when a hint is provided, and the snapshot with the maximum timestamp when no hint is provided. Closeness compares the hint against each timestamp's date portion (equivalently, the hint padded to `YYYYMMDD000000`); because 14-digit UTC timestamps are fixed-width and zero-padded, the lexicographically greatest timestamp equals the chronologically latest. When the list is empty it returns `null` regardless of the hint.

**Validates: Requirements 2.2, 2.7**

### Property 3: Raw snapshot URL construction

*For any* 14-digit timestamp `ts` and any URL `u`, `buildRawSnapshotUrl(ts, u)` equals `https://web.archive.org/web/<ts>id_/<u>`, places `id_` immediately after `<ts>` and before the next `/`, and preserves `u` verbatim. The constructed URL always contains exactly one `id_` marker and it is adjacent to the timestamp.

**Validates: Requirements 3.1**

### Property 4: In-theme error mapping never leaks raw technical details

*For any* thrown error value — including ones whose messages or stack traces contain HTTP status codes, exception text, library names, or network error text — `mapErrorToInTheme` returns a message drawn from the fixed `IN_THEME_MESSAGES` allowlist (`INVALID_URL`, `NOT_FOUND`, `TIMEOUT`, `UNREACHABLE`, `UNREADABLE`), each mapped to its prescribed in-theme string. The returned message contains none of the raw error's substrings: no stack traces, no HTTP status codes, no exception messages, and no library or network error text. Each failure kind maps to its prescribed message: a timeout/abort maps to `TIMEOUT`; a missing snapshot maps to `NOT_FOUND`; a parse/empty-extraction failure maps to `UNREADABLE`; an invalid URL maps to `INVALID_URL`; any other failure maps to `UNREACHABLE`.

**Validates: Requirements 2.4, 2.5, 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 5: Graceful AI degradation

*For any* `textContent` and `title` input, the medium route exposes no raw error and produces no summary when the AI is unavailable or fails: when `AI_API_KEY` is unset it returns `{ ok:true, skipped:true, summary:null, causeOfDeath:null }` without calling the AI; when the AI request times out, errors, or returns empty/unparseable output, it returns `{ ok:false }`. In both cases the response contains no raw error string, no stack trace, and no HTTP status, and `summary`/`causeOfDeath` are absent/null so the results page renders only the restored text.

**Validates: Requirements 4.4, 4.6, 5.7**

## Error Handling

All user-facing errors are in-theme séance/ouija messages drawn from the fixed allowlist in `lib/seance.ts`. No raw technical detail — stack traces, exception messages, HTTP status codes, or library/network error text — ever reaches the Visitor (Req 6.5).

### Failure → in-theme message mapping

| Failure mode | Kind | In-theme message | Requirement |
|--------------|------|------------------|-------------|
| Empty/invalid (non http/https) URL | `INVALID_URL` | "That is not a valid link." | 1.6, 2.3, 6.1 |
| Malformed Timestamp_Hint (present but not exactly 8 digits) | `INVALID_URL` | "That is not a valid link." | 2.7, 6.1 |
| Availability returns no available snapshot | `NOT_FOUND` | "The spirits could not find this page." | 2.4, 6.2 |
| Any operation exceeds 20s (abort/timeout) | `TIMEOUT` | "The archive is too slow." | 2.5, 3.3, 6.3 |
| Other archive lookup/fetch failure (network/non-2xx) | `UNREACHABLE` | "The archive could not be reached." | 6.4 |
| jsdom parse fail / Readability yields no text | `UNREADABLE` | "The page could not be restored." | 3.4 |

### Where errors surface

- **Invalid URL** is caught client-side on the home page (Req 1.6) and shown there without navigating; the route also validates server-side (defense in depth, Req 2.3). A malformed Timestamp_Hint is rejected server-side by the lookup route as `INVALID_URL` (Req 2.7).
- **Lookup/extract failures** (`NOT_FOUND`, `TIMEOUT`, `UNREACHABLE`, `UNREADABLE`) are returned by `/api/lookup` as `{ ok:false, error }` and rendered on the results page as the in-theme message plus a "Return to the board" link.
- **Medium failures** (no key, timeout, error, empty) are **not** errors shown to the Visitor — the results page simply omits the Summary/Cause of Death and still shows the restored text (Req 4.4, 4.6, 5.7).

### No-crash guarantees

- `extractReadable` wraps jsdom/Readability in try/catch and returns `null` on any failure; the route maps `null` to `UNREADABLE` and never throws to the client (Req 3.4).
- The medium route wraps the AI call and JSON parsing so any failure yields the graceful no-summary response (Req 4.6).
- `maxDuration` (60s lookup, 30s medium) is the Vercel function-duration ceiling and is distinct from the per-operation 20s `AbortController` timeouts that enforce Reqs 2.5/3.3/4.6. The chosen values fit the worst case with margin: lookup does two sequential 20s operations (~40s, so 60s ceiling); medium does one 20s operation (so 30s ceiling).

## Testing Strategy

### Dual approach

- **Property-based tests** (PBT) for the pure helpers in `lib/seance.ts` and the medium route's config gate — using a PBT library for the stack (e.g., `fast-check` for TypeScript). Each property test runs a minimum of 100 iterations and is tagged `Feature: dead-link-seance, Property {n}: {text}`.
- **Unit / example tests** for specific UI interactions, conditional rendering, and the system-message constant.
- **Integration tests** for external service wiring (Wayback availability, raw snapshot fetch, AI call) using mocked HTTP (e.g., `msw` or `fetch` mocks) plus 1–3 real archived pages for end-to-end sanity.
- **Smoke checks** for build, architecture constraints, config security, and README contents.

### Property-based tests (PBT)

Implement each design property as a single property-based test (minimum 100 iterations), each tagged with a comment referencing the design property:

- **Property 1 — URL validity classification** (`isValidUrl`): generate arbitrary strings (including whitespace, missing scheme, `ftp:`/`mailto:`/`file:`, relative URLs, valid http/https URLs) and assert the predicate matches the `new URL` + scheme rule. Tag: `Feature: dead-link-seance, Property 1: URL validity classification`.
- **Property 2 — Snapshot selection respects the Timestamp_Hint** (`selectSnapshot`): generate arbitrary non-empty lists of 14-digit timestamps with and without an 8-digit hint; with a hint assert the returned timestamp is the closest to the hint, without a hint assert it is the lexicographic/chronological max. Tag: `Feature: dead-link-seance, Property 2: Snapshot selection respects the Timestamp_Hint`.
- **Property 3 — Raw snapshot URL construction** (`buildRawSnapshotUrl`): generate arbitrary timestamps and URLs and assert the output template, the `id_` placement adjacent to the timestamp, and exact-one `id_` marker. Tag: `Feature: dead-link-seance, Property 3: Raw snapshot URL construction`.
- **Property 4 — In-theme error mapping** (`mapErrorToInTheme`): generate arbitrary errors whose messages/stacks embed HTTP codes, exception text, library/network strings; assert the mapped message is in the allowlist and shares none of those raw substrings, and that each kind maps to its prescribed message. Tag: `Feature: dead-link-seance, Property 4: In-theme error mapping never leaks raw technical details`.
- **Property 5 — Graceful AI degradation** (medium route with env mocked): for arbitrary `textContent`/`title`, assert unset-key → `{ok:true,skipped:true,...null}` with no AI call, and that mocked AI timeout/error/empty → `{ok:false}` with no raw error string. Tag: `Feature: dead-link-seance, Property 5: Graceful AI degradation`.

### Unit / example tests

- Home page: invalid/empty submit shows "That is not a valid link." and does not navigate; valid submit navigates to `/results?url=`; selecting an example populates the input; input `maxLength=2048`.
- Results page: success renders title, snapshot date, archive link, and (conditionally) summary+cause above the text; no-key and AI-failure cases render text without summary; sanitized content renders with no visible raw tags.
- Medium route system message: assert the constant includes the séance persona, the 3-sentence summary instruction, and the ≤1-sentence cause-of-death instruction (Req 4.2).
- Example link verification: at dev time, assert each of the three example URLs resolves to a real Wayback snapshot; swap a non-resolving example (Req 1.3).

### Integration tests

- Lookup route end-to-end with mocked `fetch` returning a known availability response + raw HTML; assert the correct `id_` URL is requested and the envelope is returned. Plus 1–3 real archived pages (e.g., the three examples) for live sanity.
- `fetchWithTimeout` aborts at ~20s (use a fake/fast clock or a deliberately slow mock).
- Medium route against a mocked OpenAI-compatible endpoint: assert the request includes the system message and the response is parsed; assert a slow/failing/empty AI yields the graceful response.

### Smoke checks

- `npm run build` succeeds; deploys to Vercel without a custom server (Req 7.1).
- No database client, no auth, no persistent state; routes fetch per request (Req 7.2).
- Static check: no client component imports or calls archive.org or the AI endpoint; all such calls are in `app/api/**` (Req 2.6, 7.3).
- No API-key literals in source; `.env` is gitignored; keys read from `process.env` (Req 4.5).
- README contains install steps, dev/build commands, the three env vars with required/optional status, and a "how Kiro was used" section (Req 8.1, 8.2, 8.3).
- Theme contrast: the chosen body-text/background pair computes to ≥ 4.5:1 (Req 1.2).

### What is intentionally not PBT

UI rendering/layout (Req 1.2, 1.5, 5.1–5.6), external service behavior and wiring (Reqs 2.1, 4.1), and build/config checks (Reqs 7.1–7.3, 8.1–8.3) are covered by example, integration, and smoke tests rather than property-based tests, per the PBT applicability guidance.

## README.md Plan

`README.md` will document:

1. **Purpose** — Dead Link Séance, Kiroween Resurrection hackathon; paste a dead link → Wayback restore → AI medium summary.
2. **Prerequisites** — Node.js version, npm.
3. **Install** — `npm install`.
4. **Environment variables** — copy `.env.example` to `.env`; a table giving the required/optional status and default of `AI_BASE_URL` (optional, default OpenAI), `AI_API_KEY` (optional; enables the medium; if unset the restored page shows with no summary), `AI_MODEL` (optional, default `gpt-4o-mini`). Note `.env` is gitignored and keys must never be committed.
5. **Commands** — `npm run dev` (dev), `npm run build` (build), `npm run start` (serve build), and Vercel deploy (push to a connected Vercel project).
6. **How Kiro was used** — Kiro steering (`project.md` house rules) and the spec-driven workflow (requirements → design → tasks) that guided development, identifying the Kiro workflow used.
