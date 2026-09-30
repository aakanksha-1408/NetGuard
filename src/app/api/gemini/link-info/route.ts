import { NextRequest, NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ description: null, apiKeyMissing: true });
    }

    const { url, lang } = (await request.json()) as { url: string; lang: string };

    if (!url?.trim()) {
      return NextResponse.json({ description: null, apiKeyMissing: false });
    }

    const langName = lang === "hi" ? "Hindi" : lang === "mr" ? "Marathi" : "English";

    const prompt = `You are a helpful assistant that identifies what websites and links are. Based on the following URL, briefly describe what this link/site appears to be in 1-2 sentences of plain, non-technical language.

URL TO ANALYSE:
${url.trim()}

Examples of good responses:
- "This appears to be a link to an Instagram profile page."
- "This looks like a shortened link with an unknown destination — the real target is hidden."
- "This appears to be a phishing page mimicking a bank login."
- "This is a link to a YouTube video."
- "This looks like a link to a news article on the BBC website."

IMPORTANT: Respond ONLY in ${langName}. Keep the description to 1-2 sentences maximum. Do not include any technical jargon.

Respond with just the description text, nothing else (no JSON, no labels, no prefixes).`;

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 150,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini link-info API error:", errorText);
      return NextResponse.json({
        description: null,
        apiKeyMissing: false,
        error: "AI analysis unavailable",
      });
    }

    const data = await response.json();
    const description =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;

    return NextResponse.json({
      description,
      apiKeyMissing: false,
    });
  } catch (error) {
    console.error("Gemini link-info route error:", error);
    return NextResponse.json(
      { description: null, error: "Internal server error" },
      { status: 500 },
    );
  }
}
