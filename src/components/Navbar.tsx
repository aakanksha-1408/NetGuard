"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";
import { LANGUAGES, type Lang } from "@/lib/i18n/types";
import Toast from "./Toast";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const { t, lang, setLang } = useLang();

  const closeToast = useCallback(() => setToast(null), []);

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

        <div className="flex items-center gap-3">
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
              <span className="hidden text-sm text-zinc-500 md:inline dark:text-zinc-400">
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
      </div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}
    </header>
  );
}
