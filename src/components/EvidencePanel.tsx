"use client";

// Shared evidence-based result panel used by the QR Scanner and Link Checker.
// Renders an Identification object in the standard structure:
//   🧾 WHAT IS THIS? / 🎯 WHAT DOES IT DO? / 🔎 HOW WE IDENTIFIED IT /
//   🛡️ SAFETY ANALYSIS / ⚠️ IMPORTANT / ✅ WHAT SHOULD I DO?
// with sources and an expandable Technical details section. All labels come
// from the ident.* i18n dictionary.

import { useState } from "react";
import { useLang } from "@/lib/i18n/context";
import { riskLabel, formatConfidence, type Identification } from "@/lib/identification";

function riskBadge(risk: string): string {
  if (risk === "high")
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400";
  if (risk === "medium")
    return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400";
  if (risk === "low")
    return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-400";
  return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400";
}

function confBadge(c: string): string {
  if (c === "high") return "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300";
  if (c === "medium") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300";
  if (c === "low") return "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300";
}

export default function EvidencePanel({ identification }: { identification: Identification }) {
  const { t } = useLang();
  const id = t.ident;
  const [techOpen, setTechOpen] = useState(false);
  const ident = identification;

  return (
    <div className="mt-6 space-y-4">
      {/* 🧾 WHAT IS THIS? */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">🧾 {id.whatIsIt}</h2>
        <p className="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-50">{ident.whatType}</p>
        {ident.orgName && (
          <p className="mt-1 text-base text-zinc-700 dark:text-zinc-300">
            {id.identificationWord}: <span className="font-semibold">{ident.orgName}</span>
            {ident.location ? ` · ${id.typeGeo}: ${ident.location}` : ""}
          </p>
        )}
        {!ident.orgName && ident.location && (
          <p className="mt-1 text-base text-zinc-700 dark:text-zinc-300">
            {id.identificationWord}: <span className="font-semibold">{ident.location}</span>
          </p>
        )}
        {!ident.orgName && !ident.location && (
          <p className="mt-2 text-sm italic text-zinc-500">{id.cannotOrg}</p>
        )}
        {ident.orgSelfDeclared && (
          <p className="mt-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400">
            ⚠ {id.selfDeclaredNote}
          </p>
        )}
      </section>

      {/* 🎯 WHAT DOES IT DO? */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">🎯 {id.whatItDoes}</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-800 dark:text-zinc-200">{ident.purpose}</p>
      </section>

      {/* 🔎 HOW WE IDENTIFIED IT */}
      {ident.evidence.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">🔎 {id.howIdentified}</h2>
          <ul className="mt-3 space-y-2">
            {ident.evidence.map((ev, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <span className="mt-0.5 text-teal-500">✓</span>
                {ev}
              </li>
            ))}
          </ul>
          {ident.sources.length > 0 && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{id.sourcesChecked}</p>
              <ul className="mt-1.5 space-y-1">
                {ident.sources.map((s, i) => (
                  <li key={i} className="text-xs text-zinc-500">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 🛡️ SAFETY ANALYSIS */}
      <section className={`rounded-2xl border p-6 ${riskBadge(ident.risk)}`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">🛡️ {id.safetyAnalysis}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-base font-bold">
            {id.riskWord}: {riskLabel(ident.risk, t)}
            <span className="ml-2 rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold dark:bg-white/10">
              {id.confidenceWord}: {formatConfidence(ident.riskConfidence, t)}
            </span>
          </p>
        </div>
        <p className="mt-2 text-sm">
          {id.identificationWord}: {ident.orgName ?? ident.location ?? id.confUnknown}
          <span className="ml-2 rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold dark:bg-white/10">
            {id.confidenceWord}:{" "}
            <span className={confBadge(ident.idConfidence)}>{formatConfidence(ident.idConfidence, t)}</span>
          </span>
        </p>
      </section>

      {/* ⚠️ IMPORTANT — what could NOT be verified */}
      {ident.cannotVerify.length > 0 && (
        <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-800 dark:bg-yellow-950/20">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-400">⚠️ {id.important}</h2>
          <ul className="mt-3 space-y-2">
            {ident.cannotVerify.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ✅ WHAT SHOULD I DO? */}
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-950/20">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">✅ {id.whatShouldDo}</h2>
        <p className="mt-3 text-base leading-relaxed text-teal-800 dark:text-teal-300">{ident.recommendation}</p>
      </section>

      {/* Expandable technical details */}
      {ident.techDetails.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setTechOpen(!techOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
          >
            <span>🔧 {id.techDetails}</span>
            <span className="text-zinc-500">{techOpen ? "▲" : "▼"}</span>
          </button>
          {techOpen && (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <ul className="space-y-1.5">
                {ident.techDetails.map((d, i) => (
                  <li key={i} className="break-all font-mono text-xs text-zinc-500">{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
