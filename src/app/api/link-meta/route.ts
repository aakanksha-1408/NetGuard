import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "node:dns";

/**
 * POST /api/link-meta  { url }
 *
 * Evidence collector: safely visits a URL server-side (no AI, no quota)
 * and gathers FACTS that identify what the destination really is:
 *   - final URL after following redirects hop-by-hop (each hop SSRF-checked)
 *   - domain / subdomain / HTTPS status
 *   - page <title>, meta description, Open Graph tags
 *   - organization name + location from schema.org JSON-LD (structured,
 *     published by the site itself — real evidence, not a guess)
 *   - geo meta tags (geo.placename / ICBM / geo.position)
 *   - adult-content keyword signal
 * The client turns these facts into an evidence-based identification with
 * a confidence level; when the facts don't identify anyone, we say so.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024; // only the head of the page is ever needed
const MAX_HOPS = 5;

const USER_AGENT =
  "Mozilla/5.0 (compatible; NetGuardLinkChecker/1.0; +security research)";

export interface LinkMetaResponse {
  ok: boolean;
  title?: string | null;
  description?: string | null;
  siteName?: string | null;
  pageType?: string;
  adult?: boolean;
  finalUrl?: string;
  domain?: string | null;
  subdomain?: string | null;
  isHttps?: boolean;
  redirectHops?: string[];
  suspiciousRedirect?: boolean;
  passedThroughShortener?: boolean;
  org?: {
    name: string;
    type: string;
    locality: string | null;
    region: string | null;
  } | null;
  geo?: { placename?: string | null; lat?: string | null; lng?: string | null } | null;
  blocked?: boolean;
  reason?: string;
}

/* ── SSRF guard ──────────────────────────────────────────────── */

function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase().split("%")[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    const [a, b] = lower.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT range
    return false;
  }
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return false;
}

/** Resolve the host and refuse loopback / private / metadata addresses. */
async function isPublicHttpTarget(parsed: URL): Promise<boolean> {
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) return false;
  if (isPrivateAddress(host)) return false; // IP literal
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    return records.length > 0 && records.every((r) => !isPrivateAddress(r.address));
  } catch {
    return false; // unresolvable host — nothing to fetch anyway
  }
}

/* ── Domain helpers ──────────────────────────────────────────── */

const MULTI_PART_TLDS = new Set([
  "co.in", "gov.in", "org.in", "net.in", "ac.in", "mil.in", "firm.in", "gen.in", "ind.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "co.nz", "co.za", "com.br",
  "com.sg", "com.my", "com.pk", "com.bd", "com.np", "com.lk", "co.jp", "or.jp", "ne.jp",
]);

function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return host.toLowerCase();
  const penultPair = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  if (MULTI_PART_TLDS.has(penultPair) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

const SHORTENER_DOMAINS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "bl.ink", "lnkd.in",
  "tiny.cc", "v.gd", "urlshortz.com", "df8.in", "s.id",
];

function isShortenerHost(host: string): boolean {
  const h = host.toLowerCase();
  return SHORTENER_DOMAINS.some((s) => h === s || h.endsWith("." + s));
}

/* ── HTML parsing (regex is sufficient for head tags) ────────── */

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 1114111 ? String.fromCharCode(code) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html: string, attr: "name" | "property", value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+${attr}\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*?${attr}\\s*=\\s*["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) {
      const text = decodeEntities(match[1]);
      if (text) return text.slice(0, 300);
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  const text = decodeEntities(match[1].replace(/<[^>]+>/g, ""));
  return text ? text.slice(0, 200) : null;
}

/** Organization / place facts published by the site itself via schema.org. */
function extractOrgFromJsonLd(html: string): LinkMetaResponse["org"] {
  const blocks = [...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0, 6);
  for (const block of blocks) {
    try {
      let data = JSON.parse(block[1].trim());
      const candidates: unknown[] = [];
      const flatten = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(flatten); return; }
        const obj = node as Record<string, unknown>;
        candidates.push(obj);
        if (obj["@graph"]) flatten(obj["@graph"]);
      };
      flatten(data);
      for (const c of candidates) {
        const obj = c as Record<string, unknown>;
        const types: string[] = Array.isArray(obj["@type"])
          ? obj["@type"].map(String)
          : obj["@type"]
            ? [String(obj["@type"])]
            : [];
        const isOrgLike = types.some((ty) =>
          /Organization|Business|Government|Institution|Educational|LocalBusiness|Place|Service|Museum|Hospital|Transit/i.test(ty)
        );
        const name = typeof obj.name === "string" ? decodeEntities(obj.name).slice(0, 150) : null;
        if (isOrgLike && name) {
          const addr = (typeof obj.address === "object" && obj.address !== null
            ? obj.address
            : null) as Record<string, unknown> | null;
          const locality = addr && typeof addr.addressLocality === "string" ? String(addr.addressLocality) : null;
          const region = addr && typeof addr.addressRegion === "string" ? String(addr.addressRegion) : null;
          return { name, type: types.join(","), locality, region };
        }
      }
    } catch {
      /* malformed JSON-LD block — try the next one */
    }
  }
  return null;
}

/** Standard geo meta tags some organisations publish about a location. */
function extractGeoMeta(html: string): LinkMetaResponse["geo"] {
  const placename = extractMetaContent(html, "name", "geo.placename");
  const icbm = extractMetaContent(html, "name", "ICBM");
  const position = extractMetaContent(html, "name", "geo.position");
  let lat: string | null = null;
  let lng: string | null = null;
  const coords = (icbm || position || "").split(/[,;\s]+/).filter(Boolean);
  if (coords.length >= 2 && /^-?\d+(\.\d+)?$/.test(coords[0]) && /^-?\d+(\.\d+)?$/.test(coords[1])) {
    lat = coords[0];
    lng = coords[1];
  }
  if (!placename && !lat) return null;
  return { placename, lat, lng };
}

function pageTypeFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("text/html")) return "webpage";
  if (ct.includes("application/pdf")) return "pdf";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (ct.includes("zip") || ct.includes("rar") || ct.includes("apk") || ct.includes("exe")) return "download";
  if (ct.includes("word") || ct.includes("excel") || ct.includes("document")) return "document";
  return "other";
}

/* ── Adult content keyword scan ──────────────────────────────── */

const ADULT_PATTERN =
  /\b(porn|pornhub|xxx|xvideos|xnxx|brazzers|nsfw|nude|nudes|nudez|erotic|sex\s?chat|sex\s?video|adult\s?(video|film|movie|content|site)|18\+\s?(sex|video|movie)|blue\s?film)\b/i;

/* ── Capped body read (never buffer a huge file) ─────────────── */

async function readCappedText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let received = 0;
  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  if (received >= MAX_HTML_BYTES) {
    try { await reader.cancel(); } catch { /* best effort */ }
  }
  return chunks.join("");
}

/* ── Safe hop-by-hop redirect walking ──────────────────────────
 * We follow redirects MANUALLY so every intermediate host gets the
 * same SSRF check before we ever connect to it. Suspicious redirect
 * chains (e.g. via a shortener or an unrelated site) are reported as
 * evidence instead of being blindly trusted. */

async function fetchWithSafeHops(
  startUrl: string,
): Promise<{ res: Response | null; hops: string[]; error?: string }> {
  const hops: string[] = [];
  let current = startUrl;
  for (let i = 0; i <= MAX_HOPS; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { res: null, hops, error: "invalid_url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { res: null, hops, error: "unsupported_protocol" };
    }
    if (!(await isPublicHttpTarget(parsed))) {
      return { res: null, hops, error: "private_address" };
    }
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*" },
        cache: "no-store",
      });
    } catch {
      return { res: null, hops, error: "fetch_failed" };
    }
    hops.push(parsed.toString());
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { res, hops };
      try {
        current = new URL(loc, parsed).toString();
      } catch {
        return { res, hops, error: "invalid_redirect" };
      }
      continue;
    }
    return { res, hops };
  }
  return { res: null, hops, error: "too_many_redirects" };
}

/* ── Route handler ───────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: string };
    const trimmed = url?.trim() ?? "";

    let start: URL;
    try {
      start = new URL(trimmed);
    } catch {
      return NextResponse.json<LinkMetaResponse>({ ok: false, blocked: true, reason: "invalid_url" });
    }
    if (start.protocol !== "http:" && start.protocol !== "https:") {
      return NextResponse.json<LinkMetaResponse>({ ok: false, blocked: true, reason: "unsupported_protocol" });
    }

    const { res, hops, error } = await fetchWithSafeHops(start.toString());
    if (!res) {
      return NextResponse.json<LinkMetaResponse>({ ok: false, blocked: true, reason: error ?? "fetch_failed", redirectHops: hops });
    }

    const finalUrl = res.url || hops[hops.length - 1] || trimmed;
    let finalParsed: URL;
    try {
      finalParsed = new URL(finalUrl);
    } catch {
      return NextResponse.json<LinkMetaResponse>({ ok: false, blocked: true, reason: "invalid_url", redirectHops: hops });
    }

    const host = finalParsed.hostname;
    const finalDomain = registrableDomain(host);
    const labels = host.toLowerCase().split(".");
    const subdomain = labels.length > 2 ? labels.slice(0, -finalDomain.split(".").length).join(".") : null;

    // Redirect-chain evidence: did the user's link bounce through other sites?
    const hopDomains = hops.map((h) => {
      try {
        return registrableDomain(new URL(h).hostname);
      } catch {
        return "";
      }
    });
    const passedThroughShortener = hops
      .slice(0, -1)
      .some((h) => {
        try {
          return isShortenerHost(new URL(h).hostname);
        } catch {
          return false;
        }
      });
    const suspiciousRedirect =
      hops.length > 1 && hopDomains.some((d, i) => i < hopDomains.length - 1 && d && d !== finalDomain);

    const contentType = res.headers.get("content-type") ?? "";
    const pageType = pageTypeFromContentType(contentType);

    if (!res.ok) {
      return NextResponse.json<LinkMetaResponse>({
        ok: false,
        blocked: true,
        reason: `http_${res.status}`,
        pageType,
        finalUrl,
        domain: finalDomain,
        subdomain,
        isHttps: finalParsed.protocol === "https:",
        redirectHops: hops,
        suspiciousRedirect,
        passedThroughShortener,
      });
    }

    let title: string | null = null;
    let description: string | null = null;
    let siteName: string | null = null;
    let org: LinkMetaResponse["org"] = null;
    let geo: LinkMetaResponse["geo"] = null;

    if (pageType === "webpage") {
      const html = await readCappedText(res);
      title = extractTitle(html);
      description =
        extractMetaContent(html, "name", "description") ??
        extractMetaContent(html, "property", "og:description") ??
        extractMetaContent(html, "name", "twitter:description");
      siteName =
        extractMetaContent(html, "property", "og:site_name") ??
        extractMetaContent(html, "name", "application-name");
      if (!title) {
        title =
          extractMetaContent(html, "property", "og:title") ??
          extractMetaContent(html, "name", "twitter:title");
      }
      org = extractOrgFromJsonLd(html);
      geo = extractGeoMeta(html);
    }
    // Non-HTML types (pdf/image/download): no tags to parse, but the page
    // type itself is meaningful information for the conclusion.

    const haystack = [finalUrl, title, description, siteName, org?.name]
      .filter(Boolean)
      .join(" ");

    return NextResponse.json<LinkMetaResponse>({
      ok: true,
      title,
      description,
      siteName,
      pageType,
      adult: ADULT_PATTERN.test(haystack),
      finalUrl,
      domain: finalDomain,
      subdomain,
      isHttps: finalParsed.protocol === "https:",
      redirectHops: hops,
      suspiciousRedirect,
      passedThroughShortener,
      org,
      geo,
    });
  } catch (err) {
    console.error("link-meta route error:", err);
    return NextResponse.json<LinkMetaResponse>(
      { ok: false, blocked: true, reason: "internal_error" },
      { status: 500 },
    );
  }
}
