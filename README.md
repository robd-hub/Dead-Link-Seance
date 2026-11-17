# Dead Link Séance 🔮🕯️

A Halloween-themed web app built for the **Kiroween hackathon** (Resurrection category).

A visitor pastes a dead web link. The app finds the most recent saved copy of that page in the [Internet Archive Wayback Machine](https://web.archive.org), extracts the readable text, and an AI "medium" brings the page back as a clean modern page with a short summary spoken in a friendly ghost voice — plus a guess at the page's cause of death.

Optionally, you can pass a **Timestamp hint** (`YYYYMMDD`) to bias snapshot selection toward a date when the site was alive, rather than always taking the newest snapshot.

## Prerequisites

- [Node.js](https://nodejs.org) (v20 or later recommended)
- npm (bundled with Node.js)

## Install

```bash
npm install
```

## Environment variables

The app works with no configuration. All variables are optional; set them only to enable the AI "medium" (summary + cause of death).

| Variable | Required? | Default | Purpose |
| --- | --- | --- | --- |
| `AI_BASE_URL` | Optional | `https://api.openai.com/v1` | Base URL of an OpenAI-compatible Chat Completions API |
| `AI_API_KEY` | Optional | _(unset)_ | Enables the medium. When unset or empty, the app still shows the restored page **without** a summary or cause of death |
| `AI_MODEL` | Optional | `gpt-4o-mini` | The model name to use for completions |

Copy `.env.example` to `.env` and fill in values to enable the medium:

```bash
cp .env.example .env
```

> **Never commit real API keys.** `.env` is gitignored (see `.gitignore`). Only `.env.example` is tracked, and it must never contain real secrets.

## Commands

```bash
npm run dev     # Start the development server (http://localhost:3000)
npm run build   # Production build
npm run start   # Serve the production build
npm run lint    # Lint with ESLint
```

### Deploy on Vercel

Deploy by importing this repository into a [Vercel project](https://vercel.com) (or pushing to a connected Vercel repo). Set the environment variables above in the Vercel dashboard under **Project → Settings → Environment Variables** if you want the medium enabled in production.

The API routes set Vercel function-duration ceilings so their 20-second internal timeouts fit comfortably within Vercel's per-request limits:

- `app/api/lookup/route.ts` → `maxDuration = 60` (two sequential 20s fetches with margin)
- `app/api/medium/route.ts` → `maxDuration = 30` (one 20s AI call with margin)

## How Kiro was used

This project was built with [Kiro](https://kiro.dev):

- A `.kiro/steering/project.md` file set the **house rules** — the app's identity, tech stack, Wayback/AI integration, séance style, and scope constraints.
- Kiro's **spec-driven workflow** produced the `requirements → design → tasks` documents under `.kiro/specs/dead-link-seance/`, which then guided the implementation.
