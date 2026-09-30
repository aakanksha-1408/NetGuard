/**
 * Keyword-based scam classifier for news articles.
 *
 * Analyses an article's title (and source when available) to decide
 * whether it is scam/fraud-related, assign a category, extract the
 * platform involved, and estimate confidence.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ScamCategory =
  | "Phishing"
  | "UPI / Payment Scam"
  | "Investment Scam"
  | "Job Scam"
  | "Shopping Scam"
  | "Social Media Scam"
  | "Banking Scam"
  | "OTP Scam"
  | "Cryptocurrency Scam"
  | "Online Fraud"
  | "Identity Theft"
  | "Other";

export type Platform =
  | "WhatsApp"
  | "Instagram"
  | "Facebook"
  | "Telegram"
  | "Google"
  | "UPI"
  | "Phone / SMS"
  | "Banking Apps"
  | "E-commerce"
  | "Websites"
  | "LinkedIn"
  | "YouTube"
  | "X / Twitter"
  | "Unknown";

export type Confidence = "high" | "medium" | "low";

export type Classification = {
  isScam: boolean;
  category: ScamCategory;
  platform: Platform;
  confidence: Confidence;
};

/* ------------------------------------------------------------------ */
/* Keyword maps (all lowercase for case-insensitive matching)           */
/* ------------------------------------------------------------------ */

const CATEGORY_KEYWORDS: { category: ScamCategory; keywords: string[] }[] = [
  {
    category: "Phishing",
    keywords: [
      "phish",
      "phishing",
      "fake link",
      "fake email",
      "fake website",
      "credential theft",
      "login page",
      "spoofing",
      "smishing",
      "vishing",
      "clone site",
    ],
  },
  {
    category: "UPI / Payment Scam",
    keywords: [
      "upi scam",
      "upi fraud",
      "payment scam",
      "payment fraud",
      "upi link",
      "collect request",
      "qr code scam",
      "qr code fraud",
      "digital payment scam",
      "paytm scam",
      "phonepe scam",
      "gpay scam",
      "google pay scam",
      "money transfer scam",
    ],
  },
  {
    category: "Investment Scam",
    keywords: [
      "investment scam",
      "investment fraud",
      "ponzi",
      "pyramid scheme",
      "get rich quick",
      "fake investment",
      "stock scam",
      "trading scam",
      "forex scam",
      "pump and dump",
    ],
  },
  {
    category: "Job Scam",
    keywords: [
      "job scam",
      "job fraud",
      "fake job",
      "employment scam",
      "work from home scam",
      "task scam",
      "data entry scam",
      "recruitment scam",
      "job offer scam",
      "part-time job scam",
    ],
  },
  {
    category: "Shopping Scam",
    keywords: [
      "shopping scam",
      "fake product",
      "counterfeit",
      "ecommerce scam",
      "e-commerce scam",
      "fake store",
      "fake online shop",
      "delivery scam",
      "fake delivery",
      "parcel scam",
    ],
  },
  {
    category: "Social Media Scam",
    keywords: [
      "social media scam",
      "fake profile",
      "catfish",
      "romance scam",
      "fake account",
      "impersonation",
      "fake influencer",
      "hacked account",
      "account takeover",
      "fake follower",
      "social media fraud",
    ],
  },
  {
    category: "Banking Scam",
    keywords: [
      "banking scam",
      "bank fraud",
      "card scam",
      "credit card fraud",
      "debit card scam",
      "atm scam",
      "skimming",
      "bank account hack",
      "loan scam",
      "fake loan",
      "foreclosure scam",
    ],
  },
  {
    category: "OTP Scam",
    keywords: [
      "otp scam",
      "otp fraud",
      "one time password",
      "verification code scam",
      "otp share",
    ],
  },
  {
    category: "Cryptocurrency Scam",
    keywords: [
      "crypto scam",
      "cryptocurrency scam",
      "bitcoin scam",
      "crypto fraud",
      "fake token",
      "rug pull",
      "ico scam",
      "nft scam",
      "defi scam",
      "wallet scam",
      "crypto wallet",
    ],
  },
  {
    category: "Identity Theft",
    keywords: [
      "identity theft",
      "aadhaar scam",
      "pan card scam",
      "id theft",
      "data leak",
      "data breach",
      "personal data",
      "stolen identity",
      "sim swap",
      "kyc scam",
    ],
  },
  {
    category: "Online Fraud",
    keywords: [
      "online fraud",
      "cyber fraud",
      "internet fraud",
      "digital fraud",
      "cybercrime",
      "cyber crime",
      "online scam",
      "internet scam",
      "scam app",
      "fake app",
      "ransomware",
      "malware",
    ],
  },
];

const PLATFORM_KEYWORDS: { platform: Platform; keywords: string[] }[] = [
  {
    platform: "WhatsApp",
    keywords: ["whatsapp", "whats app"],
  },
  {
    platform: "Instagram",
    keywords: ["instagram", "insta "],
  },
  {
    platform: "Facebook",
    keywords: ["facebook", "meta "],
  },
  {
    platform: "Telegram",
    keywords: ["telegram"],
  },
  {
    platform: "UPI",
    keywords: ["upi", "paytm", "phonepe", "gpay", "google pay", "bhim"],
  },
  {
    platform: "Banking Apps",
    keywords: [
      "bank app",
      "banking app",
      "net banking",
      "mobile banking",
      "sbi",
      "hdfc",
      "icici",
      "axis bank",
      "punjab national",
      "bob",
      "kotak",
    ],
  },
  {
    platform: "E-commerce",
    keywords: [
      "amazon",
      "flipkart",
      "meesho",
      "myntra",
      "snapdeal",
      "olx",
      "quikr",
      "shopify",
    ],
  },
  {
    platform: "Google",
    keywords: ["google", "gmail", "google play"],
  },
  {
    platform: "YouTube",
    keywords: ["youtube"],
  },
  {
    platform: "LinkedIn",
    keywords: ["linkedin"],
  },
  {
    platform: "X / Twitter",
    keywords: ["twitter", "x.com", "tweet"],
  },
  {
    platform: "Phone / SMS",
    keywords: [
      "sms",
      "phone call",
      "text message",
      "caller",
      "robocall",
      "phone number",
      "call scam",
    ],
  },
  {
    platform: "Websites",
    keywords: ["website", "web page", "url", "domain", "browser"],
  },
];

/* ------------------------------------------------------------------ */
/* Scam-related trigger words                                          */
/* ------------------------------------------------------------------ */

const SCAM_SIGNAL_WORDS = [
  "scam",
  "fraud",
  "cheat",
  "con",
  "hoax",
  "swindle",
  "duped",
  "looted",
  "fleeced",
  "tricked",
  "cybercrime",
  "cyber crime",
  "cybercriminal",
  "data breach",
  "privacy",
  "hacked",
  "hackers",
  "malware",
  "ransomware",
  "phishing",
  "fake",
  "illegal",
  "unauthorized",
  "unauthorised",
  "stolen",
  "theft",
  "crime",
  "criminal",
  "arrested",
  "busted",
  "nabbed",
  "caught",
];

/* ------------------------------------------------------------------ */
/* Main classifier                                                     */
/* ------------------------------------------------------------------ */

export function classifyArticle(title: string): Classification {
  const lower = title.toLowerCase();

  // 1. Check if article is scam-related at all
  const signalHits = SCAM_SIGNAL_WORDS.filter((w) => lower.includes(w));
  if (signalHits.length === 0) {
    return {
      isScam: false,
      category: "Other",
      platform: "Unknown",
      confidence: "low",
    };
  }

  // 2. Determine category
  let bestCategory: ScamCategory = "Online Fraud"; // sensible default
  let bestCategoryScore = 0;

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestCategoryScore) {
      bestCategoryScore = score;
      bestCategory = category;
    }
  }

  // 3. Determine platform
  let bestPlatform: Platform = "Unknown";
  let bestPlatformScore = 0;

  for (const { platform, keywords } of PLATFORM_KEYWORDS) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestPlatformScore) {
      bestPlatformScore = score;
      bestPlatform = platform;
    }
  }

  // 4. Confidence
  let confidence: Confidence = "low";
  if (bestCategoryScore >= 2 || signalHits.length >= 3) {
    confidence = "high";
  } else if (bestCategoryScore >= 1 || signalHits.length >= 2) {
    confidence = "medium";
  }

  return {
    isScam: true,
    category: bestCategory,
    platform: bestPlatform,
    confidence,
  };
}
