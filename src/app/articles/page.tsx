"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";

type Article = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type Report = {
  id: number;
  user_id: string;
  title: string;
  category: string;
  platform: string;
  description: string;
  created_at: string;
};

export default function ArticlesPage() {
  const { t } = useLang();
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-zinc-500">
          {t.common.loading}
        </div>
      }
    >
      <ArticlesContent />
    </Suspense>
  );
}

function ArticlesContent() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "community" ? "community" : "news";
  const [tab, setTab] = useState<"news" | "community">(initialTab);

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articlesError, setArticlesError] = useState<string | null>(null);

  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user ?? null);
    });

    async function loadArticles() {
      try {
        const res = await fetch("/api/articles");
        const data = await res.json();
        if (data.error) {
          setArticlesError(data.error);
        } else {
          setArticles(data.articles);
        }
      } catch {
        setArticlesError(t.articles.loadError);
      } finally {
        setLoadingArticles(false);
      }
    }

    async function loadReports() {
      const { data, error } = await supabase
        .from("community")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setReports(data);
      }
      setLoadingReports(false);
    }

    loadArticles();
    loadReports();
  }, [t.articles.loadError]);

  async function handleDelete(reportId: number) {
    const confirmed = window.confirm(t.articles.deleteConfirm);
    if (!confirmed) return;

    setDeletingId(reportId);

    const { error } = await supabase
      .from("community")
      .delete()
      .eq("id", reportId);

    setDeletingId(null);

    if (!error) {
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } else {
      alert(`${t.common.error}: ${error.message}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-medium text-teal-500">{t.articles.badge}</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        {t.articles.title}
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        {t.articles.description}
      </p>

      {/* Tabs */}
      <div className="mt-8 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setTab("news")}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "news"
              ? "border-teal-500 text-teal-400"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {t.articles.latestNews}
        </button>
        <button
          onClick={() => setTab("community")}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "community"
              ? "border-teal-500 text-teal-400"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {t.articles.communityReports}
        </button>
      </div>

      {/* News tab */}
      {tab === "news" && (
        <div className="mt-8">
          {loadingArticles && (
            <p className="text-sm text-zinc-500">{t.articles.loadingArticles}</p>
          )}
          {articlesError && (
            <p className="text-sm text-red-500">{articlesError}</p>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {articles.map((article, i) => (
              <a
                key={i}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-teal-700 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="text-xs font-medium text-teal-400">
                  {article.source}
                </span>
                <h3 className="mt-2 text-base font-semibold leading-snug text-zinc-900 group-hover:text-teal-400 dark:text-zinc-50">
                  {article.title}
                </h3>
                <span className="mt-3 text-xs text-zinc-600 dark:text-zinc-500">
                  {new Date(article.pubDate).toLocaleDateString()}
                </span>
                <span className="mt-4 text-sm font-medium text-teal-400">
                  {t.articles.readFull}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Community tab */}
      {tab === "community" && (
        <div className="mt-8">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              {t.articles.communityDesc}
            </p>
            <Link
              href="/report"
              className="whitespace-nowrap rounded-full bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-teal-400"
            >
              {t.articles.shareYours}
            </Link>
          </div>

          {loadingReports && (
            <p className="text-sm text-zinc-500">{t.articles.loadingReports}</p>
          )}

          {!loadingReports && reports.length === 0 && (
            <p className="text-sm text-zinc-500">
              {t.articles.noReports}
            </p>
          )}

          <div className="space-y-4">
            {reports.map((r) => {
              const isOwner = currentUser?.id === r.user_id;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                      {r.category}
                    </span>
                    <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {r.platform}
                    </span>
                    <span className="ml-auto text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {r.description}
                  </p>

                  {isOwner && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="mt-4 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {deletingId === r.id ? t.common.deleting : t.articles.deleteBtn}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
