"use client";

import { useLang } from "@/lib/i18n/context";

/**
 * PWA offline fallback - precached by public/sw.js and served when a
 * navigation fails without a network.
 *
 * Deliberately dependency-free: no Supabase, no auth, no API calls, nothing
 * that needs a connection. Fully client-prerendered ("use client" only for
 * the useLang i18n context and the reload button), and it is NOT behind any
 * auth redirect - there is no middleware/proxy in this project - so the
 * service worker can precache it at install time.
 *
 * Styling reuses the existing card/button conventions (zinc borders, teal
 * CTA); the page inherits Navbar/Footer from the root layout like every
 * other route.
 */
export default function OfflinePage() {
  const { t } = useLang();

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <img
          src="/logo.png?v=2"
          alt="NetGuard logo"
          className="mx-auto h-16 w-16 object-contain"
        />
        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">
          {t.offline.title}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {t.offline.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-full bg-teal-500 px-8 py-3 text-sm font-semibold text-black transition hover:bg-teal-400"
        >
          {t.offline.retry}
        </button>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
          {t.offline.note}
        </p>
      </div>
    </main>
  );
}
