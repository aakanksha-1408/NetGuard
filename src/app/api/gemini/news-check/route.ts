import { NextRequest, NextResponse } from "next/server";
import {
  AI_DAILY_SOFT_LIMIT,
  aiCacheGet,
  aiCacheKey,
  aiCacheSet,
  aiDailyCallCount,
  aiThrottleAllowed,
  callGeminiWithFallback,
  dailyLimitMessage,
  incrementAiDailyCalls,
  throttleMessage,
} from "@/lib/aiQuota";

const FACT_CHECK_URL =
  "https://factchecktools.googleapis.com/v1alpha1/claims:search";

/** Search Google Fact Check Tools for existing verified fact-checks */
async function searchFactChecks(query: string, apiKey: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      query: query.slice(0, 200),
      key: apiKey,
      languageCode: "en",
      pageSize: "5",
    });
    const res = await fetch(`${FACT_CHECK_URL}?${params}`, {
      next: { revalidate: 3600 }, // cache for 1 hour
    });
    if (!res.ok) return "";
    const data = await res.json();
    const claims = data?.claims as Array<{
      text?: string;
      claimReview?: Array<{
        publisher?: { name?: string };
        textualRating?: string;
        url?: string;
      }>;
    }>;
    if (!claims?.length) return "";
    return claims
      .map((c) => {
        const review = c.claimReview?.[0];
        const publisher = review?.publisher?.name ?? "Unknown";
        const rating = review?.textualRating ?? "N/A";
        return `• Claim: "${c.text}"\n  Rated: ${rating} (by ${publisher})`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

// ---- Source-URL fetching -------------------------------------------------
// The News/Post tab lets a user paste a link to the article they want
// fact-checked. We fetch it SERVER-SIDE (never trust the browser to do this,
// and never let the model pretend it read a page it didn't) with an http(s)-
// only, private-address-blocked, redirect-capped, size-capped request, then
// strip the HTML down to readable text so the model can actually analyse the
// page. Any failure fails OPEN — a blocked/timed-out link degrades to a clear
// "could not be retrieved" note rather than a hard error, per the never-guess
// rule.
const SOURCE_TIMEOUT_MS = 8000;
const SOURCE_MAX_BYTES = 512 * 1024;
const SOURCE_MAX_HOPS = 3;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(h)) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h)) return true;
  return false;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeBasicEntities(m?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function extractVisibleText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeBasicEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

async function fetchSourcePage(
  rawUrl: string,
): Promise<{ ok: boolean; finalUrl?: string; title?: string; text?: string; reason?: string }> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "the link is not a valid URL" };
  }
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    return { ok: false, reason: "only http/https links are supported" };
  }

  let html = "";
  try {
    let hops = 0;
    for (; hops <= SOURCE_MAX_HOPS; ) {
      if (isPrivateHost(current.hostname)) {
        return { ok: false, reason: "the link points to a non-public address" };
      }
      const res = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; NetGuardNewsChecker/1.0; security research)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        hops++;
        continue;
      }
      if (!res.ok) {
        return { ok: false, reason: `the site returned HTTP ${res.status}` };
      }
      const ct = res.headers.get("content-type") || "";
      if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) {
        return { ok: false, reason: "the link is not an HTML/text page" };
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const chunks: string[] = [];
      let received = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          chunks.push(decoder.decode(value, { stream: true }));
          if (received >= SOURCE_MAX_BYTES) {
            try {
              await reader.cancel();
            } catch {
              /* best effort */
            }
            break;
          }
        }
      }
      html = chunks.join("");
      break;
    }
    if (hops > SOURCE_MAX_HOPS) {
      return { ok: false, reason: "too many redirects" };
    }
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      reason: timedOut
        ? "the site took too long to respond"
        : "the site could not be reached",
    };
  }

  const text = extractVisibleText(html);
  if (!text) {
    return {
      ok: false,
      finalUrl: current.toString(),
      title: extractTitle(html),
      reason: "no readable text could be extracted from the page",
    };
  }
  return {
    ok: true,
    finalUrl: current.toString(),
    title: extractTitle(html),
    text: text.slice(0, 3000),
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        result: null,
        apiKeyMissing: true,
      });
    }

    const { text, lang, imageData, imageMimeType, sessionId, url } = (await request.json()) as {
      text: string;
      lang: string;
      imageData?: string;
      imageMimeType?: string;
      sessionId?: string;
      url?: string;
    };

    if (!text?.trim() && !imageData && !url?.trim()) {
      return NextResponse.json({ result: null });
    }

    // ---- Response cache: identical (or near-identical) input is served
    // instantly from Supabase without spending a Gemini free-tier call.
    // The source URL is folded into the key so the same claim text paired
    // with a different link does not collide with a cached answer.
    const cacheKey = aiCacheKey(
      "news",
      lang,
      (text ?? "") + (url?.trim() ? `\nURL:${url.trim()}` : ""),
      imageData ?? null,
    );
    const cachedResult = await aiCacheGet<Record<string, unknown>>(cacheKey);
    if (cachedResult) {
      return NextResponse.json({ result: cachedResult, apiKeyMissing: false, cached: true });
    }

    // ---- Quota guardrails (only for calls that would actually hit Gemini):
    // soft daily cap first (friendly message instead of a raw 429), then the
    // per-user 2-minute cooldown so one visitor can't drain the day's budget.
    if ((await aiDailyCallCount()) >= AI_DAILY_SOFT_LIMIT) {
      return NextResponse.json({
        result: null,
        apiKeyMissing: false,
        error: dailyLimitMessage(lang),
        errorType: "daily_limit",
      });
    }
    if (!(await aiThrottleAllowed(sessionId ?? "anonymous"))) {
      return NextResponse.json({
        result: null,
        apiKeyMissing: false,
        error: throttleMessage(lang),
        errorType: "throttled",
      });
    }
    // Reserve the slot before calling — failed calls still count against the
    // Google quota, so the counter must match reality.
    await incrementAiDailyCalls();

    const langName = lang === "hi" ? "Hindi" : lang === "mr" ? "Marathi" : "English";

    const hasImage = !!imageData && !!imageMimeType;

    // ---- Optional source URL: fetch the linked page server-side and fold its
    // extracted text into what we analyse. Fails open on any error.
    let analysisText = text?.trim() || "";
    const urlTrimmed = url?.trim() || "";
    if (urlTrimmed) {
      const src = await fetchSourcePage(urlTrimmed);
      const sourceNote = src.ok
        ? `\n\nSOURCE URL: ${src.finalUrl}\nSOURCE PAGE TITLE: ${src.title || "(none reported by the page)"}\nSOURCE PAGE CONTENT (automatically extracted excerpt — may be partial):\n"""\n${src.text}\n"""`
        : `\n\nSOURCE URL provided: ${urlTrimmed}\nNOTE: the linked page's content could NOT be retrieved (${src.reason}). Do NOT guess or invent what the page says — state clearly that the source page could not be verified.`;
      analysisText = `${analysisText}${sourceNote}`.trim();
    }

    // Search for existing fact-checks from verified sources
    const factCheckContext = analysisText
      ? await searchFactChecks(analysisText.slice(0, 200), apiKey)
      : "";

    const factCheckSection = factCheckContext
      ? `\nVERIFIED FACT-CHECKS FROM CREDIBLE SOURCES (use these as strong evidence):\n${factCheckContext}\n`
      : "\nNo existing fact-checks were found from major fact-checking organisations. This alone does NOT make the claim fake — it most likely means UNVERIFIED. Do not invent sources or evidence that are not listed above.\n";

    const prompt = `You are NetGuard's Fact-Checking AI assistant. Analyse the following news headline, article snippet, or social media post${hasImage ? " (including the attached image)" : ""} for signs of misinformation, fake news, or misleading content.

${analysisText ? `CONTENT TO ANALYSE:\n\"\"\"\n${analysisText.slice(0, 3000)}\n\"\"\"` : "No text was provided — analyse the attached image only."}
${hasImage ? "\nAn image is also attached. Read any text visible in the image (headlines, captions, usernames, timestamps, comments) and factor it into your analysis." : ""}
${factCheckSection}
Evaluate the content for:
1. Sensationalist or emotionally manipulative language
2. Lack of credible sources or named authorities
3. Claims that contradict well-established facts or verified fact-checks above
4. Unverifiable statistics or data
5. Missing context or cherry-picked information
6. Known misinformation patterns (health scares, political disinformation, financial hype)
${hasImage ? "7. Signs of image manipulation (text overlays, cropped context, misleading captions, deepfake indicators)" : ""}
${factCheckContext ? "8. How the claim aligns with or contradicts the verified fact-checks listed above" : ""}

IMPORTANT: 
- If verified fact-checks from credible sources exist for this claim, reference them in your reasoning and let them heavily influence your verdict.
- For geopolitics, sports, science, or current events: use the fact-check evidence above as primary source.
- NEVER GUESS. Every statement in evidence[] must come from the fact-check results above or well-established known facts — never invent sources, URLs, or studies.
- If no reliable source confirms or denies the claim, the verdict is "unverified". DO NOT call something "likely fake" just because no source was found, and DO NOT call something verified just because it sounds plausible.
- "partially verified" = some elements confirmed but key details unsupported. "misleading / needs context" = facts are presented in a distorted or cherry-picked way.
- Respond ONLY in ${langName}. Keep all analysis in ${langName}.

Respond in this exact JSON format (no markdown, no code fences):
{
  "verdict": "verified" | "partially verified" | "likely fake" | "contradicted by reliable evidence" | "misleading / needs context" | "unverified",
  "confidence": "low" | "medium" | "high",
  "reasoning": "2-4 sentences explaining your verdict in plain language. If fact-checks from credible sources were found, mention them.",
  "evidence": ["each point that supports or contradicts the claim, with its source — e.g. the fact-check publishers listed above"],
  "couldNotVerify": ["specific parts of the claim that could not be confirmed with available evidence"],
  "redFlags": ["specific flag 1", "specific flag 2", "etc."],
  "suggestion": "One short actionable tip like checking a specific fact-checking site or looking for coverage from established news outlets"
}`;

    // Build parts array — always include text prompt, optionally include image
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (hasImage) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageData,
        },
      });
    }

    // Model pool: if the first model is rate-limited or overloaded (both are
    // per-model on Google's side), the next one is tried automatically.
    const { response } = await callGeminiWithFallback(apiKey, {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini news-check API error:", errorText);
      // Surface WHY the analysis failed so the UI can show a useful message:
      // 429 = free-tier quota (recovers after ~1 min), 503 = Google-side overload.
      const errorType =
        response.status === 429
          ? "rate_limit"
          : response.status === 503
            ? "model_overloaded"
            : "unavailable";
      const friendly =
        errorType === "rate_limit"
          ? "Gemini quota reached — please try again in a little while."
          : errorType === "model_overloaded"
            ? "The AI model is temporarily overloaded — please try again in a minute."
            : "AI analysis unavailable — please try again later.";
      return NextResponse.json({
        result: null,
        apiKeyMissing: false,
        error: friendly,
        errorType,
      });
    }

    const data = await response.json();
    const responseText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

    if (!responseText) {
      return NextResponse.json({ result: null, apiKeyMissing: false });
    }

    try {
      const parsed = JSON.parse(responseText);
      const validVerdicts = [
        "verified",
        "partially verified",
        "likely fake",
        "contradicted by reliable evidence",
        "misleading / needs context",
        "unverified",
      ];
      const validConfidence = ["low", "medium", "high"];
      // Backwards-compat: older verdict wordings map onto the new statuses.
      const legacyMap: Record<string, string> = {
        "likely real": "verified",
        "unverifiable": "unverified",
      };
      const rawVerdict = typeof parsed.verdict === "string" ? parsed.verdict.toLowerCase() : "";
      const mapped = legacyMap[rawVerdict] ?? rawVerdict;

      const result = {
        verdict: validVerdicts.includes(mapped) ? mapped : "unverified",
        confidence: validConfidence.includes(parsed.confidence) ? parsed.confidence : "low",
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((e: unknown) => typeof e === "string") : [],
        couldNotVerify: Array.isArray(parsed.couldNotVerify) ? parsed.couldNotVerify.filter((e: unknown) => typeof e === "string") : [],
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
        suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
      };
      await aiCacheSet(cacheKey, text ?? "", result);
      return NextResponse.json({ result, apiKeyMissing: false, cached: false });
    } catch {
      // Malformed/truncated JSON from Gemini: serve a safe fallback but
      // deliberately DO NOT cache it, so a retry can produce a real analysis.
      const result = {
        verdict: "unverified",
        confidence: "low",
        reasoning: responseText.slice(0, 500),
        evidence: [],
        couldNotVerify: [],
        redFlags: [],
        suggestion: "",
      };
      return NextResponse.json({ result, apiKeyMissing: false, cached: false });
    }
  } catch (error) {
    console.error("Gemini news-check route error:", error);
    return NextResponse.json(
      { result: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}
