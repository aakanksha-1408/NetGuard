"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/context";

const FEATURES = [
  { href: "/quiz", icon: "\ud83e\udde0", titleKey: "footprintScore", descKey: "footprintDesc" },
  { href: "/identity-map", icon: "\ud83d\udd78\ufe0f", titleKey: "identityMap", descKey: "identityMapDesc" },
  { href: "/articles", icon: "\ud83d\udcd6", titleKey: "articles", descKey: "articlesDesc" },
  { href: "/chatbot", icon: "\ud83d\udd0d", titleKey: "scamInvestigator", descKey: "scamInvestigatorDesc" },
  { href: "/heatmap", icon: "\ud83d\uddfa\ufe0f", titleKey: "scamHeatmap", descKey: "scamHeatmapDesc" },
] as const;

export default function Home() {
  const { t } = useLang();

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white dark:from-teal-950/40 dark:via-black dark:to-black">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(20,184,166,0.10),transparent_50%)] dark:bg-[radial-gradient(circle_at_25%_15%,rgba(20,184,166,0.14),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_55%,rgba(6,182,212,0.08),transparent_45%)] dark:bg-[radial-gradient(circle_at_75%_55%,rgba(6,182,212,0.1),transparent_45%)]" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex items-center rounded-full border border-teal-300 bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
              {t.home.badge}
            </p>

            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent dark:from-teal-400 dark:to-cyan-400">
                {t.home.heroTitle.split(".")[0]}.
              </span>{" "}
              {t.home.heroTitle.split(".")[1]}.{" "}
              <span className="text-zinc-900 dark:text-zinc-50">
                {t.home.heroTitle.split(".")[2]}
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t.home.heroDescription}
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/qr-scanner"
                className="inline-flex h-12 items-center justify-center rounded-full bg-teal-500 px-8 text-sm font-semibold text-black shadow-lg shadow-teal-500/25 transition hover:bg-teal-400"
              >
                {t.home.ctaQr}
              </Link>
              <Link
                href="/link-checker"
                className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 bg-white px-8 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              >
                {t.home.ctaLink}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {t.home.toolsTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            {t.home.toolsDescription}
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ href, icon, titleKey, descKey }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-teal-500 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-teal-700"
            >
              <span className="text-3xl" aria-hidden="true">
                {icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 group-hover:text-teal-600 dark:text-zinc-50 dark:group-hover:text-teal-400">
                {t.home[titleKey]}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t.home[descKey]}
              </p>
              <span className="mt-4 text-sm font-medium text-teal-600 dark:text-teal-400">
                {t.home.explore}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section className="border-y border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                {t.home.missionTitle}
              </h2>
              <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t.home.mission1}
              </p>
              <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t.home.mission2}
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { stat: t.home.statPermanent, label: t.home.statPermanentLabel },
                { stat: t.home.statPublic, label: t.home.statPublicLabel },
                { stat: t.home.statPowerful, label: t.home.statPowerfulLabel },
              ].map((item, i) => (
                <li
                  key={i}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <p className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                    {item.stat}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.label}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
