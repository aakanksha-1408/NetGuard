export type RiskLevel = "low" | "medium" | "high";

export type RiskCategory =
  | "personal-info"
  | "bullying"
  | "suspicious-link"
  | "scam";

export interface SafetyFlag {
  category: RiskCategory;
  level: RiskLevel;
  message: string;
  matchedText: string;
}

export interface ScanResult {
  flags: SafetyFlag[];
  riskLevel: RiskLevel;
  safeToPost: boolean;
}

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  "personal-info": "Personal information",
  bullying: "Bullying or harassment",
  "suspicious-link": "Suspicious link",
  scam: "Possible scam",
};

export function getCategoryLabel(category: RiskCategory): string {
  return CATEGORY_LABELS[category];
}

const RULES: Array<{
  category: RiskCategory;
  level: RiskLevel;
  message: string;
  pattern: RegExp;
}> = [
  {
    category: "personal-info",
    level: "high",
    message: "Avoid sharing phone numbers publicly.",
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/gi,
  },
  {
    category: "personal-info",
    level: "high",
    message: "Email addresses can be used for spam or phishing.",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    category: "personal-info",
    level: "medium",
    message: "Home addresses should stay private online.",
    pattern: /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr)\b/gi,
  },
  {
    category: "bullying",
    level: "high",
    message: "This language can hurt others. Consider rephrasing.",
    pattern: /\b(stupid|idiot|loser|ugly|hate you|kill yourself|kys)\b/gi,
  },
  {
    category: "suspicious-link",
    level: "medium",
    message: "Shortened links can hide unsafe destinations.",
    pattern: /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl)\/\S+/gi,
  },
  {
    category: "suspicious-link",
    level: "high",
    message: "Links with unusual characters may be phishing attempts.",
    pattern: /https?:\/\/[^\s]*[^\w\-./:?#&=%][^\s]*/gi,
  },
  {
    category: "scam",
    level: "high",
    message: "Messages promising free money are often scams.",
    pattern: /\b(free money|you won|claim your prize|send bank details|wire transfer)\b/gi,
  },
];

const LEVEL_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function getHighestRiskLevel(flags: SafetyFlag[]): RiskLevel {
  if (flags.length === 0) {
    return "low";
  }

  return flags.reduce<RiskLevel>(
    (highest, flag) =>
      LEVEL_RANK[flag.level] > LEVEL_RANK[highest] ? flag.level : highest,
    "low",
  );
}

export function scanText(text: string): ScanResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { flags: [], riskLevel: "low", safeToPost: true };
  }

  const flags: SafetyFlag[] = [];

  for (const rule of RULES) {
    const matches = trimmed.match(rule.pattern);
    if (!matches) {
      continue;
    }

    for (const match of matches) {
      flags.push({
        category: rule.category,
        level: rule.level,
        message: rule.message,
        matchedText: match,
      });
    }
  }

  const riskLevel = getHighestRiskLevel(flags);

  return {
    flags,
    riskLevel,
    safeToPost: riskLevel !== "high",
  };
}
