"use client";

import { useEffect, useMemo, useState } from "react";
import ScamHeatmap from "@/components/ScamHeatmap";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ScamReport = {
  id: string;
  article_link: string;
  title: string;
  source: string;
  published_at: string | null;
  category: string;
  platform: string;
  confidence: string;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Palette for recharts bars                                           */
/* ------------------------------------------------------------------ */

const TEAL_PALETTE = [
  "#14b8a6",
  "#0d9488",
  "#0f766e",
  "#115e59",
  "#134e4a",
  "#042f2e",
  "#2dd4bf",
  "#5eead4",
];

/* ------------------------------------------------------------------ */
/* Confidence badge                                                    */
/* ------------------------------------------------------------------ */

function ConfidenceBadge({ level }: { level: string }) {
  const cls =
    level === "high"
      ? "bg-teal-950/60 border-teal-700 text-teal-300"
      : level === "medium"
        ? "bg-amber-950/60 border-amber-700 text-amber-300"
        : "bg-zinc-900 border-zinc-700 text-zinc-400";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {level}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */

export default function HeatmapPage() {
  const [reports, setReports] = useState<ScamReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [timeFilter, setTimeFilter] = useState("all");

  /* ---- Fetch scam reports from API ---- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/scam-reports");
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setSetupRequired(!!data.setupRequired);
        } else {
          setReports(data.reports ?? []);
        }
      } catch {
        setError("Couldn't connect to the server. Please try again later.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---- Unique filter values ---- */
  const allCategories = useMemo(
    () => [...new Set(reports.map((r) => r.category))].sort(),
    [reports],
  );
  const allPlatforms = useMemo(
    () => [...new Set(reports.map((r) => r.platform))].sort(),
    [reports],
  );
  const allSources = useMemo(
    () => [...new Set(reports.map((r) => r.source))].sort(),
    [reports],
  );

  /* ---- Filtered subset ---- */
  const filtered = useMemo(() => {
    let list = reports;

    if (categoryFilter !== "All")
      list = list.filter((r) => r.category === categoryFilter);
    if (platformFilter !== "All")
      list = list.filter((r) => r.platform === platformFilter);
    if (sourceFilter !== "All")
      list = list.filter((r) => r.source === sourceFilter);

    if (timeFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (timeFilter) {
        case "7d":
          cutoff = new Date(now.getTime() - 7 * 86_400_000);
          break;
        case "30d":
          cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case "3m":
          cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case "1y":
          cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          cutoff = new Date(0);
      }
      list = list.filter((r) => {
        const date = r.published_at ? new Date(r.published_at) : new Date(r.created_at);
        return date >= cutoff;
      });
    }

    return list;
  }, [reports, categoryFilter, platformFilter, sourceFilter, timeFilter]);

  /* ---- Aggregations ---- */
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) map[r.category] = (map[r.category] || 0) + 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const platformCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) map[r.platform] = (map[r.platform] || 0) + 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const { matrix, maxValue } = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    let max = 0;
    for (const r of filtered) {
      if (!matrix[r.category]) matrix[r.category] = {};
      const prev = matrix[r.category][r.platform] || 0;
      matrix[r.category][r.platform] = prev + 1;
      if (prev + 1 > max) max = prev + 1;
    }
    return { matrix, maxValue: max };
  }, [filtered]);

  /* ---- Insights ---- */
  const insights = useMemo(() => {
    const topCategory = categoryCounts[0];
    const topPlatform = platformCounts[0];

    let topCombo = { category: "—", platform: "—", count: 0 };
    for (const [cat, plats] of Object.entries(matrix)) {
      for (const [plat, count] of Object.entries(plats)) {
        if (count > topCombo.count) topCombo = { category: cat, platform: plat, count };
      }
    }

    return {
      total: filtered.length,
      topCategory: topCategory ? `${topCategory.name} (${topCategory.value})` : "—",
      topPlatform: topPlatform ? `${topPlatform.name} (${topPlatform.value})` : "—",
      topCombo:
        topCombo.count > 0
          ? `${topCombo.category} on ${topCombo.platform} (${topCombo.count})`
          : "—",
    };
  }, [filtered, categoryCounts, platformCounts, matrix]);

  /* ---- Tooltip style ---- */
  const tooltipStyle = {
    backgroundColor: "#09090b",
    border: "1px solid #27272a",
    borderRadius: "8px",
    color: "#a1a1aa",
    fontSize: "12px",
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-500">
            Analyzing live news articles&hellip;
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-2xl border border-red-900 bg-red-950/30 p-8">
          <p className="text-center text-lg font-semibold text-red-400">
            Couldn&apos;t load scam data
          </p>
          <p className="mt-2 text-center text-sm text-zinc-400">{error}</p>

          {setupRequired && (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-sm font-semibold text-zinc-200">
                Setup required: create the scam_reports table
              </p>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-zinc-400">
                <li>
                  Open your{" "}
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 underline"
                  >
                    Supabase Dashboard
                  </a>
                </li>
                <li>Navigate to Settings → API</li>
                <li>
                  Copy the <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-teal-300">service_role</code> secret key
                </li>
                <li>
                  Paste it into <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-teal-300">.env.local</code> as{" "}
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-teal-300">SUPABASE_SERVICE_ROLE_KEY=your_key</code>
                </li>
                <li>Restart the dev server and reload this page</li>
              </ol>
              <p className="mt-4 text-xs text-zinc-500">
                Once configured, the table will be created automatically on the
                next page load.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Alternatively, run{" "}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-teal-300">
                  supabase/scam_reports.sql
                </code>{" "}
                directly in the Supabase SQL Editor.
              </p>
            </div>
          )}

          <div className="mt-5 text-center">
            <button
              onClick={() => window.location.reload()}
              className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16 text-center">
        <p className="text-4xl">📊</p>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Scam Heatmap</h1>
        <p className="mt-3 max-w-md mx-auto text-zinc-600 dark:text-zinc-400">
          No scam-related articles were detected from the live news feed.
          As new articles about scams, fraud, and cybercrime are published,
          they&apos;ll automatically appear here.
        </p>
        <a
          href="/articles"
          className="mt-6 inline-block rounded-full bg-teal-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-teal-400"
        >
          View latest articles
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      {/* Header */}
      <p className="text-sm font-medium text-teal-500">Analytics dashboard</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">Scam Heatmap</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Automatically analyzed from {reports.length} scam-related news article
        {reports.length !== 1 && "s"} sourced from live Google News feeds.
        The heatmap reveals trends by scam category and platform.
      </p>

      {/* ---- Stat cards ---- */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Scam Articles Detected", value: String(insights.total), icon: "📋" },
          { label: "Top Scam Category", value: insights.topCategory, icon: "⚠️" },
          { label: "Top Platform", value: insights.topPlatform, icon: "📱" },
          { label: "Highest Combo", value: insights.topCombo, icon: "🔥" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="text-2xl" aria-hidden="true">{stat.icon}</span>
            <p className="mt-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              {stat.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ---- Filters ---- */}
      <div className="mt-8 flex flex-wrap items-end gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={["All", ...allCategories]}
        />
        <FilterSelect
          label="Platform"
          value={platformFilter}
          onChange={setPlatformFilter}
          options={["All", ...allPlatforms]}
        />
        <FilterSelect
          label="News source"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={["All", ...allSources]}
        />
        <FilterSelect
          label="Time period"
          value={timeFilter}
          onChange={setTimeFilter}
          options={[
            { value: "all", label: "All time" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "3m", label: "Last 3 months" },
            { value: "1y", label: "Last year" },
          ]}
        />
        <span className="ml-auto text-xs text-zinc-500">
          Showing {filtered.length} of {reports.length} reports
        </span>
      </div>

      {/* ---- Bar charts ---- */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Scam Categories</h2>
          <p className="mb-4 text-xs text-zinc-500">Number of scam articles per category</p>
          {categoryCounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">No data for selected filters</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, categoryCounts.length * 44)}>
              <BarChart data={categoryCounts} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {categoryCounts.map((_, i) => (
                    <Cell key={i} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Platforms</h2>
          <p className="mb-4 text-xs text-zinc-500">Number of scam articles per platform</p>
          {platformCounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">No data for selected filters</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, platformCounts.length * 44)}>
              <BarChart data={platformCounts} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {platformCounts.map((_, i) => (
                    <Cell key={i} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ---- Heatmap grid ---- */}
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Category × Platform Heatmap</h2>
        <p className="mb-6 text-xs text-zinc-500">
          Each cell shows the number of scam news articles for that category/platform combination.
          Darker cells indicate more articles.
        </p>
        <ScamHeatmap
          categories={allCategories}
          platforms={allPlatforms}
          matrix={matrix}
          maxValue={maxValue}
        />
      </div>

      {/* ---- Insights ---- */}
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Key Insights</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Reports analyzed", value: String(insights.total) },
            { label: "Most reported category", value: insights.topCategory },
            { label: "Most reported platform", value: insights.topPlatform },
            { label: "Highest category + platform", value: insights.topCombo },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-teal-400">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Recent scam reports list ---- */}
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent Scam Reports</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Latest scam-related news articles detected from live feeds.
        </p>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-600">
            No reports match the current filters.
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 20).map((r) => (
              <a
                key={r.id}
                href={r.article_link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-teal-700 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                    {r.category}
                  </span>
                  <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {r.platform}
                  </span>
                  <ConfidenceBadge level={r.confidence} />
                  <span className="ml-auto text-xs text-zinc-500">
                    {r.published_at
                      ? new Date(r.published_at).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-snug text-zinc-900 group-hover:text-teal-400 dark:text-zinc-100">
                  {r.title}
                </h3>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{r.source}</span>
                  <span className="text-teal-500">→ Open article</span>
                </div>
              </a>
            ))}

            {filtered.length > 20 && (
              <p className="text-center text-xs text-zinc-500">
                Showing 20 of {filtered.length} reports. Use filters to narrow results.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter select sub-component                                         */
/* ------------------------------------------------------------------ */

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {options.map((opt) => {
          const val = typeof opt === "string" ? opt : opt.value;
          const lbl = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
    </div>
  );
}
