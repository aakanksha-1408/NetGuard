import {
  getCategoryLabel,
  type RiskLevel,
  type ScanResult,
  type SafetyFlag,
} from "@/lib/safetyScanner";

const FLAG_EXPLANATIONS: Record<string, string> = {
  "Avoid sharing phone numbers publicly.":
    "It contains a phone number, which scammers can use to contact or harass you.",
  "Email addresses can be used for spam or phishing.":
    "It contains an email address that could be used to target you.",
  "Home addresses should stay private online.":
    "It appears to include a home address — personal location info is risky to share.",
  "This language can hurt others. Consider rephrasing.":
    "It contains harmful or abusive language.",
  "Shortened links can hide unsafe destinations.":
    "It includes a shortened link that hides where it really leads.",
  "Links with unusual characters may be phishing attempts.":
    "It contains a link with unusual characters often used in fake websites.",
  "Messages promising free money are often scams.":
    "It uses common scam phrases like promises of free money or prizes.",
};

function describeFlag(flag: SafetyFlag): string {
  const explanation = FLAG_EXPLANATIONS[flag.message] ?? flag.message;
  return `• ${getCategoryLabel(flag.category)}: ${explanation}`;
}

export function generateBotReply(result: ScanResult): string {
  const { riskLevel, flags } = result;

  if (riskLevel === "high") {
    const flagList =
      flags.length > 0
        ? `\n\nHere's what I found:\n${flags.map(describeFlag).join("\n")}`
        : "";

    return (
      `⚠️ This looks like a scam — I'd treat it as high risk.${flagList}\n\n` +
      `My advice:\n` +
      `• Do NOT click any links in this message\n` +
      `• Do NOT share personal info, OTPs, or payment details\n` +
      `• Do NOT reply to the sender\n` +
      `• Block and report them on the platform where you received this`
    );
  }

  if (riskLevel === "medium") {
    const flagList =
      flags.length > 0
        ? `\n\nHere's what caught my attention:\n${flags.map(describeFlag).join("\n")}`
        : "";

    return (
      `🤔 This message has some warning signs — proceed with caution.${flagList}\n\n` +
      `Before taking any action, verify through an official channel:\n` +
      `• Go directly to the company's website or app (don't use links from the message)\n` +
      `• Call them using a number from their official site, not from the message\n` +
      `• Ask a trusted friend or adult to look at it if you're unsure`
    );
  }

  return (
    `✅ I didn't spot any obvious scam red flags in this message.\n\n` +
    `That said, always stay cautious with messages from people you don't know. ` +
    `Scammers can be convincing, and new tricks appear all the time. ` +
    `If something feels off — even without clear flags — trust your gut.`
  );
}

export function getVerdictForStorage(riskLevel: RiskLevel): RiskLevel {
  return riskLevel;
}

export const WELCOME_MESSAGE =
  "Hi! Paste any suspicious message you've received — an SMS, email, or DM — and I'll check it for scam red flags.";
