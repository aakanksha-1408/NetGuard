"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { runLinkCheck, type CombinedFlag, type LinkCheckResult, type Verdict, type StoredRiskLevel } from "@/lib/linkCheck";
import { extractUrls } from "@/lib/urlScanner";
import { buildIdentification, type LinkMetaFacts } from "@/lib/identification";
import EvidencePanel from "@/components/EvidencePanel";
import BackToHome from "@/components/BackToHome";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { useLang } from "@/lib/i18n/context";

type RecentCheck = {
  id: string;
  risk_level: string;
  input_text: string;
  created_at: string;
};

type LinkMeta = LinkMetaFacts;

const VERDICT_STYLES = {
  Safe: {
    icon: "✓",
    color: "text-teal-700 dark:text-teal-400",
    bg: "bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800",
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300",
  },
  Suspicious: {
    icon: "⚠️",
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
  },
  "Likely fraud": {
    icon: "🚨",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  },
} as const;

function riskBadgeClass(level: string): string {
  if (level === "fraud") return "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300";
  if (level === "suspicious") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300";
  return "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300";
}

function FlagItem({ flag, t }: { flag: CombinedFlag; t: Record<string, string> }) {
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {flag.category}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            flag.level === "high"
              ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300"
              : flag.level === "medium"
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300"
                : "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300"
          }`}
        >
          {flag.level === "high" ? t.high : flag.level === "medium" ? t.medium : t.low}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{flag.explanation}</p>
      <p className="mt-2 truncate font-mono text-xs text-zinc-500">
        {t.found} &quot;{flag.matchedText}&quot;
      </p>
    </li>
  );
}

export default function LinkChecker() {
  const router = useRouter();
  const { t, lang } = useLang();
  const lc = t.linkChecker;

  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkCheckResult | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [recentChecks, setRecentChecks] = useState<RecentCheck[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [sbThreats, setSbThreats] = useState<Array<{ threatType: string; url: string }>>([]);
  const [sbChecking, setSbChecking] = useState(false);
  const [sbApiKeyMissing, setSbApiKeyMissing] = useState(false);
  const [linkDescription, setLinkDescription] = useState<string | null>(null);
  const [linkDescLoading, setLinkDescLoading] = useState(false);
  const [linkMeta, setLinkMeta] = useState<LinkMeta | null>(null);
  const [linkMetaBlocked, setLinkMetaBlocked] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);

  const loadRecentChecks = useCallback(async (userId: string) => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from("link_checks")
      .select("id, risk_level, input_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    setRecentChecks(data ?? []);
    setLoadingRecent(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadRecentChecks(currentUser.id);
      }
    });
  }, [loadRecentChecks]);

  async function handlePaste() {
    setPasteError(null);
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) setText(clipText);
    } catch {
      setPasteError(lc.clipboardError);
    }
  }

  async function handleCheck() {
    if (!text.trim()) return;

    setChecking(true);
    setSaveError(null);
    setSbThreats([]);
    setSbApiKeyMissing(false);
    setLinkDescription(null);
    setLinkDescLoading(false);
    setLinkMeta(null);
    setLinkMetaBlocked(false);

    const checkResult = runLinkCheck(text);

    // Extract URLs and check Safe Browsing in parallel with Supabase save
    const urls = extractUrls(text);
    let sbThreatsResult: Array<{ threatType: string; url: string }> = [];
    let sbMissing = false;

    const sbPromise = urls.length > 0
      ? fetch("/api/safe-browsing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        })
          .then((r) => r.json())
          .then((data) => {
            sbThreatsResult = data.threats ?? [];
            sbMissing = data.apiKeyMissing ?? false;
          })
          .catch(() => {})
      : Promise.resolve();

    // Peek inside the actual page first — free, fast, no AI quota used.
    // Fetches <title>, meta description and Open Graph tags server-side.
    let metaInfo: LinkMeta | null = null;
    let metaBlocked = false;
    if (urls.length > 0) {
      setMetaLoading(true);
      try {
        const metaRes = await fetch("/api/link-meta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urls[0] }),
        });
        const data = (await metaRes.json()) as LinkMeta;
        const hasContent =
          data.ok && (data.title || data.description || (data.pageType && data.pageType !== "webpage"));
        // Keep the raw facts (domain, https, redirect hops) even when the
        // page body was unreadable — the identification engine needs them.
        metaInfo = data;
        if (!hasContent) metaBlocked = true;
      } catch {
        metaBlocked = true;
      }
      setMetaLoading(false);
    }
    setLinkMeta(metaInfo);
    setLinkMetaBlocked(metaBlocked);

    // Last-resort AI guess ONLY when the real page gave us nothing.
    // (Previously Gemini was called for every single link check — this
    // saves roughly one third of the daily quota for the Investigator.)
    const linkInfoPromise = urls.length > 0 && metaBlocked
      ? (async () => {
          setLinkDescLoading(true);
          try {
            const r = await fetch("/api/gemini/link-info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: urls[0], lang }),
            });
            const data = await r.json();
            if (data.description) setLinkDescription(data.description);
          } catch { /* ignore */ }
          setLinkDescLoading(false);
        })()
      : Promise.resolve();

    setSbChecking(true);

    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;

    const { error } = await supabase.from("link_checks").insert([
      {
        input_text: text.trim(),
        risk_level: checkResult.riskLevel,
        safe_to_post: checkResult.safeToPost,
        flags: checkResult.flags,
        user_id: currentUser?.id ?? null,
      },
    ]);

    if (error) {
      setSaveError(lc.saveError);
    } else if (currentUser) {
      loadRecentChecks(currentUser.id);
    }

    // Wait for Safe Browsing result and (fallback) link description
    await Promise.all([sbPromise, linkInfoPromise]);
    setSbChecking(false);
    setSbThreats(sbThreatsResult);
    setSbApiKeyMissing(sbMissing);
    setLinkDescLoading(false);

    // Combine results if Safe Browsing found threats
    // IMPORTANT: SB threats MUST override the local verdict — never show "Safe" when SB flags danger
    if (sbThreatsResult.length > 0) {
      const combinedFlags: CombinedFlag[] = [
        ...checkResult.flags,
        {
          source: "url" as const,
          category: "Google Safe Browsing",
          tipKey: "suspicious-link" as const,
          level: "high" as const,
          explanation: `This URL was flagged by Google Safe Browsing: ${sbThreatsResult.map((t) => t.threatType).join(", ")}.`,
          matchedText: sbThreatsResult[0].url,
        },
      ];
      const combinedVerdict: Verdict = "Likely fraud";
      const combinedRisk: StoredRiskLevel = "fraud";
      setResult({
        verdict: combinedVerdict,
        riskLevel: combinedRisk,
        safeToPost: false,
        flags: combinedFlags,
        tips: [
          "This URL is on Google's list of known dangerous websites.",
          "Do NOT visit this link or enter any information on the page.",
          "If you already visited the link, run a malware scan on your device.",
        ],
      });
    } else {
      // No SB threats — use local result as-is
      setResult(checkResult);
    }

    setChecking(false);
  }

  function handleReport() {
    router.push(`/report?prefill=${encodeURIComponent(text.trim())}`);
  }

  function riskLabel(level: string): string {
    if (level === "fraud") return lc.likelyFraud;
    if (level === "suspicious") return lc.suspicious;
    return lc.safe;
  }

  // Translate the verdict label for display
  function translateVerdict(verdict: string): string {
    if (verdict === "Likely fraud") return lc.likelyFraud;
    if (verdict === "Suspicious") return lc.suspicious;
    return lc.safe;
  }

  const verdictStyle = result ? VERDICT_STYLES[result.verdict] : null;

  // Safety net: if Safe Browsing found threats, the displayed verdict MUST reflect danger
  const effectiveVerdict: Verdict =
    sbThreats.length > 0 && result?.verdict !== "Likely fraud"
      ? "Likely fraud"
      : result?.verdict ?? "Safe";

  // Evidence-based identification — assembled only from what we actually
  // observed at the destination. No name is ever shown without evidence.
  const identification = useMemo(
    () =>
      result
        ? buildIdentification(
            {
              meta: linkMeta,
              linkVerdict: effectiveVerdict,
              sbThreatCount: sbThreats.length,
              sbConfigured: !sbApiKeyMissing,
            },
            t,
          )
        : null,
    [result, linkMeta, effectiveVerdict, sbThreats.length, sbApiKeyMissing, t],
  );

  // ── Plain-language "what this is + verdict" conclusion ──
  function hostOf(u: string): string {
    try {
      return new URL(u).hostname;
    } catch {
      return u;
    }
  }
  const checkedUrl = linkMeta?.finalUrl ?? extractUrls(text)[0] ?? null;
  const hasMeta =
    !!linkMeta && !!(linkMeta.title || linkMeta.description || (linkMeta.pageType && linkMeta.pageType !== "webpage"));
  const whatLabel = linkMeta?.title || (checkedUrl ? hostOf(checkedUrl) : "");
  const conclusionText = (() => {
    if (!result || !checkedUrl) return null;
    if (hasMeta) {
      if (effectiveVerdict === "Likely fraud") return lc.conclusionFraud.replace("{what}", whatLabel);
      if (effectiveVerdict === "Suspicious") return lc.conclusionSuspicious.replace("{what}", whatLabel);
      return lc.conclusionSafe.replace("{what}", whatLabel);
    }
    if (effectiveVerdict === "Likely fraud") return lc.conclusionFraudNoMeta.replace("{what}", whatLabel);
    if (effectiveVerdict === "Suspicious") return lc.conclusionSuspiciousNoMeta.replace("{what}", whatLabel);
    return lc.conclusionSafeNoMeta.replace("{what}", whatLabel);
  })();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <BackToHome className="mb-6" />
      <p className="text-sm font-medium text-teal-500">{lc.badge}</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        {lc.title}
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        {lc.description}
      </p>

      {/* Input */}
      <div className="mt-8 space-y-3">
        <label htmlFor="check-input" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {lc.inputLabel}
        </label>
        <textarea
          id="check-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={lc.placeholder}
          className="block w-full min-h-[64px] resize-y overflow-y-auto rounded-2xl border border-zinc-300 bg-white px-4 py-3 leading-relaxed text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePaste}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {lc.pasteClipboard}
          </button>
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking || !text.trim()}
            className="rounded-full bg-teal-500 px-6 py-2 text-sm font-semibold text-black transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? lc.checking : lc.checkNow}
          </button>
        </div>

        {pasteError && <p className="text-sm text-red-600 dark:text-red-400">{pasteError}</p>}
      </div>

      {/* Loading */}
      {checking && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{lc.scanning}</p>
        </div>
      )}

      {/* Results */}
      {!checking && result && verdictStyle && (
        <div className="mt-8 space-y-6">
          {/* What this link contains — real page metadata (no AI needed) */}
          {metaLoading && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{lc.metaLoading}</p>
              </div>
            </div>
          )}
          {!metaLoading && linkMeta && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{lc.whatInsideHeading}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{lc.metaFromSite}</p>
              {linkMeta.title && (
                <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">
                  {linkMeta.title}
                </p>
              )}
              {linkMeta.description && (
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{linkMeta.description}</p>
              )}
              {linkMeta.siteName && (
                <p className="mt-2 text-xs text-zinc-500">{lc.metaSiteLabel}: {linkMeta.siteName}</p>
              )}
              {linkMeta.pageType && linkMeta.pageType !== "webpage" && (
                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-yellow-400">{lc.pageTypeLine.replace("{type}", linkMeta.pageType.toUpperCase())}</p>
              )}
              {linkMeta.adult && (
                <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">⚠ {lc.adultWarning}</p>
              )}
            </div>
          )}

          {/* AI guess — only when the website itself gave us nothing */}
          {!metaLoading && linkMetaBlocked && linkDescLoading && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{lc.aboutLinkLoading}</p>
              </div>
            </div>
          )}
          {!metaLoading && linkMetaBlocked && !linkDescLoading && linkDescription && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{lc.aboutLinkHeading}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{linkDescription}</p>
            </div>
          )}
          {!metaLoading && linkMetaBlocked && !linkDescLoading && !linkDescription && checkedUrl && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{lc.cannotSeeInside}</p>
            </div>
          )}

          <div className={`rounded-2xl border p-6 ${
            effectiveVerdict !== result.verdict
              ? VERDICT_STYLES["Likely fraud"].bg
              : verdictStyle.bg
          }`}>
            <div className="flex items-center gap-4">
              <span className="text-4xl" aria-hidden="true">
                {effectiveVerdict !== result.verdict
                  ? VERDICT_STYLES["Likely fraud"].icon
                  : verdictStyle.icon}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{lc.verdict}</p>
                <p className={`text-2xl font-bold ${
                  effectiveVerdict !== result.verdict
                    ? VERDICT_STYLES["Likely fraud"].color
                    : verdictStyle.color
                }`}>
                  {translateVerdict(effectiveVerdict)}
                </p>
                {effectiveVerdict !== result.verdict && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    Upgraded based on Google Safe Browsing detection
                  </p>
                )}
              </div>
            </div>

            {result.flags.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                {lc.noIssues}
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {result.flags.map((flag, i) => (
                  <FlagItem key={`${flag.matchedText}-${flag.tipKey}-${i}`} flag={flag} t={lc} />
                ))}
              </ul>
            )}
          </div>

          {/* Evidence-based identification panel */}
          {!metaLoading && identification && (
            <EvidencePanel identification={identification} />
          )}

          {/* Tips */}
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
            <h2 className="font-semibold text-red-700 dark:text-red-300">⚠️ {lc.whyMatters}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-red-600 dark:text-red-400">
              {result.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          {/* Google Safe Browsing result */}
          {sbChecking && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Checking URL reputation with Google Safe Browsing...</p>
              </div>
            </div>
          )}
          {!sbChecking && !sbApiKeyMissing && (
            <div className={`rounded-2xl border p-4 ${sbThreats.length > 0 ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20" : "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/20"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Google Safe Browsing</p>
              {sbThreats.length > 0 ? (
                <div className="mt-2">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">⛔ URL flagged as dangerous</p>
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
                <p className="mt-1 text-sm text-teal-700 dark:text-teal-300">✓ No known threats found for this URL</p>
              )}
            </div>
          )}
          {sbApiKeyMissing && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">Google Safe Browsing not configured. Add GOOGLE_SAFE_BROWSING_API_KEY to enable URL reputation checks.</p>
            </div>
          )}

          {saveError && (
            <p className="text-sm text-amber-700 dark:text-yellow-400">{saveError}</p>
          )}

          {/* Plain-language conclusion: what the link IS + what to do */}
          {conclusionText && (
            <div className={`rounded-2xl border p-6 ${VERDICT_STYLES[effectiveVerdict].bg}`}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                💬 {lc.conclusionHeading}
              </h2>
              <p className="mt-3 text-base leading-relaxed font-medium text-zinc-900 dark:text-zinc-100">
                {conclusionText}
              </p>
              {linkMeta?.adult && (
                <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">⚠ {lc.adultWarning}</p>
              )}
            </div>
          )}

          {effectiveVerdict === "Likely fraud" && (
            <button
              type="button"
              onClick={handleReport}
              className="w-full rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              {lc.reportScam}
            </button>
          )}
        </div>
      )}

      {/* Recent checks */}
      {user && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{lc.recentChecks}</h2>
          {loadingRecent && (
            <p className="mt-3 text-sm text-zinc-500">{lc.loadingRecent}</p>
          )}
          {!loadingRecent && recentChecks.length === 0 && (
            <p className="mt-3 text-sm text-zinc-500">
              {lc.noRecent}
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {recentChecks.map((check) => (
              <li
                key={check.id}
                className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${riskBadgeClass(check.risk_level)}`}
                >
                  {riskLabel(check.risk_level)}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {check.input_text.slice(0, 60)}
                  {check.input_text.length > 60 ? "…" : ""}
                </p>
                <time className="shrink-0 text-xs text-zinc-500">
                  {new Date(check.created_at).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
