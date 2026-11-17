"use client";

/**
 * app/page.tsx — the ouija-board home page (Requirement 1).
 *
 * The Visitor pastes a dead link into the Ouija_Input and presses Summon.
 * Invalid or empty input shows an in-theme message and does not navigate.
 * Choosing one of the three Example_Dead_Links fills in both the URL and its
 * alive-era Timestamp_Hint, which is forwarded to the results page.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EXAMPLE_DEAD_LINKS, isValidUrl, msg } from "@/lib/seance";
import styles from "./seance.module.css";

const EXAMPLE_NAMES: Record<string, string> = {
  "https://www.google.com/reader/": "Google Reader (2012)",
  "https://vine.co/": "Vine (2015)",
  "https://plus.google.com/": "Google+ (2016)",
};

export default function Home() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let url = value.trim();
    // Let people paste a bare domain like "vine.co" without typing https://
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && url.includes(".")) {
      url = `https://${url}`;
    }
    if (!isValidUrl(url)) {
      setError(msg("INVALID_URL"));
      return;
    }
    setError(null);
    const query = new URLSearchParams({ url });
    if (hint) query.set("timestamp", hint);
    router.push(`/results?${query.toString()}`);
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dead Link Séance</h1>
        <p className={styles.tagline}>
          Paste a link that no longer works. The spirits will search the
          Internet Archive and bring its page back to life.
        </p>
      </header>

      <section className={styles.board} aria-label="Ouija board">
        <div className={styles.boardRow} aria-hidden="true">
          <span>YES</span>
          <span>☾ ✦ ☽</span>
          <span>NO</span>
        </div>
        <p className={styles.letters} aria-hidden="true">
          A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
        </p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label htmlFor="dead-link" className={styles.label}>
            Dead link
          </label>
          <input
            id="dead-link"
            className={styles.input}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={2048}
            placeholder="https://a-page-that-is-gone.com/"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHint(null); // a typed link has no Timestamp_Hint
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "dead-link-error" : undefined}
          />
          <button type="submit" className={styles.button}>
            Summon
          </button>
        </form>

        {error && (
          <p id="dead-link-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>

      <section className={styles.examples} aria-label="Example dead links">
        <p className={styles.examplesTitle}>Or call upon a famous departed page:</p>
        <ul className={styles.exampleList}>
          {EXAMPLE_DEAD_LINKS.map((ex) => (
            <li key={ex.url}>
              <button
                type="button"
                className={styles.exampleButton}
                onClick={() => {
                  setValue(ex.url);
                  setHint(ex.timestamp);
                  setError(null);
                }}
              >
                {EXAMPLE_NAMES[ex.url] ?? ex.url}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className={styles.footer}>
        Saved copies come from the Internet Archive Wayback Machine.
      </footer>
    </main>
  );
}
