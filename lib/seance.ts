/**
 * lib/seance.ts — isomorphic shared helpers for Dead Link Séance.
 *
 * This module is deliberately dependency-free and uses only APIs available in
 * both the browser and Node.js (the Web `URL` constructor, `Math`, `RegExp`,
 * `Error`). It is safe to import from client components ("use client") and from
 * server Route Handlers alike. Keep it that way: no Node-only imports.
 *
 * Exports:
 *  - isValidUrl(s)
 *  - InThemeKind, IN_THEME_MESSAGES, msg(kind), mapErrorToInTheme(err)
 *  - Snapshot, selectSnapshot(snapshots, hint?)
 *  - buildRawSnapshotUrl(timestamp, url)
 *  - ExampleDeadLink, EXAMPLE_DEAD_LINKS, isValidTimestampHint(s)
 *  - LookupSuccess, LookupError, LookupResponse, MediumResponse
 */

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * `true` iff `new URL(s)` succeeds and the scheme is `http` or `https`.
 * Empty, whitespace-only, relative, and non-http(s) schemes yield `false`.
 * Never throws.
 *
 * Validates: Requirements 1.6, 2.3, 6.1
 */
export function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `true` iff `s` is a string of exactly 8 digits (a YYYYMMDD Timestamp_Hint).
 * Usable as a type guard. Used by the home page and the lookup route to reject
 * malformed hints consistently.
 *
 * Validates: Requirements 2.7, 6.1
 */
export function isValidTimestampHint(s: unknown): s is string {
  return typeof s === "string" && /^\d{8}$/.test(s);
}

// ---------------------------------------------------------------------------
// In-theme error allowlist
// ---------------------------------------------------------------------------

export type InThemeKind =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "UNREADABLE";

/**
 * Fixed allowlist of friendly, séance-themed error messages. This is the only
 * source of user-facing error text; raw technical detail never reaches it.
 */
export const IN_THEME_MESSAGES: Record<InThemeKind, string> = {
  INVALID_URL: "That is not a valid link.",
  NOT_FOUND: "The spirits could not find this page.",
  TIMEOUT: "The archive is too slow.",
  UNREACHABLE: "The archive could not be reached.",
  UNREADABLE: "The page's spirit was too faint to restore.",
};

/** Accessor for the allowlist string for a given kind. */
export function msg(kind: InThemeKind): string {
  return IN_THEME_MESSAGES[kind];
}

/**
 * Classify a thrown value to an in-theme kind WITHOUT ever including raw error
 * text in the returned kind (the return value is a fixed literal, never a
 * substring of the error). Detection heuristics, in order:
 *   1. AbortError / timeout  → TIMEOUT
 *   2. network / fetch / non-2xx → UNREACHABLE
 *   3. anything else → UNREACHABLE (safe default)
 *
 * Never throws. The safe default is UNREACHABLE so unrecognized failures still
 * map to a friendly message rather than leaking detail.
 *
 * Validates: Requirements 2.4, 2.5, 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5
 */
export function mapErrorToInTheme(err: unknown): InThemeKind {
  try {
    if (err instanceof Error) {
      if (err.name === "AbortError" || /timeout|abort/i.test(err.message)) {
        return "TIMEOUT";
      }
      if (
        /fetch|network|ENOTFOUND|ECONN|status|2xx|3xx|4xx|5xx/i.test(err.message)
      ) {
        return "UNREACHABLE";
      }
      return "UNREACHABLE";
    }
    if (typeof err === "string") {
      if (/timeout|abort/i.test(err)) {
        return "TIMEOUT";
      }
      return "UNREACHABLE";
    }
    return "UNREACHABLE";
  } catch {
    return "UNREACHABLE";
  }
}

// ---------------------------------------------------------------------------
// Wayback snapshot selection
// ---------------------------------------------------------------------------

/**
 * A snapshot entry from the Wayback availability response. Only `timestamp`
 * (a 14-digit UTC `YYYYMMDDhhmmss` string) is required for selection; the
 * optional fields mirror the availability API shape and are passed through.
 */
export type Snapshot = {
  timestamp: string;
  url?: string;
  available?: boolean;
  raw?: string;
};

/** Returns the numeric value of a snapshot timestamp, or NaN if not finite. */
function tsNumber(s: Snapshot): number {
  const n = Number(s.timestamp);
  return Number.isFinite(n) ? n : NaN;
}

/** `n` if finite, else `fallback` (used to push invalid timestamps out of the running). */
function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Select the best snapshot from a list.
 *
 * - Empty/undefined list → `null`.
 * - A valid 8-digit `YYYYMMDD` hint is provided → the snapshot whose timestamp
 *   is closest to the hint (hint padded to `YYYYMMDD000000`; absolute numeric
 *   difference; 14-digit UTC timestamps are fixed-width zero-padded so numeric
 *   order equals chronological order). Ties prefer the later timestamp.
 * - No valid hint → the snapshot with the maximum (most recent) timestamp.
 *
 * Validates: Requirements 2.2, 2.7
 */
export function selectSnapshot(
  snapshots: Snapshot[],
  hint?: string,
): Snapshot | null {
  if (!snapshots || snapshots.length === 0) {
    return null;
  }

  // No valid hint → most recent (max timestamp).
  if (!isValidTimestampHint(hint)) {
    let best = snapshots[0];
    let bestVal = finiteOr(tsNumber(best), -Infinity);
    for (let i = 1; i < snapshots.length; i++) {
      const v = finiteOr(tsNumber(snapshots[i]), -Infinity);
      if (v > bestVal) {
        best = snapshots[i];
        bestVal = v;
      }
    }
    return best;
  }

  // Valid hint → closest to the hint (padded to 14 digits).
  const target = Number(hint + "000000");
  let best = snapshots[0];
  let bestDiff = finiteOr(Math.abs(tsNumber(best) - target), Infinity);
  for (let i = 1; i < snapshots.length; i++) {
    const d = finiteOr(Math.abs(tsNumber(snapshots[i]) - target), Infinity);
    if (d < bestDiff) {
      best = snapshots[i];
      bestDiff = d;
    } else if (d === bestDiff) {
      // Tie → prefer the later timestamp.
      if (
        finiteOr(tsNumber(snapshots[i]), -Infinity) >
        finiteOr(tsNumber(best), -Infinity)
      ) {
        best = snapshots[i];
        bestDiff = d;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Raw snapshot URL construction
// ---------------------------------------------------------------------------

/**
 * Build the raw-snapshot replay URL by inserting `id_` immediately after the
 * timestamp (and before the next `/`), so the Wayback Machine returns the
 * original archived bytes without its toolbar/rewriting. The `url` is
 * preserved verbatim.
 *
 *   buildRawSnapshotUrl("20130628094127", "https://example.com/")
 *   → "https://web.archive.org/web/20130628094127id_/https://example.com/"
 *
 * Validates: Requirements 3.1
 */
export function buildRawSnapshotUrl(timestamp: string, url: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

// ---------------------------------------------------------------------------
// Example dead links
// ---------------------------------------------------------------------------

export type ExampleDeadLink = {
  url: string;
  timestamp: string;
  /** Display name on the tombstone. */
  name: string;
  /** "born–died" years, shown under the name. */
  years: string;
  /** A one-line epitaph. */
  epitaph: string;
};

/**
 * Famous discontinued products, each carrying a Timestamp_Hint (an
 * 8-digit YYYYMMDD date from when the site was alive) chosen for extensive,
 * reliable Wayback coverage. Selecting one populates both the input URL and
 * the Timestamp_Hint on the home page.
 *
 * Validates: Requirements 1.3, 2.7
 */
export const EXAMPLE_DEAD_LINKS: ExampleDeadLink[] = [
  // Each of these was checked against the live archive and restores readable text.
  { url: "https://www.google.com/reader/", timestamp: "20120601", name: "Google Reader", years: "2005–2013", epitaph: "Kept us up to date. Was not kept." },
  { url: "http://www.geocities.com/", timestamp: "20090601", name: "GeoCities", years: "1994–2009", epitaph: "Under construction, forever." },
  { url: "http://www.napster.com/", timestamp: "20000601", name: "Napster", years: "1999–2001", epitaph: "Music at Internet speed. Lawyers, faster." },
  { url: "http://www.pets.com/", timestamp: "20000601", name: "Pets.com", years: "1998–2000", epitaph: "Survived by one sock puppet." },
  { url: "https://wave.google.com/about.html", timestamp: "20100601", name: "Google Wave", years: "2009–2012", epitaph: "Nobody was quite sure what it was." },
  { url: "http://del.icio.us/about/", timestamp: "20080601", name: "del.icio.us", years: "2003–2017", epitaph: "Tagged: gone, missed, rip." },
  { url: "http://home.netscape.com/", timestamp: "19970601", name: "Netscape", years: "1994–2008", epitaph: "Lost the browser wars with dignity." },
  { url: "http://www.orkut.com/About.aspx", timestamp: "20100601", name: "Orkut", years: "2004–2014", epitaph: "Big in Brazil. Bigger in our hearts." },
  { url: "https://www.google.com/glass/start/", timestamp: "20140601", name: "Google Glass", years: "2013–2015", epitaph: "Saw the future. The future stared back." },
  { url: "https://www.google.com/inbox/", timestamp: "20170601", name: "Inbox by Gmail", years: "2014–2019", epitaph: "Snoozed. Permanently." },
  { url: "http://encarta.msn.com/", timestamp: "20050601", name: "Encarta", years: "1993–2009", epitaph: "Out-edited by volunteers." },
];

// ---------------------------------------------------------------------------
// Shared response envelopes
// ---------------------------------------------------------------------------

/** Successful lookup+extract response from `/api/lookup`. */
export type LookupSuccess = {
  ok: true;
  title: string;
  /** Cleaned article HTML (Readability) — sanitized before render. */
  content: string;
  /** Plain readable text — sent to the medium route. */
  textContent: string;
  /** 14-digit UTC `YYYYMMDDhhmmss`. */
  snapshotTimestamp: string;
  /** Human-readable, e.g. "2013-06-28". */
  snapshotDate: string;
  /** Replay URL without `id_`. */
  archiveUrl: string;
};

/** Error response from `/api/lookup`. `error` is the kind; `message` is the in-theme string. */
export type LookupError = {
  ok: false;
  error: InThemeKind;
  message: string;
};

export type LookupResponse = LookupSuccess | LookupError;

/**
 * Response from `/api/medium`. `summary`/`causeOfDeath` are null when the AI is
 * skipped (no key) or fails (timeout/error/empty), so the results page omits
 * them and still shows the restored text.
 *
 * Validates: Requirements 4.4, 4.6, 5.7
 */
export type MediumResponse = {
  ok: boolean;
  skipped?: boolean;
  summary: string | null;
  causeOfDeath: string | null;
};
