import { NextRequest, NextResponse } from "next/server";

const SAFE_BROWSING_URL =
  "https://safebrowsing.googleapis.com/v4/threatMatches:find";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        threats: [],
        apiKeyMissing: true,
      });
    }

    const { urls } = (await request.json()) as { urls: string[] };

    if (!urls || urls.length === 0) {
      return NextResponse.json({ threats: [], apiKeyMissing: false });
    }

    const response = await fetch(`${SAFE_BROWSING_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: {
          clientId: "netguard-safety-app",
          clientVersion: "1.0.0",
        },
        threatInfo: {
          platformTypes: ["ANY_PLATFORM"],
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Safe Browsing API error:", errorText);
      return NextResponse.json({
        threats: [],
        apiKeyMissing: false,
        error: "Safe Browsing check failed",
      });
    }

    const data = await response.json();
    const matches = data.matches ?? [];

    const threats = matches.map(
      (m: {
        threatType: string;
        threatSubType: string;
        threat: { url: string };
      }) => ({
        threatType: m.threatType,
        threatSubType: m.threatSubType ?? "",
        url: m.threat?.url ?? "",
      }),
    );

    return NextResponse.json({ threats, apiKeyMissing: false });
  } catch (error) {
    console.error("Safe Browsing route error:", error);
    return NextResponse.json(
      { threats: [], error: "Internal server error" },
      { status: 500 },
    );
  }
}
