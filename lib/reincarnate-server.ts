/**
 * lib/reincarnate-server.ts — server-only helpers for /api/reincarnate:
 * pull the HTML document out of a model reply, sanitize it, and lock it down
 * with a Content-Security-Policy that blocks every network request.
 */

import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

/** Blocks every network request from the generated page. */
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

/** Pull the HTML document out of the model reply (drops code fences / chatter). */
export function extractHtmlDocument(raw: string): string | null {
  const start = raw.search(/<!doctype html|<html[\s>]/i);
  if (start === -1) return null;
  const endMatch = /<\/html>/i.exec(raw.slice(start));
  const end = endMatch ? start + endMatch.index + endMatch[0].length : raw.length;
  return raw.slice(start, end);
}

/** Sanitize the generated document and lock it down with a CSP. */
export function sanitizeReincarnation(doc: string): string {
  const window = new JSDOM("").window;
  const purify = DOMPurify(window as unknown as Parameters<typeof DOMPurify>[0]);
  const clean = purify.sanitize(doc, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["script", "iframe", "form", "input", "button", "select", "textarea", "object", "embed", "link", "meta", "base"],
  }) as string;
  const dom = new JSDOM(clean);
  const d = dom.window.document;
  const meta = d.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", CSP);
  d.head.prepend(meta);
  const charset = d.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  d.head.prepend(charset);
  const viewport = d.createElement("meta");
  viewport.setAttribute("name", "viewport");
  viewport.setAttribute("content", "width=device-width, initial-scale=1");
  d.head.append(viewport);
  return "<!doctype html>\n" + d.documentElement.outerHTML;
}

