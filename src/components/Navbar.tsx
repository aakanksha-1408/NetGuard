"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";
import { LANGUAGES, type Lang } from "@/lib/i18n/types";
import Toast from "./Toast";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const { t, lang, setLang } = useLang();

  const closeToast = useCallback(() => setToast(null), []);

  // Desktop + mobile tool destinations, all translated via nav i18n keys.
  const tools = [
    { href: "/quiz", label: t.nav.footprint },
    { href: "/articles", label: t.nav.articles },
    { href: "/articles?tab=community", label: t.nav.community },
    { href: "/chatbot", label: t.nav.investigator },
    { href: "/heatmap", label: t.nav.heatmap },
    { href: "/qr-scanner", label: t.nav.qrScanner },
    { href: "/link-checker", label: t.nav.linkChecker },
  ];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Close both menus whenever the route changes (works for back/forward too).
  useEffect(() => {
    setToolsOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close the Tools dropdown on outside click or Escape key.
  useEffect(() => {
    if (!toolsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setToolsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setToast({ message: t.nav.loggedOut, type: "success" });
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="NetGuard logo" className="h-12 w-12 object-contain" />
          <span className="text-lg font-bold text-zinc-900 dark:text-white">NetGuard</span>
        </Link>

        {/* Desktop nav: Tools dropdown + language + login/logout */}
        <div className="hidden items-center gap-3 md:flex">
          <div className="relative" ref={toolsRef}>
            <button
              type="button"
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {t.nav.tools}
              <svg
                className={`h-4 w-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {toolsOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                {tools.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-2 text-sm text-zinc-700 transition hover:bg-teal-50 hover:text-teal-700 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-teal-400"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none transition focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label={t.nav.language}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          {user ? (
            <>
              <span className="hidden text-sm text-zinc-500 lg:inline dark:text-zinc-400">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {t.nav.logout}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-teal-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-teal-400"
            >
              {t.nav.login}
            </Link>
          )}
        </div>

        {/* Mobile hamburger toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={t.nav.menu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 md:hidden"
        >
          {mobileOpen ? (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M3 5.75A.75.75 0 013.75 5h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 5.75zm0 4.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10zm.75 3.5a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H3.75z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile expanded menu: flat tool links + language + login/logout */}
      {mobileOpen && (
        <div className="border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-black md:hidden">
          <ul className="flex flex-col gap-1">
            {tools.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-teal-50 hover:text-teal-700 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-teal-400"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none transition focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              aria-label={t.nav.language}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>

            {user ? (
              <button
                onClick={handleLogout}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {t.nav.logout}
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-teal-500 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-teal-400"
              >
                {t.nav.login}
              </Link>
            )}
          </div>

          {user?.email && (
            <p className="mt-2 truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
          )}
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}
    </header>
  );
}
