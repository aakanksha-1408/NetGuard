// Server-side helpers that keep REAL (uncached) Gemini calls to a minimum,
// because the free-tier key shares a hard 20 requests/DAY quota across every
// visitor (GenerateRequestsPerDayPerProjectPerModel-FreeTier).
//
// Used by src/app/api/gemini/investigate + src/app/api/gemini/news-check.
// Backed by supabase/ai_response_cache.sql (run that file once in the SQL
// Editor). Every helper FAILS OPEN: if the admin client is unconfigured or
// the tables don't exist yet, routes behave exactly like they did before
// (no cache, no throttling) instead of breaking the feature.

import { createHash } from "crypto";
import { getAdminClient } from "./supabase";

/** Soft cap: stop real calls at 18/20 so users see a friendly message, not a raw Gemini 429. */
export const AI_DAILY_SOFT_LIMIT = 18;
/** Cooldown between real (non-cached) Gemini calls for one user/session. */
export const AI_THROTTLE_WINDOW_SECONDS = 120;
/** Cached analyses older than this are treated as misses and re-generated. */
export const AI_CACHE_TTL_DAYS = 30;

/** Lowercase, strip punctuation, collapse whitespace — near-identical text maps to one key. */
export function normalizeForCache(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SHA-256 cache key. Scoped by feature kind + response language (a Hindi
 * analysis must never be served to an English request), and by the image
 * bytes when one was attached.
 */
export function aiCacheKey(
  kind: "scam" | "news",
  lang: string | undefined,
  text: string,
  imageData?: string | null,
): string {
  const parts = [kind, lang || "en", normalizeForCache(text)];
  if (imageData) parts.push(createHash("sha256").update(imageData).digest("hex"));
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

/** Cached Gemini JSON for this key, or null (miss / stale / cache unavailable). */
export async function aiCacheGet<T = unknown>(hash: string): Promise<T | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("ai_response_cache")
      .select("gemini_response, created_at")
      .eq("input_hash", hash)
      .maybeSingle();
    if (error || !data) return null;
    const ageMs = Date.now() - new Date(data.created_at as string).getTime();
    if (ageMs > AI_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
    return data.gemini_response as T;
  } catch {
    return null;
  }
}

/** Store a fresh Gemini result so the next identical input is free. Best-effort. */
export async function aiCacheSet(hash: string, originalText: string, response: unknown): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.from("ai_response_cache").upsert(
      {
        input_hash: hash,
        original_input_text: (originalText || "").slice(0, 2000),
        gemini_response: response as Record<string, unknown>,
        created_at: new Date().toISOString(),
      },
      { onConflict: "input_hash" },
    );
  } catch {
    // non-critical — worst case the next identical input pays for one call
  }
}

/** Real Gemini calls made so far today (0 if the counter table isn't set up). */
export async function aiDailyCallCount(): Promise<number> {
  const admin = getAdminClient();
  if (!admin) return 0;
  try {
    const { data, error } = await admin.rpc("get_ai_call_count");
    if (error || typeof data !== "number") return 0;
    return data;
  } catch {
    return 0;
  }
}

/** Reserve one daily slot for a real call about to happen. Best-effort. */
export async function incrementAiDailyCalls(): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    await admin.rpc("increment_ai_call");
  } catch {
    // fail open
  }
}

/**
 * True when this actor (logged-in user id or browser session id) may make a
 * REAL call now; false while inside the cooldown window. Never called for
 * cache hits. Fails open if the table isn't set up yet.
 */
export async function aiThrottleAllowed(actorKey: string, windowSeconds = AI_THROTTLE_WINDOW_SECONDS): Promise<boolean> {
  const admin = getAdminClient();
  if (!admin) return true;
  try {
    const { data, error } = await admin.rpc("throttle_check", {
      p_actor_key: actorKey.slice(0, 128),
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Ordered Gemini model pool. Free-tier quota AND Google-side overload (503)
 * are tracked per model, so if the first model is exhausted or overloaded we
 * fall through to the next one instead of failing the user's request.
 */
export const GEMINI_MODEL_POOL = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
];

/**
 * POSTs to generateContent trying each model in the pool. Returns the first
 * response that is either OK or a non-retryable error (400/403 etc. won't
 * change between models). If every model is 429/503, the LAST failed response
 * is returned so the caller's error branch still produces a friendly message.
 */
export async function callGeminiWithFallback(
  apiKey: string,
  body: unknown,
): Promise<{ response: Response; model: string }> {
  let last: { response: Response; model: string } | null = null;
  for (const model of GEMINI_MODEL_POOL) {
    const response = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok || (response.status !== 429 && response.status !== 503)) {
      return { response, model };
    }
    last = { response, model };
    // NOTE: do NOT read response.text() here — if every model fails, the
    // caller's !response.ok branch still needs to read this body once.
    console.error(`Gemini model ${model} unavailable (HTTP ${response.status}) — trying next in pool`);
  }
  return last!;
}

// ---------------------------------------------------------------------------
// Localized guardrail messages. The routes know the UI language from the
// request body, so the friendly text comes back ready to display (same
// pattern as the rate-limit error card already built in the frontend).
// ---------------------------------------------------------------------------

export function dailyLimitMessage(lang?: string): string {
  if (lang === "hi") return "आज की दैनिक विश्लेषण सीमा पूरी हो गई है — कृपया कल पुनः प्रयास करें।";
  if (lang === "mr") return "आजची दैनिक विश्लेषण मर्यादा पूर्ण झाली आहे — कृपया उद्या पुन्हा प्रयत्न करा.";
  return "Daily analysis limit reached for today — please try again tomorrow.";
}

export function throttleMessage(lang?: string): string {
  if (lang === "hi") return "दूसरा संदेश जांचने से पहले कृपया लगभग 2 मिनट इंतज़ार करें।";
  if (lang === "mr") return "दुसरा संदेश तपासण्यापूर्वी कृपया सुमारे 2 मिनिटे थांबा.";
  return "Please wait a moment (about 2 minutes) before checking another message.";
}
