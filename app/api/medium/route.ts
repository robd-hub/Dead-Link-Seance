/**
 * app/api/medium/route.ts — the AI "medium" (Requirement 4, Route Handler, POST).
 *
 * Takes the restored page's plain text and title, asks an OpenAI-compatible
 * Chat Completions API (configured only by AI_BASE_URL, AI_API_KEY, AI_MODEL)
 * for a three-sentence friendly-ghost summary and a one-sentence cause of
 * death, and returns them as JSON.
 *
 * Graceful degradation: if AI_API_KEY is unset, the AI is skipped. If the AI
 * call fails, times out (20s), or returns something unusable, the route returns
 * `{ ok: false, summary: null, causeOfDeath: null }` with no raw error, and the
 * results page still shows the restored text.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.7, 7.3
 */

import { NextResponse } from "next/server";
import type { MediumResponse } from "@/lib/seance";
import { fetchWithTimeout } from "@/lib/seance-server";

/** Vercel function-duration ceiling; fits one 20s AI call with margin. */
export const maxDuration = 30;

/** Keep the prompt small and cheap: the medium only needs the gist. */
const MAX_INPUT_CHARS = 6000;

/**
 * The séance persona (Req 4.2). Asks for strict JSON so the reply is easy to
 * parse and never shown raw.
 */
export const SYSTEM_MESSAGE = [
  "You are a friendly ghost medium at a séance, speaking for a web page that has died.",
  "Read the restored text of the page and reply ONLY with a JSON object of the form",
  '{"summary": string, "cause_of_death": string}.',
  "summary: exactly three sentences in the warm, slightly spooky voice of a friendly ghost,",
  "describing what the page was and what it offered visitors. Do not invent facts that are not in the text.",
  "cause_of_death: one short sentence guessing why the page died (for example: domain expired,",
  "product shut down, site moved, company acquired). Phrase it as a guess.",
].join(" ");

const FAILED: MediumResponse = { ok: false, summary: null, causeOfDeath: null };

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    const skipped: MediumResponse = {
      ok: true,
      skipped: true,
      summary: null,
      causeOfDeath: null,
    };
    return NextResponse.json(skipped);
  }

  try {
    const body = (await request.json()) as { textContent?: unknown; title?: unknown };
    const text = cleanString(body.textContent);
    if (!text) return NextResponse.json(FAILED);
    const title = cleanString(body.title) ?? "Untitled page";

    const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = process.env.AI_MODEL?.trim() || "gpt-4o-mini";

    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            {
              role: "user",
              content: `Page title: ${title}\n\nRestored text:\n${text.slice(0, MAX_INPUT_CHARS)}`,
            },
          ],
        }),
      },
      20000,
    );
    if (!res.ok) {
      // Log only the status and model (never the key or page text) so a
      // misconfigured model shows up in the Vercel logs.
      console.error(`medium: AI call failed with HTTP ${res.status} (model ${model})`);
      return NextResponse.json(FAILED);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const raw = cleanString(data.choices?.[0]?.message?.content);
    if (!raw) return NextResponse.json(FAILED);

    // Some models wrap JSON in code fences; take the outermost {...}.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return NextResponse.json(FAILED);
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: unknown;
      cause_of_death?: unknown;
    };

    const summary = cleanString(parsed.summary);
    const causeOfDeath = cleanString(parsed.cause_of_death);
    if (!summary || !causeOfDeath) return NextResponse.json(FAILED);

    const ok: MediumResponse = { ok: true, summary, causeOfDeath };
    return NextResponse.json(ok);
  } catch {
    // Timeout, network error, bad JSON: degrade quietly (Req 4.6).
    return NextResponse.json(FAILED);
  }
}
