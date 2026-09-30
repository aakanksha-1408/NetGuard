import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { supabase, getAdminClient } from "@/lib/supabase";
import { classifyArticle } from "@/lib/scamClassifier";

/* ------------------------------------------------------------------ */
/* SQL to create the scam_reports table (idempotent)                   */
/* ------------------------------------------------------------------ */

const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS scam_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_link text NOT NULL UNIQUE,
  title text NOT NULL,
  source text NOT NULL DEFAULT 'Google News',
  published_at timestamptz,
  category text NOT NULL,
  platform text NOT NULL DEFAULT 'Unknown',
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scam_reports_article_link
  ON scam_reports (article_link);

CREATE INDEX IF NOT EXISTS idx_scam_reports_category_platform
  ON scam_reports (category, platform);

ALTER TABLE scam_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anyone_read_scam_reports ON scam_reports;
CREATE POLICY anyone_read_scam_reports
  ON scam_reports FOR SELECT USING (true);

-- No public INSERT policy: writes go through the service_role (admin) client,
-- which bypasses RLS. Public/anon insert is intentionally disallowed so the
-- heatmap can't be poisoned. See supabase/rls_hardening_part3.sql which drops
-- any legacy "anyone_insert_scam_reports" / "Anyone can insert scam_reports".

-- Reload PostgREST schema cache so the new table is visible immediately
SELECT pg_notify('pgrst', 'reload schema');
`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isTableMissingError(msg: string): boolean {
  return (
    msg.includes("Could not find the table") ||
    msg.includes("PGRST205") ||
    msg.includes("relation") && msg.includes("does not exist")
  );
}

async function ensureTableExists(): Promise<string | null> {
  const admin = getAdminClient();
  if (!admin) {
    return "The scam_reports table does not exist and SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local to enable automatic table creation.";
  }

  const { error } = await admin.rpc("exec_sql", { sql: SETUP_SQL });

  // exec_sql RPC may not exist; fall back to raw REST query
  if (error && error.message.includes("exec_sql")) {
    // Use the Supabase SQL execution endpoint via the admin client
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Execute each statement individually via pg endpoint
    const statements = SETUP_SQL
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ query: stmt }),
      });
      if (!res.ok) {
        // Try alternative: use the admin client's direct DB connection
        const fallback = await admin.from("scam_reports").select("id").limit(1);
        if (fallback.error && isTableMissingError(fallback.error.message)) {
          return `Failed to create table: ${stmt.substring(0, 80)}…`;
        }
      }
    }
  } else if (error) {
    // If rpc failed, try direct SQL execution via the admin client
    const { error: rpcErr } = await admin.rpc("query", { query: SETUP_SQL });
    if (rpcErr) {
      // Last resort: try individual table creation via raw fetch
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

      const res = await fetch(`${baseUrl}/rest/v1/rpc/query`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: SETUP_SQL }),
      });

      if (!res.ok) {
        const text = await res.text();
        // Check if table was actually created despite the error
        const check = await admin.from("scam_reports").select("id").limit(1);
        if (check.error) {
          return `Auto-setup failed: ${text}`;
        }
      }
    }
  }

  return null; // success
}

/* ------------------------------------------------------------------ */
/* Main handler                                                        */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    /* ---- 1. Try querying the scam_reports table ---- */
    const { data: probeReports, error: probeError } = await supabase
      .from("scam_reports")
      .select("id")
      .limit(1);

    /* ---- 2. If table doesn't exist, attempt auto-creation ---- */
    if (probeError && isTableMissingError(probeError.message)) {
      const setupError = await ensureTableExists();
      if (setupError) {
        return NextResponse.json(
          {
            reports: [],
            error: setupError,
            setupRequired: true,
          },
          { status: 503 },
        );
      }

      // Brief pause for schema cache propagation, then verify
      await new Promise((r) => setTimeout(r, 1000));

      const { error: verifyError } = await supabase
        .from("scam_reports")
        .select("id")
        .limit(1);

      if (verifyError) {
        return NextResponse.json(
          {
            reports: [],
            error: `Table was created but not yet visible. Please reload the page in a few seconds. (${verifyError.message})`,
            setupRequired: false,
          },
          { status: 503 },
        );
      }
    }

    /* ---- 3. Fetch articles from Google News RSS ---- */
    const rssUrl =
      "https://news.google.com/rss/search?q=online+scam+OR+social+media+privacy+OR+cybersecurity+OR+data+breach&hl=en-IN&gl=IN&ceid=IN:en";

    const res = await fetch(rssUrl, { next: { revalidate: 3600 } });
    const xml = await res.text();

    const parser = new XMLParser();
    const data = parser.parse(xml);
    const rawItems = data?.rss?.channel?.item ?? [];

    const articles: {
      title: string;
      link: string;
      pubDate: string;
      source: string;
    }[] = rawItems.map((item: any) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source?.["#text"] ?? "Google News",
    }));

    /* ---- 4. Find which articles are already processed ---- */
    const links = articles.map((a) => a.link);

    const { data: existing } =
      links.length > 0
        ? await supabase
            .from("scam_reports")
            .select("article_link")
            .in("article_link", links)
        : { data: [] };

    const existingLinks = new Set(
      (existing ?? []).map((r: { article_link: string }) => r.article_link),
    );

    /* ---- 5. Classify and insert new scam-related articles ---- */
    // Inserts use the service_role (admin) client, which bypasses RLS. The anon
    // client no longer has an INSERT policy on scam_reports (public write removed).
    const admin = getAdminClient();
    for (const article of articles) {
      if (existingLinks.has(article.link)) continue;

      const classification = classifyArticle(article.title);
      if (!classification.isScam) continue;

      if (!admin) {
        // Without the service key we cannot persist new reports; skip silently so
        // the heatmap still renders existing data (behaviour matches prior fail-silent path).
        continue;
      }

      await admin.from("scam_reports").insert([
        {
          article_link: article.link,
          title: article.title,
          source: article.source,
          published_at: article.pubDate
            ? new Date(article.pubDate).toISOString()
            : null,
          category: classification.category,
          platform: classification.platform,
          confidence: classification.confidence,
        },
      ]);
    }

    /* ---- 6. Return all scam reports (newest first) ---- */
    const { data: reports, error } = await supabase
      .from("scam_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { reports: [], error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ reports: reports ?? [] });
  } catch (err) {
    return NextResponse.json(
      { reports: [], error: "Failed to process scam reports" },
      { status: 500 },
    );
  }
}
