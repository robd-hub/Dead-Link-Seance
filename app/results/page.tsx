"use client";

/**
 * app/results/page.tsx — the results page (Requirement 5).
 *
 * Reads `url` and the optional `timestamp` hint from the query string, calls
 * `/api/lookup` to restore the page, then `/api/medium` for the ghost's
 * summary and cause of death. The restored text is shown even when the AI is
 * skipped or fails. Errors are always the fixed in-theme messages.
 *
 * The restored HTML was sanitized server-side with DOMPurify in
 * lib/seance-server.ts before it reached this page.
 *
 * Validates: Requirements 4.4, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.5
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  isValidTimestampHint,
  isValidUrl,
  msg,
  type LookupResponse,
  type LookupSuccess,
  type MediumResponse,
} from "@/lib/seance";
import styles from "../seance.module.css";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; page: LookupSuccess };

function Results({ url, timestamp }: { url: string; timestamp: string | null }) {
  const validUrl = isValidUrl(url);
  const [state, setState] = useState<State>(
    validUrl ? { phase: "loading" } : { phase: "error", message: msg("INVALID_URL") },
  );
  const [medium, setMedium] = useState<MediumResponse | null>(null);
  const [mediumLoading, setMediumLoading] = useState(false);
  // "auto" picks the original look for pages that kept very little text.
  const [view, setView] = useState<"auto" | "readable" | "original">("auto");

  useEffect(() => {
    if (!validUrl) return;
    let cancelled = false;

    const query = new URLSearchParams({ url });
    if (isValidTimestampHint(timestamp)) query.set("timestamp", timestamp);

    (async () => {
      let page: LookupSuccess;
      try {
        const res = await fetch(`/api/lookup?${query.toString()}`);
        const data = (await res.json()) as LookupResponse;
        if (cancelled) return;
        if (!data.ok) {
          setState({ phase: "error", message: msg(data.error) });
          return;
        }
        page = data;
        setState({ phase: "done", page });
        setMediumLoading(true);
      } catch {
        if (!cancelled) setState({ phase: "error", message: msg("UNREACHABLE") });
        return;
      }

      // Ask the medium. Any failure just means no summary (Req 4.6, 5.7).
      try {
        const res = await fetch("/api/medium", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textContent: page.textContent, title: page.title }),
        });
        const data = (await res.json()) as MediumResponse;
        if (!cancelled) setMedium(data);
      } catch {
        if (!cancelled) setMedium(null);
      } finally {
        if (!cancelled) setMediumLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, timestamp, validUrl]);

  if (state.phase === "loading") {
    return (
      <main className={styles.main}>
        <LoadingGhost />
        <p className={styles.status} role="status">
          Summoning… the spirits are searching the archive.
        </p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className={styles.main}>
        <div className={styles.card} role="alert" style={{ textAlign: "center" }}>
          <p className={styles.summary}>{state.message}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/">Return to the board</Link>
        </div>
      </main>
    );
  }

  const { page } = state;
  const thin = page.textContent.replace(/\s+/g, " ").trim().length < 700;
  const activeView = view === "auto" ? (thin ? "original" : "readable") : view;
  const year = page.snapshotDate.slice(0, 4);
  // `if_` asks the Wayback Machine for the page without its own toolbar.
  const originalSrc = `https://web.archive.org/web/${page.snapshotTimestamp}if_/${url}`;
  const showGhost =
    medium?.ok === true && !!medium.summary?.trim() && !!medium.causeOfDeath?.trim();

  return (
    <main className={styles.main}>
      <header>
        <p className={styles.sectionLabel}>Restored from beyond</p>
        <h1 className={styles.pageTitle}>{page.title || "Untitled page"}</h1>
      </header>

      <div className={styles.meta}>
        <span>Saved copy from {page.snapshotDate}</span>
        <a href={page.archiveUrl} target="_blank" rel="noopener noreferrer">
          See the original archive copy
        </a>
      </div>

      {mediumLoading && (
        <p className={styles.status} role="status">
          🔮 The medium is listening…
        </p>
      )}

      {showGhost && (
        <section className={styles.ghostCard} aria-label="The medium speaks">
          <p className={styles.sectionLabel}>The medium speaks</p>
          <p className={styles.summary}>{medium.summary}</p>
          <p className={styles.cause}>
            <strong>Cause of death:</strong> {medium.causeOfDeath}
          </p>
        </section>
      )}

      <div className={styles.viewTabs} role="tablist" aria-label="How to view the page">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "readable"}
          className={styles.viewTab}
          onClick={() => setView("readable")}
        >
          📜 Readable text
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "original"}
          className={styles.viewTab}
          onClick={() => setView("original")}
        >
          🖥️ As it looked in {year}
        </button>
      </div>

      {activeView === "readable" ? (
        <article
          className={`${styles.card} ${styles.restored}`}
          // Sanitized server-side with DOMPurify (lib/seance-server.ts).
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      ) : (
        <div className={styles.timeWindow}>
          <div className={styles.windowBar} aria-hidden="true">
            <span />
            <span />
            <span />
            <em>{url}</em>
          </div>
          <iframe
            className={styles.originalFrame}
            src={originalSrc}
            title={`${page.title || url} as it looked in ${year}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            // No top navigation, no forms: old pages can't drag the visitor away.
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      )}

      <div className={styles.actions}>
        <Link href="/">Summon another</Link>
      </div>
    </main>
  );
}

/** Remount Results whenever the query changes, so its state starts fresh. */
function ResultsFromQuery() {
  const params = useSearchParams();
  const url = params.get("url") ?? "";
  const timestamp = params.get("timestamp");
  return <Results key={`${url}|${timestamp ?? ""}`} url={url} timestamp={timestamp} />;
}

function LoadingGhost() {
  return (
    <svg className={styles.loadingGhost} width="110" height="132" viewBox="0 0 100 120" aria-hidden="true">
      <path d="M50 4C24 4 10 24 10 50v62l13-10 13 10 14-10 14 10 13-10 13 10V50C90 24 76 4 50 4z" fill="rgba(240,240,255,0.92)" />
      <ellipse cx="36" cy="48" rx="7" ry="10" fill="#1a1a2e" />
      <ellipse cx="64" cy="48" rx="7" ry="10" fill="#1a1a2e" />
      <ellipse cx="50" cy="74" rx="10" ry="8" fill="#1a1a2e" />
    </svg>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.main}>
          <LoadingGhost />
          <p className={styles.status} role="status">
            Summoning…
          </p>
        </main>
      }
    >
      <ResultsFromQuery />
    </Suspense>
  );
}
