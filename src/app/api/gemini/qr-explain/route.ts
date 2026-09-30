import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithFallback } from "@/lib/aiQuota";

/** Recursively unwrap a value that may be a JSON-stringified string. */
function sanitizeField(value: unknown): string {
  if (typeof value !== "string") return "";
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    if (
      (current.startsWith("{") && current.endsWith("}")) ||
      (current.startsWith("[") && current.endsWith("]"))
    ) {
      try {
        const inner = JSON.parse(current);
        if (typeof inner === "string") {
          current = inner;
          continue;
        }
        if (inner && typeof inner === "object") {
          return (
            inner.explanation ||
            inner.text ||
            inner.value ||
            JSON.stringify(inner)
          );
        }
        return String(inner);
      } catch {
        break;
      }
    } else {
      break;
    }
  }
  return current;
}

function sanitizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeField(item)).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        explanation: null,
        apiKeyMissing: true,
      });
    }

    const { content, contentType, lang, linkCheckVerdict } =
      (await request.json()) as {
        content: string;
        contentType: string;
        lang: string;
        linkCheckVerdict?: string;
      };

    if (!content?.trim()) {
      return NextResponse.json({ explanation: null });
    }

    const langName =
      lang === "hi" ? "Hindi" : lang === "mr" ? "Marathi" : "English";

    const linkInfo = linkCheckVerdict
      ? `\nLink Checker Verdict: ${linkCheckVerdict}`
      : "";

    const prompt = `You are NetGuard's QR Code Security AI. A user scanned a QR code and you need to explain what it contains and whether it is safe.

QR CODE DECODED CONTENT:
"""
${content.slice(0, 1500)}
"""

CONTENT TYPE: ${contentType}${linkInfo}

Provide a clear, simple security explanation. CRITICAL RULES:
- Each field value must be a SIMPLE PLAIN TEXT string — NEVER use JSON objects, arrays, or nested structures as values.
- Do NOT wrap any part of your response in nested JSON.
- Do NOT translate or modify any URLs, UPI IDs, phone numbers, or technical identifiers.
- Keep explanations SHORT: 2-3 short sentences per field, plain language for a non-technical user.
- Write entirely in ${langName}.

Respond in this exact JSON format (no markdown, no code fences):
{"contentType":"${contentType}","explanation":"2-3 short plain-text sentences about what this QR contains","safetyLevel":"Safe or Suspicious or Risky","safetyExplanation":"2-3 short plain-text sentences explaining why","potentialRisks":["short risk 1","short risk 2"],"recommendations":["short recommendation 1","short recommendation 2","short recommendation 3"]}`;

    // Model pool: if the first model is rate-limited or overloaded, the next
    // one is tried automatically (per-model quota on Google's side).
    const { response } = await callGeminiWithFallback(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini QR-explain API error:", errorText);
      return NextResponse.json({
        explanation: null,
        apiKeyMissing: false,
        error: "AI explanation unavailable",
      });
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

    if (!text) {
      return NextResponse.json({ explanation: null, apiKeyMissing: false });
    }

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json({
        explanation: {
          contentType: sanitizeField(parsed.contentType) || contentType,
          explanation: sanitizeField(parsed.explanation),
          safetyLevel: sanitizeField(parsed.safetyLevel) || "Suspicious",
          safetyExplanation: sanitizeField(parsed.safetyExplanation),
          potentialRisks: sanitizeArray(parsed.potentialRisks),
          recommendations: sanitizeArray(parsed.recommendations),
        },
        apiKeyMissing: false,
      });
    } catch {
      return NextResponse.json({
        explanation: {
          contentType,
          explanation: text.slice(0, 500),
          safetyLevel: "Suspicious",
          safetyExplanation: text.slice(0, 500),
          potentialRisks: [],
          recommendations: [],
        },
        apiKeyMissing: false,
      });
    }
  } catch (error) {
    console.error("Gemini QR-explain route error:", error);
    return NextResponse.json(
      { explanation: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}
