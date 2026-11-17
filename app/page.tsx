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

/** Where people usually find links that have died. */
const WHERE_DEAD_LINKS_HIDE = [
  { icon: "🔖", text: "Your old browser bookmarks: the older the folder, the more ghosts." },
  { icon: "📚", text: "Wikipedia references marked “dead link”." },
  { icon: "✍️", text: "Old blog posts and forum threads, yours or anyone's." },
  { icon: "🏚️", text: "A shop, band, club or startup that has closed its doors." },
  { icon: "🧒", text: "Your first website, or your old MySpace or Bebo page." },
  { icon: "📧", text: "Links in emails or school notes from years ago." },
];

export default function Home() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summoning, setSummoning] = useState(false);

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
    summon(query);
  }

  function summon(query: URLSearchParams) {
    // The board shakes for a moment as the spirits are called.
    setSummoning(true);
    window.setTimeout(() => router.push(`/results?${query.toString()}`), 700);
  }

  function surpriseMe() {
    const ex = EXAMPLE_DEAD_LINKS[Math.floor(Math.random() * EXAMPLE_DEAD_LINKS.length)];
    setValue(ex.url);
    summon(new URLSearchParams({ url: ex.url, timestamp: ex.timestamp }));
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

      <section
        className={`${styles.board} ${summoning ? styles.summoning : ""}`}
        aria-label="Ouija board"
      >
        <svg className={styles.planchette} viewBox="0 0 46 52" aria-hidden="true">
          <path d="M23 2C10 2 2 16 2 30c0 12 8 20 21 20s21-8 21-20C44 16 36 2 23 2z" fill="#e8d2a6" stroke="#6b4a2a" strokeWidth="2" />
          <circle cx="23" cy="24" r="8" fill="rgba(20,14,10,0.75)" stroke="#6b4a2a" strokeWidth="2" />
          <circle cx="20" cy="21" r="2.5" fill="rgba(255,255,255,0.5)" />
        </svg>
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
            {summoning ? "Summoning…" : "Summon 👻"}
          </button>
        </form>

        {error && (
          <p id="dead-link-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>

      <section className={styles.examples} aria-labelledby="graveyard-title">
        <h2 id="graveyard-title" className={styles.graveyardTitle}>
          🪦 The Graveyard of the Web
        </h2>
        <p className={styles.examplesTitle}>
          Tap a tombstone to summon a famous departed site.
        </p>
        <button type="button" className={styles.surprise} onClick={surpriseMe}>
          🎲 Surprise me
        </button>
        <ul className={styles.graveyard}>
          {EXAMPLE_DEAD_LINKS.map((ex) => (
            <li key={ex.url}>
              <button
                type="button"
                className={styles.tombstone}
                onClick={() => {
                  setValue(ex.url);
                  setHint(ex.timestamp);
                  summon(new URLSearchParams({ url: ex.url, timestamp: ex.timestamp }));
                }}
              >
                <span className={styles.rip}>R.I.P.</span>
                <span className={styles.tombName}>{ex.name}</span>
                <span className={styles.tombYears}>{ex.years}</span>
                <span className={styles.epitaph}>“{ex.epitaph}”</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.tips} aria-labelledby="tips-title">
        <h2 id="tips-title" className={styles.tipsTitle}>
          Where do dead links hide?
        </h2>
        <ul className={styles.tipList}>
          {WHERE_DEAD_LINKS_HIDE.map((t) => (
            <li key={t.text}>
              <span aria-hidden="true">{t.icon}</span> {t.text}
            </li>
          ))}
        </ul>
        <p className={styles.tipNote}>
          Even a link that still opens may have changed. Summon it to see how it
          looked years ago.
        </p>
      </section>

      <footer className={styles.footer}>
        Saved copies come from the Internet Archive Wayback Machine.
      </footer>
    </main>
  );
}
