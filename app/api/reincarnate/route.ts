/**
 * app/api/reincarnate/route.ts — rebuild a dead page as a modern website.
 *
 * Takes the restored page's text and asks the same OpenAI-compatible model as
 * the medium (AI_BASE_URL, AI_API_KEY, AI_MODEL) to design a fresh one-page
 * site for the product "as if it relaunched today". Returns one HTML document.
 *
 * Safety: the HTML is sanitized (no scripts, forms, frames or event handlers)
 * and gets a strict Content-Security-Policy that blocks every network request,
 * so the page can only use its own inline CSS and data: images. The client
 * also renders it in a fully sandboxed iframe.
 */

import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/seance-server";
import { extractHtmlDocument, sanitizeReincarnation } from "@/lib/reincarnate-server";
import type { ReincarnateResponse } from "@/lib/seance";

export const maxDuration = 60;

const MAX_INPUT_CHARS = 5000;

const SYSTEM_MESSAGE = (year: string) =>
  [
    "You are a web designer who reincarnates dead websites.",
    "Given the text of an old web page, design the site REBORN: a bold, polished landing page for the same product",
    "as if it were alive, thriving and launching today. Imagine its relaunch: a striking hero with a big headline and",
    "a call-to-action button, a features section, a short 'why it's back' section, and a footer.",
    "Give it a confident brand colour palette that suits the product, generous spacing, rounded cards, subtle gradients",
    "and big friendly typography (system font stack). Write upbeat modern copy. Do not dwell on the shutdown.",
    "Rules: reply with ONE complete HTML document only, starting with <!doctype html>. No markdown, no code fences,",
    "no explanation. All CSS inline in one <style> tag. No JavaScript. No external fonts, images, scripts or links to",
    "other files; use CSS gradients, emoji and inline SVG for visuals. Keep the site's real name, purpose and key facts",
    "from the old text; do not invent prices, people or statistics. Responsive and accessible (good contrast, semantic",
    `headings). Include a small footer line: "Reincarnated by Dead Link Séance from a ${year} snapshot."`,
    "Keep it under about 9,000 characters.",
  ].join(" ");

function fail(message: string, status = 200): Response {
  const body: ReincarnateResponse = { ok: false, message };
  return NextResponse.json(body, { status });
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return fail("The spirits need an AI key to reincarnate pages.");

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const text = str(body.textContent, MAX_INPUT_CHARS);
    const title = str(body.title, 200) || "Untitled page";
    const url = str(body.url, 2048);
    const year = /^\d{4}$/.test(str(body.year, 4)) ? str(body.year, 4) : "past";
    if (!text) return fail("There was not enough of this page left to reincarnate.");

    const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = process.env.AI_MODEL?.trim() || "gpt-4o-mini";

    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          max_tokens: 6000,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE(year) },
            {
              role: "user",
              content: `Site: ${title} (${url}), snapshot from ${year}.\n\nOld page text:\n${text}`,
            },
          ],
        }),
      },
      50000,
    );
    if (!res.ok) {
      console.error(`reincarnate: AI call failed with HTTP ${res.status} (model ${model})`);
      return fail("The spirit could not find a new body. Try again.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const raw = data.choices?.[0]?.message?.content;
    const doc = typeof raw === "string" ? extractHtmlDocument(raw) : null;
    if (!doc) return fail("The spirit could not find a new body. Try again.");

    const out: ReincarnateResponse = { ok: true, html: sanitizeReincarnation(doc) };
    return NextResponse.json(out);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return fail(
      name === "AbortError" || name === "TimeoutError"
        ? "The reincarnation took too long. Try again."
        : "The spirit could not find a new body. Try again.",
    );
  }
}
