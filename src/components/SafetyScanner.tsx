"use client";

import { useMemo, useState } from "react";
import {
  getCategoryLabel,
  scanText,
  type RiskLevel,
  type SafetyFlag,
} from "@/lib/safetyScanner";

const RISK_STYLES: Record<
  RiskLevel,
  { badge: string; border: string; label: string }
> = {
  low: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    border: "border-emerald-200 dark:border-emerald-800",
    label: "Looks safe",
  },
  medium: {
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    border: "border-amber-200 dark:border-amber-800",
    label: "Review before posting",
  },
  high: {
    badge: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
    border: "border-rose-200 dark:border-rose-800",
    label: "High risk — do not post",
  },
};

function RiskBadge({ level }: { level: RiskLevel }) {
  const styles = RISK_STYLES[level];

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${styles.badge}`}
    >
      {styles.label}
    </span>
  );
}

function FlagCard({ flag }: { flag: SafetyFlag }) {
  return (
    <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {getCategoryLabel(flag.category)}
        </span>
        <RiskBadge level={flag.level} />
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{flag.message}</p>
      <p className="mt-2 font-mono text-xs text-zinc-500">
        Matched: &quot;{flag.matchedText}&quot;
      </p>
    </li>
  );
}

export default function SafetyScanner() {
  const [text, setText] = useState("");

  const result = useMemo(() => scanText(text), [text]);
  const styles = RISK_STYLES[result.riskLevel];

  return (
    <section className="w-full max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Link &amp; Message Checker
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Paste a draft message or URL before you share it. The scanner flags
          personal info, harmful language, suspicious links, and common scam
          phrases.
        </p>
      </header>

      <div className="space-y-3">
        <label
          htmlFor="draft-post"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Your draft post
        </label>
        <textarea
          id="draft-post"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Example: DM me at 555-123-4567 or click bit.ly/free-gift..."
          rows={6}
          className="w-full resize-y rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-sky-400 dark:focus:ring-sky-900"
        />
        <p className="text-xs text-zinc-500">
          {text.trim().length} characters · scanning runs locally in your browser
        </p>
      </div>

      <div
        className={`rounded-2xl border p-5 ${styles.border} bg-white dark:bg-zinc-950`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Scan result
          </h2>
          <RiskBadge level={result.riskLevel} />
        </div>

        {result.flags.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No issues detected yet. Try pasting a phone number, insult, or
            shortened link to see how flags appear.
          </p>
        ) : (
          <ul className="space-y-3">
            {result.flags.map((flag, index) => (
              <FlagCard key={`${flag.category}-${flag.matchedText}-${index}`} flag={flag} />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/40">
        <h3 className="font-medium text-sky-900 dark:text-sky-100">
          What you learned here
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sky-900/90 dark:text-sky-100/90">
          <li>
            <strong>Controlled inputs:</strong> the textarea value lives in React
            state and updates on every keystroke.
          </li>
          <li>
            <strong>Derived data:</strong> scan results recompute automatically
            with <code className="font-mono">useMemo</code> whenever the text
            changes.
          </li>
          <li>
            <strong>Separation of concerns:</strong> detection rules live in a
            pure TypeScript module, separate from UI code.
          </li>
        </ul>
      </div>
    </section>
  );
}
