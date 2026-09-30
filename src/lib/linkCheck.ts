import {
  getCategoryLabel,
  scanText,
  type RiskCategory,
  type RiskLevel,
  type SafetyFlag,
} from "@/lib/safetyScanner";
import { scanUrlsInText, type UrlFlag, type UrlFlagCategory } from "@/lib/urlScanner";

export type Verdict = "Safe" | "Suspicious" | "Likely fraud";

export type StoredRiskLevel = "safe" | "suspicious" | "fraud";

export type TipKey = RiskCategory | UrlFlagCategory;

export interface CombinedFlag {
  source: "text" | "url";
  category: string;
  tipKey: TipKey;
  level: RiskLevel;
  explanation: string;
  matchedText: string;
}

export interface LinkCheckResult {
  verdict: Verdict;
  riskLevel: StoredRiskLevel;
  safeToPost: boolean;
  flags: CombinedFlag[];
  tips: string[];
}

const LEVEL_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const PLAIN_TEXT_EXPLANATIONS: Record<string, string> = {
  "Avoid sharing phone numbers publicly.":
    "This message contains a phone number — sharing it publicly can lead to spam or harassment.",
  "Email addresses can be used for spam or phishing.":
    "This message contains an email address that strangers could use to target you.",
  "Home addresses should stay private online.":
    "This looks like a home address — keep location details private to stay safe.",
  "This language can hurt others. Consider rephrasing.":
    "This message contains language that could be harmful to someone else.",
  "Shortened links can hide unsafe destinations.":
    "This link uses a shortener that hides where it really leads.",
  "Links with unusual characters may be phishing attempts.":
    "This link contains unusual characters that scammers use to disguise fake websites.",
  "Messages promising free money are often scams.":
    "This message uses common scam phrases — real companies rarely offer free money this way.",
};

const CATEGORY_TIPS: Record<TipKey, string[]> = {
  "personal-info": [
    "Never share OTPs, passwords, or bank details in messages — even if the sender looks official.",
    "If someone asks for personal info, contact the company directly through their official app or website.",
  ],
  bullying: [
    "If you receive hurtful messages, screenshot them and talk to a trusted adult or platform support.",
    "What you post about others becomes part of your digital footprint too — think before sending.",
  ],
  "suspicious-link": [
    "Hover over links before clicking, or paste them here first to check where they lead.",
    "When in doubt, go to the website directly by typing the address yourself.",
  ],
  scam: [
    "Legitimate companies never ask for OTP or passwords over message.",
    "If an offer sounds too good to be true — free money, prizes, urgent payments — it probably is.",
    "Never send money or gift cards to someone you only know online.",
  ],
  "url-ip": [
    "Real companies use normal website names, not number addresses like 192.168.x.x.",
    "If a link looks odd, close it and visit the site by typing the name yourself.",
  ],
  "url-at-symbol": [
    "Links with @ symbols can show one site in the text but send you somewhere else entirely.",
    "Always read the full web address carefully before clicking.",
  ],
  "url-tld": [
    "Scammers often use cheap domain endings — a familiar brand name on an odd ending is a red flag.",
    "Check that the website address exactly matches the official company domain.",
  ],
  "url-shortener": [
    "Short links hide the real destination — use a checker like this before clicking unknown links.",
    "Ask the sender to share the full link if you are unsure who sent it.",
  ],
  "url-subdomain": [
    "Fake sites often use long, complicated addresses to look official at a glance.",
    "Compare suspicious links side by side with the real website address you already trust.",
  ],
  "url-impersonation": [
    "Scammers create look-alike sites with names like 'paypal-secure-login.com'.",
    "Always log in through the official app or by typing the company URL yourself.",
  ],
};

function toCombinedFlag(flag: SafetyFlag): CombinedFlag {
  return {
    source: "text",
    category: getCategoryLabel(flag.category),
    tipKey: flag.category,
    level: flag.level,
    explanation: PLAIN_TEXT_EXPLANATIONS[flag.message] ?? flag.message,
    matchedText: flag.matchedText,
  };
}

function urlFlagToCombined(flag: UrlFlag): CombinedFlag {
  return {
    source: "url",
    category: "Link analysis",
    tipKey: flag.category,
    level: flag.level,
    explanation: flag.explanation,
    matchedText: flag.matchedText,
  };
}

function getHighestLevel(flags: CombinedFlag[]): RiskLevel {
  if (flags.length === 0) return "low";
  return flags.reduce<RiskLevel>(
    (highest, flag) =>
      LEVEL_RANK[flag.level] > LEVEL_RANK[highest] ? flag.level : highest,
    "low",
  );
}

function levelToVerdict(level: RiskLevel): Verdict {
  if (level === "high") return "Likely fraud";
  if (level === "medium") return "Suspicious";
  return "Safe";
}

function verdictToStoredRisk(verdict: Verdict): StoredRiskLevel {
  if (verdict === "Likely fraud") return "fraud";
  if (verdict === "Suspicious") return "suspicious";
  return "safe";
}

function collectTips(flags: CombinedFlag[]): string[] {
  const tips: string[] = [];

  for (const flag of flags) {
    const categoryTips = CATEGORY_TIPS[flag.tipKey] ?? [];
    for (const tip of categoryTips) {
      if (!tips.includes(tip)) tips.push(tip);
      if (tips.length >= 3) return tips;
    }
  }

  if (tips.length === 0) {
    return [
      "Think before you click — if a message creates urgency, slow down and verify.",
      "When unsure, ask a trusted friend or adult to look at the link with you.",
    ];
  }

  return tips;
}

export function runLinkCheck(inputText: string): LinkCheckResult {
  const trimmed = inputText.trim();

  if (!trimmed) {
    return {
      verdict: "Safe",
      riskLevel: "safe",
      safeToPost: true,
      flags: [],
      tips: [
        "Paste a link or message above, then click Check now to scan it.",
        "You can check plain URLs or full messages from SMS, email, or DMs.",
      ],
    };
  }

  const textResult = scanText(trimmed);
  const urlFlags = scanUrlsInText(trimmed);

  const flags = [
    ...textResult.flags.map(toCombinedFlag),
    ...urlFlags.map(urlFlagToCombined),
  ];

  const highestLevel = getHighestLevel(flags);
  const verdict = levelToVerdict(highestLevel);

  return {
    verdict,
    riskLevel: verdictToStoredRisk(verdict),
    safeToPost: verdict === "Safe",
    flags,
    tips: collectTips(flags),
  };
}
