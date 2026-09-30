import { NextRequest, NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
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

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        result: null,
        apiKeyMissing: true,
      });
    }

    const { text, lang, imageData, imageMimeType } = (await request.json()) as {
      text: string;
      lang: string;
      imageData?: string;
      imageMimeType?: string;
    };

    if (!text?.trim() && !imageData) {
      return NextResponse.json({ result: null });
    }

    const langName = lang === "hi" ? "Hindi" : lang === "mr" ? "Marathi" : "English";

    const hasImage = !!imageData && !!imageMimeType;

    // Search for existing fact-checks from verified sources
    const factCheckContext = text?.trim()
      ? await searchFactChecks(text.slice(0, 200), apiKey)
      : "";

    const factCheckSection = factCheckContext
      ? `\nVERIFIED FACT-CHECKS FROM CREDIBLE SOURCES (use these as strong evidence):\n${factCheckContext}\n`
      : "\nNo existing fact-checks were found from major fact-checking organisations. Base your analysis on general knowledge and the evaluation criteria below.\n";

    const prompt = `You are NetGuard's Fact-Checking AI assistant. Analyse the following news headline, article snippet, or social media post${hasImage ? " (including the attached image)" : ""} for signs of misinformation, fake news, or misleading content.

${text?.trim() ? `CONTENT TO ANALYSE:\n"""\n${text.slice(0, 2000)}\n"""` : "No text was provided — analyse the attached image only."}
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
- Respond ONLY in ${langName}. Keep all analysis in ${langName}.

Respond in this exact JSON format (no markdown, no code fences):
{
  "verdict": "likely real" | "likely fake" | "unverifiable" | "misleading / needs context",
  "confidence": "low" | "medium" | "high",
  "reasoning": "2-4 sentences explaining your verdict in plain language. If fact-checks from credible sources were found, mention them.",
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

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini news-check API error:", errorText);
      return NextResponse.json({
        result: null,
        apiKeyMissing: false,
        error: "AI analysis unavailable",
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
      const validVerdicts = ["likely real", "likely fake", "unverifiable", "misleading / needs context"];
      const validConfidence = ["low", "medium", "high"];

      return NextResponse.json({
        result: {
          verdict: validVerdicts.includes(parsed.verdict) ? parsed.verdict : "unverifiable",
          confidence: validConfidence.includes(parsed.confidence) ? parsed.confidence : "low",
          reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
          redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
          suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
        },
        apiKeyMissing: false,
      });
    } catch {
      return NextResponse.json({
        result: {
          verdict: "unverifiable",
          confidence: "low",
          reasoning: responseText.slice(0, 500),
          redFlags: [],
          suggestion: "",
        },
        apiKeyMissing: false,
      });
    }
  } catch (error) {
    console.error("Gemini news-check route error:", error);
    return NextResponse.json(
      { result: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}
