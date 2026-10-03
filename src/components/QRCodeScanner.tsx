"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import { analyzeQrContent, type QrScanResult } from "@/lib/qrScanner";
import { runLinkCheck, type LinkCheckResult } from "@/lib/linkCheck";
import { buildIdentification, type LinkMetaFacts, type GeoReverseFacts } from "@/lib/identification";
import EvidencePanel from "@/components/EvidencePanel";
import BackToHome from "@/components/BackToHome";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";
import {
  qrAssessmentLabel,
  qrCautions,
  qrDescription,
  qrHistoryTypeLabel,
  qrReasons,
  qrTypeLabel,
  translateCategory,
  translateFlagExplanation,
  translateTips,
  translateVerdict,
} from "@/lib/i18n/lookups";

interface QrAiExplanation {
  explanation: string;
  safetyLevel: string;
  safetyExplanation: string;
  potentialRisks: string[];
  recommendations: string[];
}

type LinkMeta = LinkMetaFacts;

type GeoReverse = GeoReverseFacts;

type View = "input" | "decoding" | "result" | "history";

interface HistoryEntry {
  id: string;
  content_type: string;
  raw_content: string;
  created_at: string;
}

/* ── Helpers ────────────────────────────────────────────────── */

function verdictColor(v: string): string {
  if (v === "Safe") return "text-teal-700 dark:text-teal-400";
  if (v === "Suspicious") return "text-yellow-700 dark:text-yellow-400";
  return "text-red-700 dark:text-red-400";
}
function verdictBg(v: string): string {
  if (v === "Safe") return "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30";
  if (v === "Suspicious") return "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20";
  return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20";
}
function contentTypeBadge(type: string): string {
  switch (type) {
    case "url": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-800";
    case "upi": return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-800";
    case "vcard": return "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-800";
    case "phone": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-800";
    default: return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/20 dark:text-zinc-300 dark:border-zinc-700";
  }
}
function assessmentBadge(a: string): string {
  switch (a) {
    case "Safe": return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-400";
    case "Low Risk": return "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400";
    case "Suspicious": return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400";
    case "High Risk": return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400";
    default: return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400";
  }
}
function assessmentIcon(a: string): string {
  switch (a) {
    case "Safe": return "✓";
    case "Low Risk": return "🛡";
    case "Suspicious": return "⚠";
    case "High Risk": return "⛔";
    default: return "?";
  }
}

/**
 * Decode QR code from an image File using canvas + jsQR.
 * Returns the decoded text, or null if no QR code was found.
 */
function decodeQrFromFile(file: File): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_DIM = 1500;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
      URL.revokeObjectURL(img.src);
      resolve(code?.data ?? null);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("Failed to load image")); };
    img.src = URL.createObjectURL(file);
  });
}

/* ── Component ──────────────────────────────────────────────── */

export default function QRCodeScanner() {
  const { t, lang } = useLang();
  const q = t.qrScanner;
  const [view, setView] = useState<View>("input");
  const [qrResult, setQrResult] = useState<QrScanResult | null>(null);
  const [linkCheckResult, setLinkCheckResult] = useState<LinkCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showDecoded, setShowDecoded] = useState(false);
  const [sbThreats, setSbThreats] = useState<Array<{ threatType: string; url: string }>>([]);
  const [sbChecking, setSbChecking] = useState(false);
  const [sbApiKeyMissing, setSbApiKeyMissing] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<QrAiExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [linkMeta, setLinkMeta] = useState<LinkMeta | null>(null);
  const [linkMetaBlocked, setLinkMetaBlocked] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [geoReverse, setGeoReverse] = useState<GeoReverse | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) loadHistory(data.user.id);
    });
  }, []);

  const loadHistory = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("qr_scans")
      .select("id, content_type, raw_content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory(data ?? []);
  }, []);

  // Compute effective security assessment — Safe Browsing threats MUST override
  const effectiveAssessment =
    sbThreats.length > 0 && qrResult && qrResult.securityAssessment !== "High Risk"
      ? "High Risk"
      : qrResult?.securityAssessment ?? "Safe";

  // Combined Link Checker verdict that reflects Safe Browsing
  const combinedLcVerdict =
    sbThreats.length > 0 && linkCheckResult?.verdict !== "Likely fraud"
      ? "Likely fraud"
      : linkCheckResult?.verdict ?? "Safe";

  // Evidence-based identification assembled from everything we actually
  // observed (decoded QR, page metadata, geo lookup, security checks).
  // Nothing here is guessed — names appear only when backed by evidence.
  const identification = useMemo(
    () =>
      qrResult
        ? buildIdentification(
            {
              qr: qrResult,
              meta: linkMeta,
              geoReverse,
              linkVerdict: combinedLcVerdict,
              sbThreatCount: sbThreats.length,
              sbConfigured: !sbApiKeyMissing,
              effectiveAssessment,
            },
            t,
          )
        : null,
    [qrResult, linkMeta, geoReverse, combinedLcVerdict, sbThreats.length, sbApiKeyMissing, effectiveAssessment, t],
  );

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(q.imageError);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(q.sizeError);
      return;
    }

    setView("decoding");
    setQrResult(null);
    setLinkCheckResult(null);

    try {
      const decoded = await decodeQrFromFile(file);
      if (!decoded) {
        setError(q.noQr);
        setView("input");
        return;
      }

      let result = analyzeQrContent(decoded);

      // If it's a URL, run the existing Link Checker
      if (result.contentType === "url" && result.url) {
        const lc = runLinkCheck(result.url);
        setLinkCheckResult(lc);
        // Re-analyze with Link Checker result for security assessment
        result = analyzeQrContent(decoded, lc);
      }

      setQrResult(result);
      setView("result");
      saveToHistory(result);

      // Peek inside the linked page (title / meta description / Open Graph)
      // — free and fast, no AI quota. Runs in parallel with Safe Browsing.
      let metaOk = false;
      const metaPromise =
        result.contentType === "url" && result.url
          ? (async () => {
              setMetaLoading(true);
              try {
                const mRes = await fetch("/api/link-meta", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url: result.url }),
                });
                const mData = (await mRes.json()) as LinkMeta;
                const hasContent =
                  mData.ok && (mData.title || mData.description || (mData.pageType && mData.pageType !== "webpage"));
                // Keep the facts (domain, https, hops) even when the page
                // body was unreadable — the identification engine needs them.
                setLinkMeta(mData);
                if (hasContent) metaOk = true;
                else setLinkMetaBlocked(true);
              } catch {
                setLinkMetaBlocked(true);
              } finally {
                setMetaLoading(false);
              }
            })()
          : Promise.resolve();

      // Location QR: reverse-geocode the coordinates through OpenStreetMap
      // (free, no AI quota). Fail-open — if unavailable we simply say the
      // place could not be verified instead of guessing from coordinates.
      const geoPromise =
        result.contentType === "geo" && result.geo
          ? (async () => {
              setGeoLoading(true);
              try {
                const gRes = await fetch("/api/geo-reverse", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lat: result.geo!.lat, lng: result.geo!.lng }),
                });
                setGeoReverse((await gRes.json()) as GeoReverse);
              } catch {
                setGeoReverse({ ok: false });
              } finally {
                setGeoLoading(false);
              }
            })()
          : Promise.resolve();

      // Call Safe Browsing for URL-type QR codes
      if (result.contentType === "url" && result.url) {
        setSbChecking(true);
        setSbApiKeyMissing(false);
        try {
          const sbRes = await fetch("/api/safe-browsing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: [result.url] }),
          });
          const sbData = await sbRes.json();
          setSbThreats(sbData.threats ?? []);
          setSbApiKeyMissing(sbData.apiKeyMissing ?? false);
        } catch {
          setSbThreats([]);
        } finally {
          setSbChecking(false);
        }
      }

      await Promise.all([metaPromise, geoPromise]);

      // Call Gemini for AI explanation ONLY as a last resort: when the QR
      // holds a URL but the real page gave us nothing usable. Non-URL QR
      // types (UPI, Wi-Fi, vCard, text) are already described locally by
      // the classifier, so they no longer spend quota on every scan.
      const needsAi = result.contentType === "url" && !metaOk;
      if (needsAi) {
        setAiLoading(true);
        setAiError(null);
        setAiExplanation(null);
        try {
        const aiRes = await fetch("/api/gemini/qr-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: decoded,
            contentType: result.contentType,
            lang: lang,
            linkCheckVerdict: linkCheckResult?.verdict,
          }),
        });
        const aiData = await aiRes.json();
        if (aiData.explanation) {
          const exp = aiData.explanation;
          // Safety net: ensure fields are plain strings, not nested JSON
          const clean: QrAiExplanation = {
            explanation: typeof exp.explanation === "string" ? exp.explanation : JSON.stringify(exp.explanation),
            safetyLevel: typeof exp.safetyLevel === "string" ? exp.safetyLevel : "Suspicious",
            safetyExplanation: typeof exp.safetyExplanation === "string" ? exp.safetyExplanation : JSON.stringify(exp.safetyExplanation),
            potentialRisks: Array.isArray(exp.potentialRisks) ? exp.potentialRisks.map((r: unknown) => typeof r === "string" ? r : JSON.stringify(r)) : [],
            recommendations: Array.isArray(exp.recommendations) ? exp.recommendations.map((r: unknown) => typeof r === "string" ? r : JSON.stringify(r)) : [],
          };
          setAiExplanation(clean);
        } else if (aiData.apiKeyMissing) {
          setAiError(q.aiNotConfigured);
        } else if (aiData.error) {
          setAiError(q.aiUnavailable);
        }
        } catch {
          setAiError(q.aiUnavailable);
        } finally {
          setAiLoading(false);
        }
      }
    } catch {
      setError(q.processError);
      setView("input");
    }
  }

  async function saveToHistory(r: QrScanResult) {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;
    await supabase.from("qr_scans").insert([{
      user_id: uid,
      content_type: r.contentType,
      raw_content: r.rawContent.slice(0, 2000), // Limit stored content
      result: r,
    }]);
    if (uid) loadHistory(uid);
  }

  async function handleCopy() {
    if (!qrResult) return;
    const reasons = qrReasons(qrResult, t, linkCheckResult?.flags);
    let text = `${q.copyHeader}\n${q.copyType} ${qrTypeLabel(qrResult.contentType, t)}\n${q.copyDescription} ${qrDescription(qrResult, t)}\n${q.copySecurity} ${qrAssessmentLabel(effectiveAssessment, t)}`;
    if (reasons.length > 0) text += `\n${q.copyReasons}\n${reasons.map(r => `- ${r}`).join("\n")}`;
    text += `\n\n${q.copyDecoded} ${qrResult.rawContent}`;
    if (linkCheckResult) text += `\n\n${q.copyVerdict} ${translateVerdict(linkCheckResult.verdict, t)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setView("input");
    setQrResult(null);
    setLinkCheckResult(null);
    setError(null);
    setShowDecoded(false);
    setSbThreats([]);
    setSbChecking(false);
    setSbApiKeyMissing(false);
    setAiExplanation(null);
    setAiLoading(false);
    setAiError(null);
    setLinkMeta(null);
    setLinkMetaBlocked(false);
    setMetaLoading(false);
    setGeoReverse(null);
    setGeoLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  /* ── Render: Input ─────────────────────────────────────────── */
  if (view === "input") return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <BackToHome className="mb-6" />
      <p className="text-sm font-medium text-teal-500">{q.badge}</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">{q.title}</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        {q.description}
      </p>

      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
        <p className="text-sm text-red-700 dark:text-red-300">
          <strong>⚠️ {q.tipLabel}</strong> {q.tip}
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition ${
          dragOver ? "border-teal-500 bg-teal-50 dark:bg-teal-950/20" : "border-zinc-300 bg-zinc-50 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        }`}
      >
        <svg className="h-12 w-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
        </svg>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{q.dropZone}</p>
        <p className="mt-1 text-xs text-zinc-500">{q.fileLimit}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-6 rounded-full bg-teal-500 px-8 py-3 text-sm font-semibold text-black transition hover:bg-teal-400"
        >
          {q.uploadBtn}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Supported content types */}
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-200">{q.supportedTitle}</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex gap-2"><span className="text-teal-600 dark:text-teal-400">&#10003;</span> {q.supportedUrls}</li>
          <li className="flex gap-2"><span className="text-teal-600 dark:text-teal-400">&#10003;</span> {q.supportedUpi}</li>
          <li className="flex gap-2"><span className="text-teal-600 dark:text-teal-400">&#10003;</span> {q.supportedVcard}</li>
          <li className="flex gap-2"><span className="text-teal-600 dark:text-teal-400">&#10003;</span> {q.supportedOther}</li>
        </ul>
      </div>

      {/* History */}
      {user && history.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{q.scanHistory}</h2>
            <button type="button" onClick={() => setView("history")} className="text-sm text-teal-700 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300">{q.viewAll}</button>
          </div>
          <ul className="mt-4 space-y-3">
            {history.slice(0, 3).map(h => (
              <li key={h.id} className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${contentTypeBadge(h.content_type)}`}>
                  {h.content_type.toUpperCase()}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-300">{h.raw_content}</p>
                <time className="shrink-0 text-xs text-zinc-500">{new Date(h.created_at).toLocaleDateString()}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  /* ── Render: Decoding spinner ──────────────────────────────── */
  if (view === "decoding") return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center px-6 py-32">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
      <p className="mt-4 text-sm text-zinc-400">{q.decoding}</p>
    </div>
  );

  /* ── Render: History ───────────────────────────────────────── */
  if (view === "history") return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <BackToHome className="mb-6" />
      <p className="text-sm font-medium text-teal-500">{q.badge}</p>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{q.myHistory}</h1>
      {history.length === 0 ? (
        <p className="mt-6 text-zinc-400">{q.noHistory}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {history.map(h => (
            <li key={h.id} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${contentTypeBadge(h.content_type)}`}>
                {h.content_type.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-200">{h.raw_content}</p>
                <p className="text-xs text-zinc-500">{qrHistoryTypeLabel(h.content_type, t)}</p>
              </div>
              <time className="shrink-0 text-xs text-zinc-500">{new Date(h.created_at).toLocaleDateString()}</time>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={handleReset} className="mt-8 rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:border-teal-600 hover:text-teal-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-teal-400">
        {q.newScan}
      </button>
    </div>
  );

  /* ── Render: Result ────────────────────────────────────────── */
  if (!qrResult) return null;
  const r = qrResult;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <BackToHome className="mb-6" />
      <p className="text-sm font-medium text-teal-500">{q.badge}</p>

      {/* Description card */}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{q.whatContains}</p>
        <p className="mt-2 text-base leading-relaxed text-zinc-900 dark:text-zinc-100">{qrDescription(r, t)}</p>

        {/* Real page metadata — fetched for free, no AI needed */}
        {r.contentType === "url" && metaLoading && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            <p className="text-sm text-zinc-400">{q.metaLoading}</p>
          </div>
        )}
        {r.contentType === "url" && !metaLoading && linkMeta && (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{q.metaFromSite}</p>
            {linkMeta.title && (
              <p className="mt-1 text-sm font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">{linkMeta.title}</p>
            )}
            {linkMeta.description && (
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{linkMeta.description}</p>
            )}
            {linkMeta.siteName && (
              <p className="mt-1 text-xs text-zinc-500">{q.metaSiteLabel}: {linkMeta.siteName}</p>
            )}
            {linkMeta.pageType && linkMeta.pageType !== "webpage" && (
              <p className="mt-1 text-xs font-medium text-yellow-500 dark:text-yellow-400">
                {q.pageTypeLine.replace("{type}", linkMeta.pageType.toUpperCase())}
              </p>
            )}
            {linkMeta.adult && (
              <p className="mt-1 text-sm font-semibold text-red-500 dark:text-red-400">⚠ {q.adultWarning}</p>
            )}
          </div>
        )}
        {/* Location QR: verified place, if the map database gave one */}
        {r.contentType === "geo" && r.geo && (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.ident.typeGeo}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {geoLoading
                ? t.qrScanner.metaLoading
                : geoReverse?.ok && geoReverse.address
                  ? geoReverse.address
                  : r.geo.label
                    ? `${r.geo.label} — ${t.ident.cannotGeo}`
                    : t.ident.cannotGeo}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {t.ident.evCoords.replace("{lat}", r.geo.lat.toFixed(5)).replace("{lng}", r.geo.lng.toFixed(5))}
            </p>
          </div>
        )}
        {r.contentType === "url" && !metaLoading && linkMetaBlocked && (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">{q.cannotSeeInside}</p>
        )}
      </div>

      {/* Detected Type + Security Assessment */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{q.detectedType}</p>
          <span className={`mt-2 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${contentTypeBadge(r.contentType)}`}>
            {qrTypeLabel(r.contentType, t)}
          </span>
        </div>
        <div className={`rounded-2xl border p-5 ${assessmentBadge(effectiveAssessment)}`}>
          <p className="text-xs font-medium uppercase tracking-wide opacity-70">{q.securityAssessment}</p>
          <p className="mt-1 text-xl font-bold">
            {assessmentIcon(effectiveAssessment)} {qrAssessmentLabel(effectiveAssessment, t)}
          </p>
          {sbThreats.length > 0 && r.securityAssessment !== effectiveAssessment && (
            <p className="mt-1 text-xs opacity-70">{q.sbUpgraded}</p>
          )}
        </div>
      </div>

      {/* Evidence-based identification: what it is, who it belongs to,
          how confident we are, and what could NOT be verified */}
      {identification && (r.contentType !== "url" || !metaLoading) && (
        <EvidencePanel identification={identification} />
      )}

      {/* Why? */}
      {qrReasons(r, t, linkCheckResult?.flags).length > 0 && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{q.why}</p>
          <ul className="mt-3 space-y-2">
            {qrReasons(r, t, linkCheckResult?.flags).map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Collapsible decoded content */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowDecoded(!showDecoded)}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
        >
          <span>{q.viewDecoded}</span>
          <span className="text-zinc-500">{showDecoded ? "▲" : "▼"}</span>
        </button>
        {showDecoded && (
          <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="break-all font-mono text-sm text-zinc-600 dark:text-zinc-300">{r.rawContent}</p>
          </div>
        )}
      </div>

      {/* UPI: Parsed fields + caution signals */}
      {r.contentType === "upi" && r.upi && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{q.upiDetails}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">{q.payeeAddress}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.upi.payeeAddress ?? q.notProvided}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">{q.payeeName}</p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.upi.payeeName ?? q.notProvided}</p>
            </div>
            {r.upi.amount && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.amount}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {r.upi.currency === "INR" ? "\u20B9" : r.upi.currency ? `${r.upi.currency} ` : ""}{r.upi.amount}
                </p>
              </div>
            )}
            {r.upi.transactionNote && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.transactionNote}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.upi.transactionNote}</p>
              </div>
            )}
          </div>
          {qrCautions(r.upiCautions, t).length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <span className="text-red-500 dark:text-red-400">\u26A0</span>
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">{q.cautionTitle}</h3>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {q.cautionDesc}
              </p>
              <ul className="mt-3 space-y-2">
                {qrCautions(r.upiCautions, t).map((c, i) => (
                  <li key={i} className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{c.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{c.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.upiCautions.length === 0 && (
            <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/20">
              <p className="text-sm text-teal-700 dark:text-teal-300">
                {q.noCaution}
              </p>
            </div>
          )}
        </div>
      )}

      {/* vCard */}
      {r.contentType === "vcard" && r.vcard && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{q.contactDetails}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {r.vcard.fullName && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.fullName}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.vcard.fullName}</p>
              </div>
            )}
            {r.vcard.phone && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.phone}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.vcard.phone}</p>
              </div>
            )}
            {r.vcard.email && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.email}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.vcard.email}</p>
              </div>
            )}
            {r.vcard.org && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.organization}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.vcard.org}</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            {q.vcardNote}
          </p>
        </div>
      )}

      {/* Phone number */}
      {r.contentType === "phone" && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{q.phoneNumber}</h2>
          <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{r.phone}</p>
          <p className="mt-3 text-xs text-zinc-500">
            {q.phoneNote}
          </p>
        </div>
      )}

      {/* URL: Link Checker detailed verdict */}
      {r.contentType === "url" && linkCheckResult && (
        <div className={`mt-6 rounded-2xl border p-6 ${verdictBg(combinedLcVerdict)}`}>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{q.linkVerdict}</p>
          <p className={`mt-1 text-2xl font-bold ${verdictColor(combinedLcVerdict)}`}>
            {translateVerdict(combinedLcVerdict, t)}
          </p>
          {combinedLcVerdict !== linkCheckResult.verdict && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {q.sbUpgraded}
            </p>
          )}
          {linkCheckResult.flags.length > 0 && (
            <ul className="mt-4 space-y-2">
              {linkCheckResult.flags.map((f, i) => (
                <li key={i} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm">
                      {f.level === "high" ? "🔴" : f.level === "medium" ? "🟠" : "🟡"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-200">{translateCategory(f.tipKey, t)}</p>
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{translateFlagExplanation(f, t)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {translateTips(linkCheckResult.flags, t).length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">⚠️ {q.safetyTips}</p>
              <ul className="mt-2 space-y-1.5">
                {translateTips(linkCheckResult.flags, t).map((tip, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400">• {tip}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            {q.analyzedBy}{" "}
            <Link href="/link-checker" className="text-teal-700 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300">
              {q.openLinkChecker}
            </Link>
          </p>
        </div>
      )}

      {/* Wi-Fi */}
      {r.contentType === "wifi" && r.wifi && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{q.wifiDetails}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {r.wifi.ssid && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.ssid}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.wifi.ssid}</p>
              </div>
            )}
            {r.wifi.encryption && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.encryption}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.wifi.encryption}</p>
              </div>
            )}
            {r.wifi.password && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">{q.wifiPassword}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.wifi.password}</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            {q.wifiNote}
          </p>
        </div>
      )}

      {/* Google Safe Browsing result (URL QR codes only) */}
      {r.contentType === "url" && (
        <>
          {sbChecking && (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{q.sbChecking}</p>
              </div>
            </div>
          )}
          {!sbChecking && !sbApiKeyMissing && (
            <div className={`mt-6 rounded-2xl border p-5 ${sbThreats.length > 0 ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20" : "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/20"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{q.sbHeading}</p>
              {sbThreats.length > 0 ? (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">⛔ {q.sbFlagged}</p>
                  <ul className="mt-2 space-y-1">
                    {sbThreats.map((threat, i) => (
                      <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400">
                        <span className="font-medium text-red-700 dark:text-red-300">{threat.threatType}</span>
                        {threat.url && <span className="text-zinc-500"> — {threat.url}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-1 text-sm text-teal-700 dark:text-teal-300">✓ {q.sbClean}</p>
              )}
            </div>
          )}
          {sbApiKeyMissing && (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">{q.sbNotConfigured}</p>
            </div>
          )}
        </>
      )}

      {/* AI Security Explanation (Gemini) */}
      {aiLoading && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-200">{q.aiLoading}</p>
          </div>
        </div>
      )}
      {aiExplanation && (
        <div className={`mt-6 rounded-2xl border p-6 ${
          aiExplanation.safetyLevel === "Risky" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20" :
          aiExplanation.safetyLevel === "Suspicious" ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20" :
          "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/20"
        }`}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            🧠 {q.aiHeading}
          </h2>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              aiExplanation.safetyLevel === "Risky" ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300" :
              aiExplanation.safetyLevel === "Suspicious" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300" :
              "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300"
            }`}>
              {aiExplanation.safetyLevel === "Risky" ? q.aiLevelRisky : aiExplanation.safetyLevel === "Suspicious" ? q.aiLevelSuspicious : aiExplanation.safetyLevel === "Safe" ? q.aiLevelSafe : aiExplanation.safetyLevel}
            </span>
          </div>
          {aiExplanation.explanation && (
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{aiExplanation.explanation}</p>
          )}
          {aiExplanation.safetyExplanation && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{aiExplanation.safetyExplanation}</p>
          )}
          {aiExplanation.potentialRisks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{q.aiRisks}</p>
              <ul className="mt-2 space-y-1">
                {aiExplanation.potentialRisks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {aiExplanation.recommendations.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-700 dark:text-teal-400">{q.aiRecs}</p>
              <ol className="mt-2 space-y-1">
                {aiExplanation.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-400">{i + 1}</span>
                    {rec}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
      {aiError && !aiExplanation && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500">{aiError}</p>
        </div>
      )}

      {/* Plain-language conclusion: what the QR contains + what to do */}
      {(r.contentType !== "url" || !metaLoading) && (() => {
        const conclLine =
          effectiveAssessment === "High Risk" ? q.conclHighRisk :
          effectiveAssessment === "Suspicious" ? q.conclSuspicious :
          effectiveAssessment === "Safe" ? q.conclSafe :
          effectiveAssessment === "Low Risk" ? q.conclLowRisk :
          q.conclUnknown;
        const whatLine =
          r.contentType === "url" && linkMeta?.title
            ? q.conclOpensPage.replace("{title}", linkMeta.title)
            : qrDescription(r, t);
        return (
          <div className={`mt-6 rounded-2xl border p-6 ${assessmentBadge(effectiveAssessment)}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">💬 {q.conclHeading}</h2>
            <p className="mt-3 text-base leading-relaxed font-medium text-zinc-900 dark:text-zinc-100">
              {whatLine}
            </p>
            <p className="mt-2 text-base leading-relaxed font-medium text-zinc-900 dark:text-zinc-100">
              {conclLine}
            </p>
            {linkMeta?.adult && (
              <p className="mt-2 text-sm font-semibold text-red-500 dark:text-red-400">⚠ {q.adultWarning}</p>
            )}
          </div>
        );
      })()}

      {/* Disclaimer */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs text-zinc-500">
          {q.disclaimer}
          {r.contentType === "url" && q.disclaimerUrl}
          {r.contentType === "upi" && q.disclaimerUpi}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copied ? t.common.copied : q.copyResult}
        </button>
        {r.contentType === "url" && (
          <Link
            href="/link-checker"
            className="rounded-full border border-teal-300 px-5 py-2 text-sm font-medium text-teal-700 transition hover:border-teal-500 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950"
          >
            {q.openLinkChecker}
          </Link>
        )}
        {(effectiveAssessment === "Suspicious" || effectiveAssessment === "High Risk" || r.contentType === "text") && (
          <Link
            href="/chatbot"
            className="rounded-full border border-teal-300 px-5 py-2 text-sm font-medium text-teal-700 transition hover:border-teal-500 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950"
          >
            {q.investigateChatbot}
          </Link>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:border-teal-500 hover:text-teal-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-teal-400"
        >
          {q.scanAnother}
        </button>
      </div>
    </div>
  );
}
