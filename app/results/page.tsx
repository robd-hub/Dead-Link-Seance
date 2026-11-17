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
          The medium is listening…
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

      <article
        className={`${styles.card} ${styles.restored}`}
        // Sanitized server-side with DOMPurify (lib/seance-server.ts).
        dangerouslySetInnerHTML={{ __html: page.content }}
      />

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

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.main}>
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
