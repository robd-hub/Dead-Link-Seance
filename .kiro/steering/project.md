---
inclusion: always
description: House rules for the Dead Link Séance project — identity, stack, architecture, Wayback/AI integration, style, and scope constraints.
---

# Dead Link Séance — House Rules

A Halloween-themed web app for the Kiroween hackathon (Resurrection category). A visitor pastes a dead web link; the app finds the most recent saved copy in the Internet Archive Wayback Machine, extracts the readable text, and an AI "medium" brings the page back as a clean modern page with a short summary.

## Tech stack

- Next.js (App Router) with TypeScript, deployed on Vercel.
- Readable-text extraction: `@mozilla/readability` + `jsdom`.
- No database. No backend state. No auth. Few files.

## Architecture

- All calls to archive.org and to the AI happen in server-side API routes (Next.js Route Handlers under `app/api/**`). Never call them from the browser/client.
- Keep the client thin: it only submits a URL and renders the result.

## Wayback Machine integration

- Availability lookup: `https://archive.org/wayback/available?url=<url>`. Use the most recent snapshot returned.
- Fetch the raw snapshot by inserting `id_` after the timestamp: `https://web.archive.org/web/<timestamp>id_/<url>`.
- Run the fetched HTML through `@mozilla/readability` (with `jsdom`) to extract the readable article text.

## AI "medium" integration

- Use any OpenAI-compatible Chat Completions API, configured by env vars: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
- Always send a system message (sets the medium/séance persona and the output format).
- Never hard-code keys in source. Never commit `.env` files — keep `.env` gitignored.
- If no AI key is set, still show the cleaned page without the summary. The summary is a graceful enhancement, not a hard dependency.

## Style & UX

- Spooky but readable: dark background, candle-glow accents, séance/ouija theme.
- Mobile friendly.
- Friendly, in-theme error messages — e.g. "The spirits could not find this page" instead of raw errors. Handle Wayback misses and fetch failures gracefully.

## Working rules

- Keep it small and simple: few files, no over-engineering, no unused abstractions.
- No database, no auth, no user accounts.
- Write a short `README.md` explaining how to run it (install, env vars, dev/build) and how Kiro was used to build it.
