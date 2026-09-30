"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  investigateMessage,
  SAMPLE_INVESTIGATIONS,
  type InvestigationResult,
  type RedFlag,
  type RiskBand,
  type FlagSeverity,
} from "@/lib/scamInvestigator";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface AiInsight {
  additionalInsights: string;
  socialEngineeringTechniques: string[];
  scammerIntent: string;
  subtleRedFlags: string[];
  detailedExplanation: string;
  recommendedActions: string[];
}

type View = "input" | "scanning" | "result" | "history" | "newsResult";
type Mode = "scam" | "news";

interface HistoryItem {
  id: string;
  message: string;
  risk_score: number;
  scam_type: string;
  risk_band: string;
  created_at: string;
  result: InvestigationResult;
}

interface NewsCheckResult {
  verdict: string;
  confidence: string;
  reasoning: string;
  redFlags: string[];
  suggestion: string;
}

interface NewsHistoryItem {
  id: string;
  input_text: string;
  verdict: string;
  confidence: string;
  red_flags: string[];
  reasoning: string;
  suggestion: string;
  created_at: string;
}

type HistoryEntry =
  | { type: "scam"; data: HistoryItem }
  | { type: "news"; data: NewsHistoryItem };

/* ------------------------------------------------------------------ */
/* Risk score gauge (SVG circle)                                       */
/* ------------------------------------------------------------------ */

function RiskGauge({ score, band }: { score: number; band: RiskBand }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;

  const color =
    score >= 81
      ? "#ef4444"
      : score >= 61
        ? "#f97316"
        : score >= 41
          ? "#eab308"
          : score >= 21
            ? "#22c55e"
            : "#14b8a6";

  const labelColor =
    score >= 61
      ? "text-red-400"
      : score >= 41
        ? "text-yellow-400"
        : "text-green-400";

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-zinc-50">{score}</span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
      </div>
      <span className={`mt-2 text-sm font-bold ${labelColor}`}>{band}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Severity dot                                                        */
/* ------------------------------------------------------------------ */

function SeverityDot({ severity }: { severity: FlagSeverity }) {
  const color =
    severity === "critical"
      ? "bg-red-500"
      : severity === "high"
        ? "bg-orange-500"
        : severity === "medium"
          ? "bg-yellow-500"
          : "bg-green-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

/* ------------------------------------------------------------------ */
/* Red flag card                                                       */
/* ------------------------------------------------------------------ */

function RedFlagCard({
  flag,
  expanded,
  onToggle,
}: {
  flag: RedFlag;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 text-left"
      >
        <SeverityDot severity={flag.severity} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{flag.label}</p>
          <p className="mt-1 text-xs text-zinc-400">{flag.explanation}</p>
          {flag.evidence && (
            <p className="mt-1.5 rounded bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-500">
              Evidence: &quot;{flag.evidence}&quot;
            </p>
          )}
        </div>
        <span className="text-xs text-teal-500">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="text-xs font-medium text-teal-400">Why is this dangerous?</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{flag.education}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scanning animation                                                  */
/* ------------------------------------------------------------------ */

const SCAN_STEPS = [
  "Analyzing message content...",
  "Detecting scam patterns...",
  "Checking red flags...",
  "Classifying scam type...",
  "Evaluating risk score...",
  "Preparing recommendations...",
];

function ScanningView({ steps }: { steps: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, 400);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-ping rounded-full bg-teal-500/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-teal-500 bg-teal-950/30">
          <span className="text-2xl">🔍</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-200">{steps[step]}</p>
        <div className="mx-auto mt-3 h-1 w-48 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-teal-500 transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

/**
 * Stable per-browser identifier used by the server to throttle real Gemini
 * calls for logged-out visitors (free tier shares 20 requests/DAY across ALL
 * users). Persisted in localStorage — same pattern as the language preference
 * in src/lib/i18n/context.tsx. Signed-in state isn't needed here: the routes
 * only use this id as a cooldown key.
 */
function getAiSessionId(): string {
  const KEY = "ng_ai_session_id";
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "no-storage"; // private mode etc. — server groups these under one key
  }
}

export default function ScamChatbot() {
  const { lang, t } = useLang();
  const [view, setView] = useState<View>("input");
  const [mode, setMode] = useState<Mode>("scam");
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [newsResult, setNewsResult] = useState<NewsCheckResult | null>(null);
  const [expandedFlags, setExpandedFlags] = useState<Set<number>>(new Set());
  const [selectedExposure, setSelectedExposure] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsErrorType, setNewsErrorType] = useState<string | null>(null);
  const [newsCached, setNewsCached] = useState(false);
  const [insightCached, setInsightCached] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const startInvestigation = useCallback(
    async (text: string) => {
      const fullText = url ? `${text}\n${url}` : text;
      if (!fullText.trim()) return;

      setInput(fullText);
      setView("scanning");
      setExpandedFlags(new Set());
      setSelectedExposure(null);
      setCopied(false);
      setAiInsight(null);
      setAiError(null);
      setInsightCached(false);
      setAiLoading(true);

      // Simulate analysis delay
      await new Promise((r) => setTimeout(r, 2400));

      const investigation = investigateMessage(fullText);
      setResult(investigation);
      setView("result");

      // Persist investigation history ONLY for signed-in users. Logged-out
      // visitors still get full in-session analysis (local + AI), we simply don't
      // write an anonymous (user_id IS NULL) row. RLS no longer allows anonymous
      // reads on this table either (see supabase/rls_hardening_part3.sql).
      if (user) {
        try {
          await supabase.from("scam_investigations").insert([
            {
              user_id: user.id,
              message: fullText,
              risk_score: investigation.riskScore,
              scam_type: investigation.scamType,
              risk_band: investigation.riskBand,
              result: investigation as any,
            },
          ]);
        } catch {
          // fail silently — history is non-critical
        }
      }

      // Call Gemini AI for additional insights
      try {
        const response = await fetch("/api/gemini/investigate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: fullText,
            localResult: {
              riskScore: investigation.riskScore,
              riskBand: investigation.riskBand,
              scamType: investigation.scamType,
              redFlags: investigation.redFlags.map((f) => ({
                label: f.label,
                explanation: f.explanation,
                severity: f.severity,
              })),
              entities: investigation.entities,
            },
            lang,
            sessionId: getAiSessionId(),
          }),
        });
        const data = await response.json();
        if (data.aiInsight) {
          setAiInsight(data.aiInsight);
          setInsightCached(!!data.cached);
        } else if (data.apiKeyMissing) {
          setAiError("AI analysis not configured. Add GOOGLE_GEMINI_API_KEY to enable.");
        } else if (data.error) {
          setAiError(data.error); // server already localizes quota/cooldown messages
        }
      } catch {
        setAiError("AI analysis temporarily unavailable. Local analysis is still shown below.");
      } finally {
        setAiLoading(false);
      }
    },
    [url, user, lang],
  );

  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) return;
    if (file.size > 10 * 1024 * 1024) return; // 10 MB max

    setImageMime(file.type);
    setImagePreview(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setImageData(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageData(null);
    setImageMime(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [imagePreview]);

  const startNewsCheck = useCallback(
    async (text: string) => {
      if (!text.trim() && !imageData) return;

      setInput(text);
      setView("scanning");
      setCopied(false);
      setNewsError(null);
      setNewsErrorType(null);
      setNewsCached(false);

      // Simulate analysis delay
      await new Promise((r) => setTimeout(r, 2000));

      // Call Gemini news-check API
      try {
        const response = await fetch("/api/gemini/news-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            lang,
            imageData: imageData ?? undefined,
            imageMimeType: imageMime ?? undefined,
            sessionId: getAiSessionId(),
          }),
        });
        const data = await response.json();

        if (data.result) {
          const nr: NewsCheckResult = data.result;
          setNewsResult(nr);
          setNewsCached(!!data.cached);
          setView("newsResult");

          // Persist ONLY for signed-in users (see scam_investigations note above).
          // Logged-out users still see the result in-session; nothing is written.
          if (user) {
            try {
              await supabase.from("news_checks").insert([{
                user_id: user.id,
                input_text: text,
                verdict: nr.verdict,
                confidence: nr.confidence,
                red_flags: nr.redFlags,
                reasoning: nr.reasoning,
                suggestion: nr.suggestion,
              }]);
            } catch {
              // fail silently — history is non-critical
            }
          }
        } else if (data.apiKeyMissing) {
          setNewsError("AI fact-checking is not configured on this site.");
          setNewsErrorType("config");
          setView("newsResult");
        } else {
          setNewsError(data.error || t.scamChatbot.analysisUnavailable);
          setNewsErrorType(data.errorType ?? "unavailable");
          setView("newsResult");
        }
      } catch {
        setNewsError(t.scamChatbot.analysisUnavailable);
        setView("newsResult");
      }
    },
    [user, lang, imageData, imageMime, t],
  );

  async function loadHistory() {
    // History is only persisted for signed-in users; nothing to load otherwise.
    if (!user) return;
    // Fetch both scam investigations and news checks in parallel
    const [scamRes, newsRes] = await Promise.all([
      supabase
        .from("scam_investigations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("news_checks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const scamEntries: HistoryEntry[] = (scamRes.data ?? []).map((d) => ({
      type: "scam" as const,
      data: d as HistoryItem,
    }));
    const newsEntries: HistoryEntry[] = (newsRes.data ?? []).map((d) => ({
      type: "news" as const,
      data: d as NewsHistoryItem,
    }));

    // Merge and sort by date descending
    const combined = [...scamEntries, ...newsEntries].sort(
      (a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime(),
    );
    setHistory(combined);
    setView("history");
  }

  function copyReport() {
    if (!result) return;
    const text = buildReportText(result, input);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function toggleFlag(idx: number) {
    setExpandedFlags((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-500">{t.scamChatbot.badge}</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {t.scamChatbot.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {mode === "scam" ? t.scamChatbot.description : t.scamChatbot.newsPlaceholder}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {view !== "input" && view !== "scanning" && (
            <button
              onClick={() => { setView("input"); setResult(null); setNewsResult(null); setNewsError(null); setInput(""); setUrl(""); removeImage(); }}
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
            >
              {t.scamChatbot.newInvestigation}
            </button>
          )}
          {user && (
            <button
              onClick={loadHistory}
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {t.scamChatbot.myInvestigations}
            </button>
          )}
        </div>
      </header>

      {/* ---- INPUT VIEW ---- */}
      {view === "input" && (
        <div className="flex-1">
          {/* Mode toggle */}
          <div className="mb-4 flex gap-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
            <button
              onClick={() => setMode("scam")}
              className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold transition ${
                mode === "scam"
                  ? "bg-teal-500 text-black"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.scamChatbot.modeScam}
            </button>
            <button
              onClick={() => setMode("news")}
              className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold transition ${
                mode === "news"
                  ? "bg-teal-500 text-black"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.scamChatbot.modeNews}
            </button>
          </div>

          {/* Sensitive info warning */}
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/20">
            <p className="text-xs text-red-700 dark:text-red-300">
              ⚠️ {t.scamChatbot.warning}
            </p>
          </div>

          {/* Message input */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-200">
              {mode === "scam" ? t.scamChatbot.scanMessage : t.scamChatbot.newsVerdict}
            </label>
            <p className="mt-1 text-xs text-zinc-500">
              {mode === "scam" ? t.scamChatbot.scanDesc : t.scamChatbot.newsPlaceholder}
            </p>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "scam" ? t.scamChatbot.messagePlaceholder : t.scamChatbot.newsPlaceholder}
              rows={6}
              className="mt-3 w-full resize-none rounded-xl border border-zinc-300 bg-white p-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />

            {/* URL input */}
            <div className="mt-3">
              <label className="text-xs font-medium text-zinc-400">
                {mode === "scam" ? t.scamChatbot.urlLabel : t.scamChatbot.newsUrlLabel}
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              />
            </div>

            <button
              onClick={() => {
                if (mode === "scam") {
                  startInvestigation(input);
                } else {
                  startNewsCheck(input);
                }
              }}
              disabled={!input.trim() && !url.trim() && !imageData}
              className="mt-4 w-full rounded-full bg-teal-500 px-6 py-3 text-sm font-bold text-black transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mode === "scam" ? t.scamChatbot.investigateBtn : t.scamChatbot.newsInvestigateBtn}
            </button>

            {/* Image upload (news mode only) */}
            {mode === "news" && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400">
                  {t.scamChatbot.newsImageLabel}
                </label>
                {imagePreview ? (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Upload preview"
                      className="max-h-48 rounded-xl border border-zinc-700"
                    />
                    <button
                      onClick={removeImage}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white transition hover:bg-red-400"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleImageSelect(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 transition ${
                      dragOver
                        ? "border-teal-500 bg-teal-950/20"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    <span className="text-2xl">🖼️</span>
                    <p className="mt-2 text-xs text-zinc-400">
                      {t.scamChatbot.newsImageDrop}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-600">
                      {t.scamChatbot.newsImageFormats}
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageSelect(file);
                  }}
                />
              </div>
            )}
          </div>

          {/* Sample investigations (scam mode only) */}
          {mode === "scam" && (
            <div className="mt-8">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-300">{t.scamChatbot.trySample}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SAMPLE_INVESTIGATIONS.map((sample) => (
                  <button
                    key={sample.label}
                    onClick={() => {
                      setInput(sample.text);
                      startInvestigation(sample.text);
                    }}
                    className="group rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-teal-700 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <span className="text-xl">{sample.emoji}</span>
                    <p className="mt-2 text-sm font-semibold text-zinc-900 group-hover:text-teal-400 dark:text-zinc-200">
                      {sample.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                      {sample.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- SCANNING VIEW ---- */}
      {view === "scanning" && (
        <ScanningView steps={mode === "scam" ? t.scamChatbot.scanSteps : [t.scamChatbot.newsAnalyzing]} />
      )}

      {/* ---- RESULT VIEW ---- */}
      {view === "result" && result && (
        <div className="flex-1 space-y-6">
          {/* Risk score + type + confidence */}
          <div className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3 sm:items-center">
            <RiskGauge score={result.riskScore} band={result.riskBand} />
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Scam Type
                </p>
                <p className="mt-1 inline-block rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                  {result.scamType}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Confidence
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  <span
                    className={`font-semibold ${
                      result.confidence === "High"
                        ? "text-green-400"
                        : result.confidence === "Medium"
                          ? "text-yellow-400"
                          : "text-zinc-400"
                    }`}
                  >
                    {result.confidence}
                  </span>{" "}
                  — {result.confidenceReason}
                </p>
              </div>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-xs text-zinc-500">
                This is an AI assessment based on detected indicators.
                <br />
                It is not absolute proof of a scam.
              </p>
            </div>
          </div>

          {/* Red flags */}
          {result.redFlags.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Red Flags Detected ({result.redFlags.length})
              </h2>
              <p className="mb-4 text-xs text-zinc-500">
                Click any flag to learn why it&apos;s dangerous.
              </p>
              <div className="space-y-2">
                {result.redFlags.map((flag, i) => (
                  <RedFlagCard
                    key={i}
                    flag={flag}
                    expanded={expandedFlags.has(i)}
                    onToggle={() => toggleFlag(i)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Evidence */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Investigation Evidence
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {result.entities.phoneNumbers.length > 0 && (
                <EvidenceRow label="Phone numbers" values={result.entities.phoneNumbers} />
              )}
              {result.entities.emails.length > 0 && (
                <EvidenceRow label="Email addresses" values={result.entities.emails} />
              )}
              {result.entities.urls.length > 0 && (
                <EvidenceRow label="URLs" values={result.entities.urls} />
              )}
              {result.entities.amounts.length > 0 && (
                <EvidenceRow label="Amounts" values={result.entities.amounts} />
              )}
              {result.entities.organizations.length > 0 && (
                <EvidenceRow label="Organisations mentioned" values={result.entities.organizations} />
              )}
              {result.entities.urgencyPhrases.length > 0 && (
                <EvidenceRow label="Urgency phrases" values={result.entities.urgencyPhrases} />
              )}
              {result.entities.personalInfoRequested.length > 0 && (
                <EvidenceRow label="Personal info requested" values={result.entities.personalInfoRequested} />
              )}
              {Object.values(result.entities).every((a) => a.length === 0) && (
                <p className="text-sm text-zinc-500">No specific entities extracted from this message.</p>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Recommended Actions
            </h2>
            <ol className="mt-3 space-y-2">
              {result.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-400">
                    {i + 1}
                  </span>
                  {rec}
                </li>
              ))}
            </ol>
          </div>

          {/* Exposure check */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Have you already interacted with the scammer?
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(result.exposureActions).map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedExposure(selectedExposure === key ? null : key)}
                  className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                    selectedExposure === key
                      ? "border-teal-500 bg-teal-950/50 text-teal-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            {selectedExposure && (
              <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/20 p-4">
                <p className="text-sm font-bold text-red-400">
                  {selectedExposure.includes("haven") ? "Good Decision" : "URGENT ACTION PLAN"}
                </p>
                <ul className="mt-2 space-y-1">
                  {result.exposureActions[selectedExposure].map((action, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-300">
                      <span className="text-teal-500">→</span> {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Safe reply */}
          {result.safeReply && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Safe Response Generator</h2>
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-sm text-zinc-300 italic">&ldquo;{result.safeReply}&rdquo;</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(result.safeReply!)}
                  className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500"
                >
                  Copy Safe Reply
                </button>
                <span className="flex items-center text-xs text-zinc-500">
                  or Don&apos;t Reply — Block &amp; Report
                </span>
              </div>
            </div>
          )}

          {/* AI Insights from Gemini */}
          {aiLoading && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-200">AI is analysing the message...</p>
              </div>
            </div>
          )}
          {aiInsight && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-950/20">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-teal-700 dark:text-teal-300">
                🧠 AI Intelligence Analysis
                {insightCached && (
                  <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    {t.scamChatbot.previouslyAnalyzed}
                  </span>
                )}
              </h2>
              {aiInsight.additionalInsights && (
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                  {aiInsight.additionalInsights}
                </p>
              )}
              {aiInsight.detailedExplanation && (
                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Detailed Explanation</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{aiInsight.detailedExplanation}</p>
                </div>
              )}
              {aiInsight.scammerIntent && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                  <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">Scammer&apos;s Likely Intent</p>
                  <p className="mt-2 text-sm text-zinc-300">{aiInsight.scammerIntent}</p>
                </div>
              )}
              {aiInsight.socialEngineeringTechniques.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Social Engineering Techniques</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {aiInsight.socialEngineeringTechniques.map((t, i) => (
                      <span key={i} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {aiInsight.subtleRedFlags.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Subtle Red Flags</p>
                  <ul className="mt-2 space-y-1">
                    {aiInsight.subtleRedFlags.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiInsight.recommendedActions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-400">AI Recommended Actions</p>
                  <ol className="mt-2 space-y-1">
                    {aiInsight.recommendedActions.map((a, i) => (
                      <li key={i} className="flex gap-2 text-sm text-zinc-300">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-950 text-[10px] font-bold text-teal-400">{i + 1}</span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
          {aiError && !aiInsight && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">{aiError}</p>
            </div>
          )}

          {/* Report actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={copyReport}
              className="rounded-full bg-teal-500 px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-teal-400"
            >
              {copied ? "Copied!" : "Copy Investigation Report"}
            </button>
            <button
              onClick={() => { setView("input"); setResult(null); setInput(""); setUrl(""); }}
              className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
            >
              Investigate Another Message
            </button>
            <Link
              href="/qr-scanner"
              className="rounded-full border border-teal-700 px-6 py-2.5 text-sm font-semibold text-teal-400 transition hover:bg-teal-950"
            >
              Scan a QR Code →
            </Link>
          </div>
        </div>
      )}

      {/* ---- NEWS CHECK ERROR VIEW (API returned result:null + error) ---- */}
      {view === "newsResult" && !newsResult && newsError && (
        <div className="flex-1 space-y-6">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-yellow-500 bg-yellow-950/30">
              <span className="text-3xl font-bold text-yellow-400">!</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {newsErrorType === "daily_limit"
                  ? t.scamChatbot.dailyLimitReached
                  : newsErrorType === "throttled"
                    ? t.scamChatbot.pleaseWaitMoment
                    : t.scamChatbot.analysisUnavailable}
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{newsError}</p>
            </div>
            {newsErrorType !== "daily_limit" && (
              <button
                onClick={() => startNewsCheck(input)}
                className="rounded-full bg-teal-500 px-6 py-2 text-sm font-semibold text-black transition hover:bg-teal-400"
              >
                {t.scamChatbot.tryAgain}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- NEWS RESULT VIEW ---- */}
      {view === "newsResult" && newsResult && (
        <div className="flex-1 space-y-6">
          {/* Cache badge: this verdict was a previous analysis, not a fresh call */}
          {newsCached && (
            <div className="flex justify-center">
              <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                🗂 {t.scamChatbot.previouslyAnalyzed}
              </span>
            </div>
          )}
          {/* Verdict card */}
          <div className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3 sm:items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-36 w-36 items-center justify-center rounded-full border-4 ${
                  newsResult.verdict === "likely fake"
                    ? "border-red-500 bg-red-950/30"
                    : newsResult.verdict === "likely real"
                      ? "border-green-500 bg-green-950/30"
                      : newsResult.verdict === "misleading / needs context"
                        ? "border-yellow-500 bg-yellow-950/30"
                        : "border-zinc-500 bg-zinc-800/30"
                }`}
              >
                <span className={`text-center text-sm font-bold leading-tight ${
                  newsResult.verdict === "likely fake"
                    ? "text-red-400"
                    : newsResult.verdict === "likely real"
                      ? "text-green-400"
                      : newsResult.verdict === "misleading / needs context"
                        ? "text-yellow-400"
                        : "text-zinc-400"
                }`}>
                  {newsResult.verdict === "likely fake"
                    ? t.scamChatbot.newsVerdictLikelyFake
                    : newsResult.verdict === "likely real"
                      ? t.scamChatbot.newsVerdictLikelyReal
                      : newsResult.verdict === "misleading / needs context"
                        ? t.scamChatbot.newsVerdictMisleading
                        : t.scamChatbot.newsVerdictUnverifiable}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {t.scamChatbot.confidence}
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  <span className={`font-semibold ${
                    newsResult.confidence === "high"
                      ? "text-green-400"
                      : newsResult.confidence === "medium"
                        ? "text-yellow-400"
                        : "text-zinc-400"
                  }`}>
                    {newsResult.confidence === "high"
                      ? t.scamChatbot.newsConfidenceHigh
                      : newsResult.confidence === "medium"
                        ? t.scamChatbot.newsConfidenceMedium
                        : t.scamChatbot.newsConfidenceLow}
                  </span>
                </p>
              </div>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-xs text-zinc-500">
                {t.scamChatbot.newsDisclaimer}
              </p>
            </div>
          </div>

          {/* Reasoning */}
          {newsResult.reasoning && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {t.scamChatbot.newsReasoning}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {newsResult.reasoning}
              </p>
            </div>
          )}

          {/* Red flags / warning signs */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t.scamChatbot.newsRedFlags} ({newsResult.redFlags.length})
            </h2>
            {newsResult.redFlags.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {newsResult.redFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />
                    <p className="text-sm text-zinc-300">{flag}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">{t.scamChatbot.newsNoFlags}</p>
            )}
          </div>

          {/* Suggestion */}
          {newsResult.suggestion && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-950/20">
              <h2 className="text-base font-semibold text-teal-700 dark:text-teal-300">
                {t.scamChatbot.newsSuggestionHeading}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {newsResult.suggestion}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setView("input"); setNewsResult(null); setInput(""); setUrl(""); }}
              className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
            >
              {t.scamChatbot.investigateAnother}
            </button>
            <Link
              href="/"
              className="rounded-full border border-teal-700 px-6 py-2.5 text-sm font-semibold text-teal-400 transition hover:bg-teal-950"
            >
              {t.common.backToHome}
            </Link>
          </div>
        </div>
      )}

      {/* ---- HISTORY VIEW ---- */}
      {view === "history" && (
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t.scamChatbot.myInvestigations}</h2>
          {history.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              {t.scamChatbot.noHistory}
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {history.map((entry) => {
                if (entry.type === "scam") {
                  const h = entry.data;
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        setResult(h.result);
                        setInput(h.message);
                        setView("result");
                        setExpandedFlags(new Set());
                        setSelectedExposure(null);
                      }}
                      className="group flex w-full items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-teal-700 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
                          h.risk_score >= 61
                            ? "bg-red-950/50 text-red-400"
                            : h.risk_score >= 41
                              ? "bg-yellow-950/50 text-yellow-400"
                              : "bg-green-950/50 text-green-400"
                        }`}
                      >
                        {h.risk_score}/100
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {t.scamChatbot.scamCheckTag}
                          </span>
                          <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-teal-400">
                            {h.scam_type} — {h.risk_band}
                          </p>
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {new Date(h.created_at).toLocaleDateString()} — {h.message.slice(0, 80)}…
                        </p>
                      </div>
                    </button>
                  );
                } else {
                  const h = entry.data;
                  const verdictColor =
                    h.verdict === "likely fake"
                      ? "bg-red-950/50 text-red-400"
                      : h.verdict === "likely real"
                        ? "bg-green-950/50 text-green-400"
                        : "bg-yellow-950/50 text-yellow-400";
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        setNewsResult({
                          verdict: h.verdict,
                          confidence: h.confidence,
                          reasoning: h.reasoning,
                          redFlags: h.red_flags ?? [],
                          suggestion: h.suggestion,
                        });
                        setInput(h.input_text);
                        setView("newsResult");
                      }}
                      className="group flex w-full items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-teal-700 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${verdictColor}`}>
                        {h.verdict === "likely fake" ? "FAKE" : h.verdict === "likely real" ? "REAL" : "??"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-teal-900/50 px-1.5 py-0.5 text-[10px] font-medium text-teal-400">
                            {t.scamChatbot.newsCheckTag}
                          </span>
                          <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-teal-400">
                            {h.verdict}
                          </p>
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {new Date(h.created_at).toLocaleDateString()} — {h.input_text.slice(0, 80)}…
                        </p>
                      </div>
                    </button>
                  );
                }
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <Link
        href="/"
        className="mt-8 inline-flex text-sm font-medium text-teal-400 hover:text-teal-300"
      >
        {t.common.backToHome}
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function EvidenceRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={i} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function buildReportText(r: InvestigationResult, message: string): string {
  const flags = r.redFlags.map((f) => `  • ${f.label}: ${f.explanation}`).join("\n");
  const recs = r.recommendations.map((a, i) => `  ${i + 1}. ${a}`).join("\n");
  return `NETGUARD SCAM INVESTIGATION REPORT
${"=".repeat(40)}
Risk Score: ${r.riskScore}/100
Risk Level: ${r.riskBand}
Scam Type: ${r.scamType}
Confidence: ${r.confidence}

Original Message:
${message.slice(0, 300)}${message.length > 300 ? "…" : ""}

Red Flags:
${flags || "  None detected"}

Recommended Actions:
${recs}

Generated by NetGuard Scam Investigator
This is an automated assessment and not absolute proof.`;
}
