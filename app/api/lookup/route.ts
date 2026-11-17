/**
 * app/api/lookup/route.ts — Wayback availability lookup + raw snapshot
 * extraction (Requirement 2 + 3 combined into a single Route Handler, GET).
 *
 * Flow: validate URL (+ optional Timestamp_Hint) → availability lookup →
 * select closest/most-recent snapshot → fetch the raw snapshot via the `id_`
 * trick → extract readable title/text with `@mozilla/readability` + jsdom,
 * sanitized through DOMPurify → return the success envelope.
 *
 * Every failure mode maps to a fixed in-theme message from
 * `lib/seance.ts` (no raw technical detail ever reaches the Visitor). The
 * whole handler is wrapped so the route never crashes to the client.
 *
 * `maxDuration` (60s) is the Vercel function-duration ceiling and is distinct
 * from the per-operation 20s `AbortController` timeouts (Reqs 2.5, 3.3).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3,
 * 3.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.3
 */

import { NextResponse } from "next/server";
import {
  isValidUrl,
  isValidTimestampHint,
  selectSnapshot,
  buildRawSnapshotUrl,
  mapErrorToInTheme,
  msg,
  type InThemeKind,
  type LookupSuccess,
  type LookupError,
} from "@/lib/seance";
import { fetchWithTimeout, extractReadable } from "@/lib/seance-server";

/** Vercel function-duration ceiling (Hobby). Fits two sequential 20s ops (~40s) with margin. */
export const maxDuration = 60;

/**
 * HTTP status for each in-theme error kind. TIMEOUT is a gateway timeout
 * (504); UNREACHABLE is a bad-gateway/upstream failure (502); NOT_FOUND is
 * 404; INVALID_URL is 400; UNREADABLE is 422.
 */
function statusForKind(kind: InThemeKind): number {
  switch (kind) {
    case "INVALID_URL":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "TIMEOUT":
      return 504;
    case "UNREADABLE":
      return 422;
    case "UNREACHABLE":
    default:
      return 502;
  }
}

/** Build an in-theme error response envelope; never leaks raw error text. */
function errorResponse(kind: InThemeKind): Response {
  const body: LookupError = {
    ok: false,
    error: kind,
    message: msg(kind),
  };
  return NextResponse.json(body, { status: statusForKind(kind) });
}

/** Shape of the Wayback availability API response (only the fields we read). */
interface AvailabilityResponse {
  archived_snapshots?: {
    closest?: {
      status?: string;
      available?: boolean;
      url?: string; // replay URL, e.g. http://web.archive.org/web/<ts>/<url>
      timestamp?: string; // 14-digit UTC YYYYMMDDhhmmss
    };
  };
}

/**
 * GET /api/lookup?url=<encoded URL>&timestamp=<optional 8-digit YYYYMMDD hint>
 *
 * Returns a `LookupSuccess` envelope on success or a `LookupError` envelope
 * (with an in-theme `message`) on any failure. Never throws to the client.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const url = params.get("url") ?? "";
    const timestampParam = params.get("timestamp");

    // 1. Validate the URL. Empty/invalid (non http/https) → INVALID_URL (400).
    if (!isValidUrl(url)) {
      return errorResponse("INVALID_URL");
    }

    // 2. Validate the optional Timestamp_Hint. If present it must be exactly
    //    8 digits; a malformed hint is rejected as INVALID_URL (400). If
    //    absent, proceed with no hint.
    let hint: string | undefined;
    if (timestampParam !== null) {
      if (!isValidTimestampHint(timestampParam)) {
        return errorResponse("INVALID_URL");
      }
      hint = timestampParam;
    }

    // 3. Build the availability URL, appending the hint only when a valid one
    //    is present (Req 2.7).
    let availabilityUrl =
      "https://archive.org/wayback/available?url=" + encodeURIComponent(url);
    if (hint) {
      availabilityUrl += "&timestamp=" + hint;
    }

    // 4. Fetch availability with a 20s timeout. On throw, map the error to an
    //    in-theme kind (TIMEOUT → 504, UNREACHABLE → 502) (Reqs 2.5, 6.3, 6.4).
    let availabilityResp: Response;
    try {
      availabilityResp = await fetchWithTimeout(availabilityUrl, {}, 20000);
    } catch (err) {
      return errorResponse(mapErrorToInTheme(err));
    }
    if (!availabilityResp.ok) {
      return errorResponse("UNREACHABLE");
    }

    // 5. Parse the availability JSON and locate the closest snapshot. The
    //    availability API returns the closest-to-hint (or most recent when no
    //    hint) as `archived_snapshots.closest`; an empty/missing object means
    //    nothing is archived → NOT_FOUND (Reqs 2.2, 2.4, 6.2).
    let data: AvailabilityResponse;
    try {
      data = (await availabilityResp.json()) as AvailabilityResponse;
    } catch {
      return errorResponse("UNREACHABLE");
    }

    const closest = data?.archived_snapshots?.closest;
    if (!closest || !closest.timestamp || closest.available !== true) {
      return errorResponse("NOT_FOUND");
    }

    // 6. Select/confirm the snapshot. The availability API already returns the
    //    best snapshot, but `selectSnapshot` keeps behavior consistent and
    //    generalizes to multiple snapshots if the API ever returns them.
    const selected = selectSnapshot(
      [
        {
          timestamp: closest.timestamp,
          url: closest.url,
          available: closest.available,
        },
      ],
      hint,
    );
    if (!selected || !selected.timestamp) {
      return errorResponse("NOT_FOUND");
    }
    const snapshotTimestamp = selected.timestamp;

    // 7. Build the raw snapshot URL via the `id_` trick and fetch it with a
    //    20s timeout. The original visitor URL is preserved verbatim (the
    //    `id_` marker goes immediately after the timestamp) (Req 3.1, 3.3).
    const rawUrl = buildRawSnapshotUrl(snapshotTimestamp, url);
    let rawResp: Response;
    try {
      rawResp = await fetchWithTimeout(rawUrl, {}, 20000);
    } catch (err) {
      return errorResponse(mapErrorToInTheme(err));
    }
    if (!rawResp.ok) {
      return errorResponse("UNREACHABLE");
    }

    // 8. Extract the readable article. `extractReadable` never throws — it
    //    returns null on any jsdom/Readability/DOMPurify failure, which we map
    //    to UNREADABLE. A null/empty result also maps to UNREADABLE (Req 3.4).
    const html = await rawResp.text();
    const article = await extractReadable(html, rawUrl);
    if (!article || !article.textContent) {
      return errorResponse("UNREADABLE");
    }

    // 9. archiveUrl is the replay URL WITHOUT `id_` (what the Visitor sees in
    //    context). Prefer the archive's own replay URL; fall back to building
    //    one from the timestamp + original URL (Req 5.3).
    const archiveUrl =
      selected.url && selected.url.length > 0
        ? selected.url
        : `https://web.archive.org/web/${snapshotTimestamp}/${url}`;

    // 10. Derive a human-readable snapshot date from the 14-digit UTC
    //     timestamp (first 8 digits → YYYY-MM-DD). No Date/timezone math needed
    //     since 14-digit UTC timestamps are fixed-width zero-padded (Req 5.2).
    const snapshotDate =
      snapshotTimestamp.length >= 8
        ? `${snapshotTimestamp.slice(0, 4)}-${snapshotTimestamp.slice(
            4,
            6,
          )}-${snapshotTimestamp.slice(6, 8)}`
        : snapshotTimestamp;

    const success: LookupSuccess = {
      ok: true,
      title: article.title,
      content: article.content,
      textContent: article.textContent,
      snapshotTimestamp,
      snapshotDate,
      archiveUrl,
    };
    return NextResponse.json(success, { status: 200 });
  } catch {
    // Top-level safety net: the route never crashes to the client. Any
    // unexpected throw maps to the safe UNREACHABLE in-theme message; no raw
    // error text, stack trace, or status code is ever leaked (Req 6.5).
    return errorResponse("UNREACHABLE");
  }
}
