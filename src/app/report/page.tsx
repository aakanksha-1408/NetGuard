"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";

export default function ReportPage() {
  const { t } = useLang();
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-6 py-24 text-center text-zinc-500">
          {t.common.loading}
        </div>
      }
    >
      <ReportForm />
    </Suspense>
  );
}

function ReportForm() {
  const router = useRouter();
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const CATEGORIES = t.report.categories as string[];
  const PLATFORMS = t.report.platforms as string[];

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setCheckingAuth(false);
      if (!data.user) {
        router.push("/login");
      }
    });
  }, [router]);

  useEffect(() => {
    const prefill = searchParams.get("prefill");
    if (prefill) {
      setDescription(prefill);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.from("community").insert([
      {
        user_id: user?.id,
        title,
        category,
        platform,
        description,
      },
    ]);

    setSubmitting(false);

    if (error) {
      setMessage(`${t.report.error} ${error.message}`);
    } else {
      setMessage(t.report.success);
      setTimeout(() => {
        router.push("/articles?tab=community");
      }, 1200);
    }
  }

  if (checkingAuth) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center text-zinc-500">
        {t.report.checkingAuth}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-medium text-teal-500">{t.report.badge}</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        {t.report.title}
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        {t.report.description}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.report.titleLabel}</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.report.titlePlaceholder}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t.report.categoryLabel}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t.report.platformLabel}
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {t.report.whatHappened}
          </label>
          <textarea
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.report.whatHappenedPlaceholder}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-teal-500 px-4 py-3 font-semibold text-black transition hover:bg-teal-400 disabled:opacity-50"
        >
          {submitting ? t.report.submitting : t.report.submitBtn}
        </button>
      </form>

      {message && <p className="mt-5 text-sm text-zinc-400">{message}</p>}
    </div>
  );
}
