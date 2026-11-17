"use client";

/**
 * SpookyScene — the haunted backdrop behind every page.
 *
 * Purely decorative (aria-hidden), fixed behind the content. Everything moves
 * with CSS animations so it stays cheap; prefers-reduced-motion freezes it.
 * The ghosts are the one interactive bit: click (or tap) one and it shouts
 * "BOO!" and vanishes, then drifts back in a few seconds later.
 */

import { useState } from "react";
import styles from "./spooky.module.css";

type GhostSpec = { top: string; size: number; duration: number; delay: number; reverse?: boolean };

// Fixed values (not Math.random) so server and client render the same markup.
const GHOSTS: GhostSpec[] = [
  { top: "12%", size: 70, duration: 26, delay: 0 },
  { top: "34%", size: 48, duration: 34, delay: -12, reverse: true },
  { top: "58%", size: 60, duration: 30, delay: -6 },
  { top: "22%", size: 40, duration: 40, delay: -25, reverse: true },
  { top: "72%", size: 54, duration: 36, delay: -18, reverse: true },
];

const BATS = [
  { top: "8%", duration: 14, delay: 0, size: 34 },
  { top: "16%", duration: 18, delay: -5, size: 26 },
  { top: "28%", duration: 16, delay: -11, size: 30 },
  { top: "44%", duration: 22, delay: -3, size: 22 },
];

const STARS = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53) % 60}%`,
  delay: (i % 7) * 0.6,
  size: 1 + (i % 3),
}));

const PUMPKINS: { left: string; size: number; delay: number; hideOnPhone?: boolean }[] = [
  { left: "2%", size: 64, delay: 0 },
  { left: "11%", size: 44, delay: 0.7, hideOnPhone: true },
  { left: "80%", size: 52, delay: 0.3, hideOnPhone: true },
  { left: "90%", size: 70, delay: 1.1 },
];

export default function SpookyScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      {STARS.map((s, i) => (
        <span
          key={i}
          className={styles.star}
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}

      <div className={styles.moon} />
      <div className={styles.witch}>
        <Witch />
      </div>

      {BATS.map((b, i) => (
        <div
          key={i}
          className={styles.bat}
          style={{ top: b.top, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
        >
          <Bat size={b.size} />
        </div>
      ))}

      {GHOSTS.map((g, i) => (
        <Ghost key={i} spec={g} />
      ))}

      <div className={styles.spider}>
        <span className={styles.thread} />
        <Spider />
      </div>

      <div className={`${styles.fog} ${styles.fog1}`} />
      <div className={`${styles.fog} ${styles.fog2}`} />

      {PUMPKINS.map((p, i) => (
        <div key={i} className={`${styles.pumpkin} ${p.hideOnPhone ? styles.hideOnPhone : ""}`} style={{ left: p.left, animationDelay: `${p.delay}s` }}>
          <Pumpkin size={p.size} />
        </div>
      ))}
    </div>
  );
}

function Ghost({ spec }: { spec: GhostSpec }) {
  const [booed, setBooed] = useState(false);
  return (
    <div
      className={`${styles.ghostTrack} ${spec.reverse ? styles.reverse : ""}`}
      style={{ top: spec.top, animationDuration: `${spec.duration}s`, animationDelay: `${spec.delay}s` }}
    >
      <button
        type="button"
        tabIndex={-1}
        className={`${styles.ghost} ${booed ? styles.booed : ""}`}
        onClick={() => {
          if (booed) return;
          setBooed(true);
          window.setTimeout(() => setBooed(false), 4000);
        }}
      >
        {booed && <span className={styles.boo}>BOO!</span>}
        <svg width={spec.size} height={spec.size * 1.2} viewBox="0 0 100 120">
          <path
            d="M50 4C24 4 10 24 10 50v62l13-10 13 10 14-10 14 10 13-10 13 10V50C90 24 76 4 50 4z"
            fill="rgba(240,240,255,0.88)"
          />
          <ellipse cx="36" cy="48" rx="7" ry="10" fill="#1a1a2e" />
          <ellipse cx="64" cy="48" rx="7" ry="10" fill="#1a1a2e" />
          <ellipse cx="50" cy="72" rx="9" ry="11" fill="#1a1a2e" />
          <ellipse cx="26" cy="62" rx="6" ry="3" fill="rgba(255,150,170,0.45)" />
          <ellipse cx="74" cy="62" rx="6" ry="3" fill="rgba(255,150,170,0.45)" />
        </svg>
      </button>
    </div>
  );
}

function Bat({ size }: { size: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 120 60" className={styles.batWings}>
      <path
        d="M60 22c-4-8-10-10-10-10s2 8 0 10c-8-10-22-14-40-10 10 4 14 12 12 20 6-4 14-4 18 2 2-6 10-8 14-4 2-2 4-6 6-8 2 2 4 6 6 8 4-4 12-2 14 4 4-6 12-6 18-2-2-8 2-16 12-20-18-4-32 0-40 10-2-2 0-10 0-10s-6 2-10 10z"
        fill="#0a0a0f"
      />
      <circle cx="56" cy="22" r="1.6" fill="#ff5a3c" />
      <circle cx="64" cy="22" r="1.6" fill="#ff5a3c" />
    </svg>
  );
}

function Witch() {
  return (
    <svg width="150" height="90" viewBox="0 0 150 90">
      {/* broom */}
      <line x1="10" y1="62" x2="120" y2="52" stroke="#3b2414" strokeWidth="4" strokeLinecap="round" />
      <path d="M118 44l28-6-4 12 6 8-30-4z" fill="#8a5a2b" />
      {/* cloak */}
      <path d="M48 58c4-18 14-30 26-30s18 12 20 26c-6 2-14 2-20 0-6 6-18 8-26 4z" fill="#141018" />
      <path d="M70 56c10 6 20 14 34 16-12 4-26 0-36-8z" fill="#1d1424" />
      {/* face */}
      <circle cx="66" cy="24" r="8" fill="#7bd36b" />
      <path d="M58 24l-8 3 8 1z" fill="#7bd36b" />
      {/* hat */}
      <path d="M52 18h30l-6-4-8-14-4 16z" fill="#141018" />
      <rect x="50" y="16" width="34" height="4" rx="2" fill="#141018" />
      <rect x="60" y="13" width="12" height="3" fill="#8a3cc9" />
      {/* hair */}
      <path d="M72 20c6 4 10 10 8 18-2-6-6-10-10-12z" fill="#ff7a1a" />
    </svg>
  );
}

function Spider() {
  return (
    <svg width="34" height="30" viewBox="0 0 34 30">
      <g stroke="#0a0a0f" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M12 14L2 8M12 16L1 16M12 18L3 25M22 14l10-6M22 16h11M22 18l9 7" />
      </g>
      <ellipse cx="17" cy="16" rx="7" ry="8" fill="#0a0a0f" />
      <circle cx="14.5" cy="13" r="1.4" fill="#ff5a3c" />
      <circle cx="19.5" cy="13" r="1.4" fill="#ff5a3c" />
    </svg>
  );
}

function Pumpkin({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 100 90">
      <path d="M48 16c0-8 4-12 10-14l2 4c-4 2-6 6-6 10z" fill="#3f6b2a" />
      <ellipse cx="30" cy="54" rx="24" ry="32" fill="#e0661b" />
      <ellipse cx="70" cy="54" rx="24" ry="32" fill="#e0661b" />
      <ellipse cx="50" cy="54" rx="22" ry="34" fill="#f07a24" />
      <g className={styles.pumpkinFace} fill="#ffd35a">
        <path d="M30 44l8-12 8 12z" />
        <path d="M54 44l8-12 8 12z" />
        <path d="M28 60c8 12 36 12 44 0l-6 2-4 6-6-6-6 6-6-6-6 6-4-6z" />
      </g>
    </svg>
  );
}
