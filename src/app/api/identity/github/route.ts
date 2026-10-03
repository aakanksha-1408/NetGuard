import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/identity/github?username=<handle>
 *
 * Digital Identity Map helper: fetches *public* profile data for a GitHub
 * username from the official GitHub REST API so we can auto-fill the form.
 * We only read fields the user already publishes publicly (name, location,
 * public email, company). The only thing the client sends is the username —
 * no personal form values ever leave the browser. Proxied server-side to
 * avoid browser CORS and to keep the timeout / rate-limit handling in one
 * place.
 *
 * No scraping, no login, no unofficial endpoints.
 */

export interface GitHubUserResponse {
  ok: boolean;
  reason?: "invalid_username" | "not_found" | "rate_limited" | "network";
  name?: string | null;
  bio?: string | null;
  location?: string | null;
  email?: string | null;
  company?: string | null;
}

const USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export async function GET(request: NextRequest) {
  const username = new URL(request.url).searchParams.get("username")?.trim() ?? "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json<GitHubUserResponse>({ ok: false, reason: "invalid_username" });
  }

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "NetGuard-Identity-Map" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404) {
      return NextResponse.json<GitHubUserResponse>({ ok: false, reason: "not_found" });
    }
    if (res.status === 403 || res.status === 429) {
      // Unauthenticated GitHub API is 60 req/hr/IP; treat as a soft failure.
      return NextResponse.json<GitHubUserResponse>({ ok: false, reason: "rate_limited" });
    }
    if (!res.ok) {
      return NextResponse.json<GitHubUserResponse>({ ok: false, reason: "network" });
    }

    const data = (await res.json()) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

    return NextResponse.json<GitHubUserResponse>({
      ok: true,
      name: str(data.name),
      bio: str(data.bio),
      location: str(data.location),
      email: str(data.email),
      // GitHub stores company names with a leading "@"; strip it for display.
      company: str(data.company)?.replace(/^@/, "") ?? null,
    });
  } catch {
    return NextResponse.json<GitHubUserResponse>({ ok: false, reason: "network" });
  }
}
