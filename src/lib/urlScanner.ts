import type { RiskLevel } from "@/lib/safetyScanner";

export type UrlFlagCategory =
  | "url-ip"
  | "url-at-symbol"
  | "url-tld"
  | "url-shortener"
  | "url-subdomain"
  | "url-impersonation";

export interface UrlFlag {
  category: UrlFlagCategory;
  level: RiskLevel;
  explanation: string;
  matchedText: string;
}

const SUSPICIOUS_TLDS = [".xyz", ".top", ".club", ".info", ".click", ".work"];

const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "is.gd",
];

const BRAND_KEYWORDS = [
  "paypal",
  "amazon",
  "google",
  "apple",
  "microsoft",
  "netflix",
  "instagram",
  "facebook",
  "whatsapp",
  "bank",
  "secure",
  "login",
  "verify",
  "account",
];

const URL_PATTERN =
  /(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-z0-9][-a-z0-9]*\.(?:com|net|org|io|co|in|xyz|top|club|info|click|work)\/[^\s<>"']*)/gi;

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;:!?)]+$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return [...new Set(matches.map(normalizeUrl))];
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function checkIpAddress(url: string, hostname: string): UrlFlag | null {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return {
      category: "url-ip",
      level: "high",
      explanation:
        "This link goes to a number address instead of a normal website name — a common trick used by scammers.",
      matchedText: url,
    };
  }
  return null;
}

function checkAtSymbol(url: string): UrlFlag | null {
  const afterProtocol = url.replace(/^https?:\/\//i, "");
  if (afterProtocol.includes("@")) {
    return {
      category: "url-at-symbol",
      level: "high",
      explanation:
        "This link hides its real destination using an @ symbol — the part after @ is where you would actually be sent.",
      matchedText: url,
    };
  }
  return null;
}

function checkSuspiciousTld(url: string, hostname: string): UrlFlag | null {
  const tld = SUSPICIOUS_TLDS.find((ext) => hostname.endsWith(ext));
  if (tld) {
    return {
      category: "url-tld",
      level: "medium",
      explanation:
        "This link uses a domain ending that scammers often choose because it is cheap and easy to register.",
      matchedText: url,
    };
  }
  return null;
}

function checkShortener(url: string, hostname: string): UrlFlag | null {
  const isShortener = SHORTENERS.some(
    (s) => hostname === s || hostname.endsWith(`.${s}`),
  );
  if (isShortener) {
    return {
      category: "url-shortener",
      level: "medium",
      explanation:
        "This link uses a shortener that hides where it really leads — you cannot see the final destination.",
      matchedText: url,
    };
  }
  return null;
}

function checkExcessiveSubdomains(url: string, hostname: string): UrlFlag | null {
  const dotCount = (hostname.match(/\./g) ?? []).length;
  if (dotCount > 3) {
    return {
      category: "url-subdomain",
      level: "medium",
      explanation:
        "This link has an unusually long web address with many extra parts — often used to look official while hiding a fake site.",
      matchedText: url,
    };
  }
  return null;
}

function checkBrandImpersonation(url: string, hostname: string): UrlFlag | null {
  const baseHost = hostname.replace(/^www\./, "");
  const parts = baseHost.split(".");
  const domainName = parts.length >= 2 ? parts.slice(0, -1).join(".") : baseHost;

  const matchedBrands = BRAND_KEYWORDS.filter((brand) =>
    domainName.includes(brand),
  );

  const looksOfficial =
    matchedBrands.length >= 2 ||
    (matchedBrands.length === 1 &&
      /(secure|login|verify|update|account|support|signin)/i.test(domainName));

  const isLikelyFake =
    looksOfficial &&
    !["paypal.com", "amazon.com", "google.com", "apple.com", "microsoft.com",
      "netflix.com", "instagram.com", "facebook.com", "whatsapp.com"].some(
      (legit) => baseHost === legit || baseHost.endsWith(`.${legit}`),
    );

  if (isLikelyFake) {
    return {
      category: "url-impersonation",
      level: "high",
      explanation:
        "This link looks like it is pretending to be a well-known company — double-check the address before trusting it.",
      matchedText: url,
    };
  }
  return null;
}

export function scanUrl(url: string): UrlFlag[] {
  const hostname = getHostname(url);
  if (!hostname) {
    return [];
  }

  const checks = [
    checkIpAddress(url, hostname),
    checkAtSymbol(url),
    checkSuspiciousTld(url, hostname),
    checkShortener(url, hostname),
    checkExcessiveSubdomains(url, hostname),
    checkBrandImpersonation(url, hostname),
  ];

  return checks.filter((flag): flag is UrlFlag => flag !== null);
}

export function scanUrlsInText(text: string): UrlFlag[] {
  const urls = extractUrls(text);
  const flags: UrlFlag[] = [];

  for (const url of urls) {
    flags.push(...scanUrl(url));
  }

  return flags;
}
