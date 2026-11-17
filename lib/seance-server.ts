/**
 * lib/seance-server.ts — SERVER-ONLY helpers for Dead Link Séance.
 *
 * This module imports `jsdom`, `@mozilla/readability`, and `dompurify`, and uses
 * the Web `fetch`. It MUST be imported only by Route Handlers under
 * `app/api/**` — never by client components — so jsdom stays out of the client
 * bundle. Do not import anything from here in a `"use client"` file.
 *
 * Exports:
 *  - fetchWithTimeout(url, opts?, timeoutMs?)  — fetch with an AbortController
 *  - extractReadable(html, finalUrl)           — Readability + DOMPurify; never throws
 *
 * The Route Handlers map thrown values via `mapErrorToInTheme` (from
 * `@/lib/seance`) to the fixed in-theme allowlist. `fetchWithTimeout` is
 * intentionally allowed to throw (its caller maps the error); `extractReadable`
 * never throws — it returns `null`, which the route maps to `UNREADABLE`.
 *
 * Validates: Requirements 2.5, 3.2, 3.3, 3.4, 5.1
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

/**
 * `fetch` wrapped with an `AbortController` that aborts after `timeoutMs`.
 *
 * - Creates a controller and arms a `setTimeout` that calls `controller.abort()`.
 * - Calls `fetch(url, { ...opts, signal: controller.signal })`. Our signal
 *   intentionally overrides any `signal` in `opts` so the timeout governs abort.
 * - `clearTimeout` runs in `finally` on every path (success, abort, error) so no
 *   timer leaks.
 * - On abort (the controller fired), throws an `Error` whose `name` is
 *   `"AbortError"` and whose message contains "timeout", so the caller's
 *   `mapErrorToInTheme(err)` classifies it as `TIMEOUT` (Req 2.5, 3.3).
 * - On any other failure (network error, non-2xx does not throw from `fetch`
 *   itself — callers must check `response.ok`), the original error is re-thrown
 *   as-is so the route maps it via `mapErrorToInTheme` → `UNREACHABLE`.
 *
 * `timeoutMs` defaults to 20000 (the per-operation 20s cap; distinct from the
 * Vercel `maxDuration` function ceiling).
 *
 * Validates: Requirements 2.5, 3.3
 */
export async function fetchWithTimeout(
  url: string,
  opts?: RequestInit,
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    // If our controller aborted, surface a recognizable AbortError so the
    // route's mapErrorToInTheme() maps it to TIMEOUT.
    if (controller.signal.aborted) {
      const abortErr = new Error("timeout");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    // Otherwise re-throw the original error for the route to classify.
    throw err;
  } finally {
    // Always clear the timer — on success, abort, or any error.
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// extractReadable
// ---------------------------------------------------------------------------

/** Return type of a successful extraction. */
export type ReadableArticle = {
  title: string;
  /** Cleaned article HTML from Readability, sanitized through DOMPurify. */
  content: string;
  /** Plain readable text (sent to the medium route). */
  textContent: string;
};

/**
 * Extract a readable article from raw archived HTML using `@mozilla/readability`
 * backed by `jsdom`, then sanitize the resulting HTML through DOMPurify before it
 * can reach the client. This is the security boundary between archived HTML and
 * the Visitor's browser (Req 5.1, 3.4).
 *
 * - Wraps EVERYTHING in try/catch and returns `null` on any failure (jsdom parse
 *   failure, Readability yielding no article, empty text, or a DOMPurify
 *   error). The route maps `null` to `UNREADABLE` (Req 3.4). Never throws.
 * - Builds `new JSDOM(html, { url: finalUrl })` so relative links resolve, then
 *   `new Readability(dom.window.document).parse()`.
 * - If `parse()` returns null/undefined or yields no text, returns `null`.
 * - Sanitizes Readability's `content` (cleaned HTML) through a DOMPurify
 *   instance bound to the JSDOM window, using the safe HTML profile (standard
 *   article tags/attrs; strips scripts, styles, and `on*` event handlers).
 * - `title` comes from `article.title`, falling back to the document `<title>`.
 * - `textContent` prefers Readability's plain text; if empty, derives it from
 *   the sanitized HTML.
 *
 * Validates: Requirements 3.2, 3.4, 5.1
 */
export async function extractReadable(
  html: string,
  finalUrl: string,
): Promise<ReadableArticle | null> {
  try {
    const dom = new JSDOM(html, { url: finalUrl });
    const doc = dom.window.document;

    const article = new Readability(doc).parse();
    if (!article) {
      return null;
    }

    const title = (article.title && article.title.trim()) || doc.title || "";

    // Sanitize the cleaned article HTML through DOMPurify bound to the JSDOM
    // window. USE_PROFILES: { html: true } allows the standard safe HTML tag
    // set and strips <script>/<style> and on* event handlers.
    const purify = DOMPurify(dom.window as unknown as Parameters<typeof DOMPurify>[0]);
    const safeContent = purify.sanitize(article.content ?? "", {
      USE_PROFILES: { html: true },
      // Old pages often carry login or search forms; a restored page should
      // never let a visitor type into or submit a form to a third party.
      FORBID_TAGS: ["form", "input", "button", "select", "textarea", "iframe"],
    }) as string;

    // Plain text: prefer Readability's textContent; if empty, derive it from
    // the sanitized HTML so the medium route always has something to read.
    let textContent = (article.textContent && article.textContent.trim()) || "";
    if (!textContent) {
      const tmp = new JSDOM(safeContent);
      const bodyText = tmp.window.document.body?.textContent ?? "";
      textContent = bodyText.trim();
    }

    // No readable text means the page could not be restored.
    if (!textContent) {
      return null;
    }

    return {
      title,
      content: safeContent,
      textContent,
    };
  } catch {
    // Never throw out of extractReadable; the route maps null → UNREADABLE.
    return null;
  }
}
