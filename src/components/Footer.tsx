"use client";

import { useLang } from "@/lib/i18n/context";

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          © {new Date().getFullYear()} NetGuard. {t.footer.copyright}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {t.footer.tagline}
        </p>
      </div>
    </footer>
  );
}
