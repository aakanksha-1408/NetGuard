import { NextRequest, NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        aiInsight: null,
        apiKeyMissing: true,
      });
    }

    const { message, localResult, lang } = (await request.json()) as {
      message: string;
      localResult: {
        riskScore: number;
        riskBand: string;
        scamType: string;
        redFlags: Array<{ label: string; explanation: string; severity: string }>;
        entities: Record<string, string[]>;
      };
      lang: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ aiInsight: null });
    }

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

Respond in this exact JSON format (no markdown, no code fences):
{"additionalInsights":"2-3 sentence summary of what the AI found beyond the local analysis","socialEngineeringTechniques":["technique 1","technique 2"],"scammerIntent":"1-2 sentence description of what the scammer is trying to achieve","subtleRedFlags":["flag 1","flag 2"],"detailedExplanation":"3-5 sentence explanation of why this is suspicious, written in simple language","recommendedActions":["action 1","action 2","action 3"]}`;

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return NextResponse.json({
        aiInsight: null,
        apiKeyMissing: false,
        error: "AI analysis unavailable",
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
      return NextResponse.json({
        aiInsight: {
          additionalInsights: parsed.additionalInsights ?? "",
          socialEngineeringTechniques: parsed.socialEngineeringTechniques ?? [],
          scammerIntent: parsed.scammerIntent ?? "",
          subtleRedFlags: parsed.subtleRedFlags ?? [],
          detailedExplanation: parsed.detailedExplanation ?? "",
          recommendedActions: parsed.recommendedActions ?? [],
        },
        apiKeyMissing: false,
      });
    } catch {
      return NextResponse.json({
        aiInsight: {
          additionalInsights: text.slice(0, 500),
          socialEngineeringTechniques: [],
          scammerIntent: "",
          subtleRedFlags: [],
          detailedExplanation: text.slice(0, 500),
          recommendedActions: [],
        },
        apiKeyMissing: false,
      });
    }
  } catch (error) {
    console.error("Gemini investigate route error:", error);
    return NextResponse.json(
      { aiInsight: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}
