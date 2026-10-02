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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        aiInsight: null,
        apiKeyMissing: true,
      });
    }

    const { message, localResult, lang, sessionId } = (await request.json()) as {
      message: string;
      localResult: {
        riskScore: number;
        riskBand: string;
        scamType: string;
        redFlags: Array<{ label: string; explanation: string; severity: string }>;
        entities: Record<string, string[]>;
      };
      lang: string;
      sessionId?: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ aiInsight: null });
    }

    // ---- Response cache: same message (+same response language) is served
    // instantly from Supabase without spending a Gemini free-tier call.
    // localResult is deterministic for a given message, so it needs no part
    // of the key.
    const cacheKey = aiCacheKey("scam", lang, message);
    const cachedInsight = await aiCacheGet<Record<string, unknown>>(cacheKey);
    if (cachedInsight) {
      return NextResponse.json({ aiInsight: cachedInsight, apiKeyMissing: false, cached: true });
    }

    // ---- Quota guardrails (only for calls that would actually hit Gemini):
    // soft daily cap first (friendly message instead of a raw 429), then the
    // per-user 2-minute cooldown so one visitor can't drain the day's budget.
    if ((await aiDailyCallCount()) >= AI_DAILY_SOFT_LIMIT) {
      return NextResponse.json({
        aiInsight: null,
        apiKeyMissing: false,
        error: dailyLimitMessage(lang),
        errorType: "daily_limit",
      });
    }
    if (!(await aiThrottleAllowed(sessionId ?? "anonymous"))) {
      return NextResponse.json({
        aiInsight: null,
        apiKeyMissing: false,
        error: throttleMessage(lang),
        errorType: "throttled",
      });
    }
    // Reserve the slot before calling — failed calls still count against the
    // Google quota, so the counter must match reality.
    await incrementAiDailyCalls();

    const langName = lang === "hi" ? "Hindi" : lang === "mr" ? "Marathi" : "English";

    const flagSummary = localResult.redFlags
      .map((f) => `- ${f.label} (${f.severity}): ${f.explanation}`)
      .join("\n");

    const entitySummary = Object.entries(localResult.entities)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `- ${k}: ${v.join(", ")}`)
      .join("\n");

    const prompt = `You are NetGuard's Scam Investigator AI assistant. Analyse this suspicious message and provide additional insights.

MESSAGE:
"""
${message.slice(0, 2000)}
"""

LOCAL ANALYSIS RESULTS (already computed):
- Risk Score: ${localResult.riskScore}/100
- Risk Band: ${localResult.riskBand}
- Scam Type: ${localResult.scamType}
Red Flags Found:
${flagSummary || "  None"}
Entities Extracted:
${entitySummary || "  None"}

Provide ADDITIONAL insights that the local rule-based analysis might have missed. Focus on:
1. The social engineering techniques used (manipulation, fear, urgency, trust exploitation)
2. The scammer's likely intent and next steps
3. Why this message is suspicious from a broader context
4. Any subtle patterns not covered by the local rules
5. Clear, actionable recommended steps for the user

IMPORTANT: Respond ONLY in ${langName}. Do NOT translate URLs, phone numbers, UPI IDs, or other technical identifiers.
NEVER GUESS: do not claim a specific real company, station, government body, or person is behind the message unless the message itself provides verifiable evidence (an official domain, a known VPA, etc.). If the sender or organisation cannot be established, say so explicitly instead of inventing an identity. Never fabricate sources, URLs, or prior incidents.

Respond in this exact JSON format (no markdown, no code fences):
{"additionalInsights":"2-3 sentence summary of what the AI found beyond the local analysis","socialEngineeringTechniques":["technique 1","technique 2"],"scammerIntent":"1-2 sentence description of what the scammer is trying to achieve","subtleRedFlags":["flag 1","flag 2"],"detailedExplanation":"3-5 sentence explanation of why this is suspicious, written in simple language","recommendedActions":["action 1","action 2","action 3"]}`;

    // Model pool: if the first model is rate-limited or overloaded (both are
    // per-model on Google's side), the next one is tried automatically.
    const { response } = await callGeminiWithFallback(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      // Same 429/503-aware mapping as the news-check route, so the chatbot's
      // AI panel can explain WHY the analysis failed.
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
        aiInsight: null,
        apiKeyMissing: false,
        error: friendly,
        errorType,
      });
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

    if (!text) {
      return NextResponse.json({ aiInsight: null, apiKeyMissing: false });
    }

    try {
      const parsed = JSON.parse(text);
      const aiInsight = {
        additionalInsights: parsed.additionalInsights ?? "",
        socialEngineeringTechniques: parsed.socialEngineeringTechniques ?? [],
        scammerIntent: parsed.scammerIntent ?? "",
        subtleRedFlags: parsed.subtleRedFlags ?? [],
        detailedExplanation: parsed.detailedExplanation ?? "",
        recommendedActions: parsed.recommendedActions ?? [],
      };
      await aiCacheSet(cacheKey, message, aiInsight);
      return NextResponse.json({ aiInsight, apiKeyMissing: false, cached: false });
    } catch {
      // Gemini returned malformed/truncated JSON: serve a degraded insight but
      // deliberately DO NOT cache it — the next attempt deserves a clean retry
      // instead of being stuck with this fallback forever.
      const aiInsight = {
        additionalInsights: text.slice(0, 500),
        socialEngineeringTechniques: [],
        scammerIntent: "",
        subtleRedFlags: [],
        detailedExplanation: text.slice(0, 500),
        recommendedActions: [],
      };
      return NextResponse.json({ aiInsight, apiKeyMissing: false, cached: false });
    }
  } catch (error) {
    console.error("Gemini investigate route error:", error);
    return NextResponse.json(
      { aiInsight: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}
