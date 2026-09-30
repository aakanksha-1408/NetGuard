/**
 * NetGuard Scam Investigation Engine
 *
 * Analyses user-submitted messages for scam indicators, classifies the
 * scam type, computes a 0–100 risk score, extracts evidence, and generates
 * actionable recommendations.  Entirely local — no external API calls.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ScamType =
  | "Banking Scam"
  | "UPI / Payment Scam"
  | "OTP Scam"
  | "Phishing"
  | "Job Scam"
  | "Investment Scam"
  | "Romance Scam"
  | "Delivery / Courier Scam"
  | "KYC Scam"
  | "Government Impersonation"
  | "Tech Support Scam"
  | "Social Media Account Scam"
  | "Lottery / Prize Scam"
  | "Loan Scam"
  | "Cryptocurrency Scam"
  | "Unknown";

export type RiskBand =
  | "Critical Risk"
  | "High Risk"
  | "Suspicious"
  | "Low Risk"
  | "Very Low Risk";

export type FlagSeverity = "critical" | "high" | "medium" | "low";

export interface RedFlag {
  label: string;
  explanation: string;
  evidence: string;
  severity: FlagSeverity;
  /** Educational "Why is this dangerous?" text */
  education: string;
}

export interface ExtractedEntities {
  phoneNumbers: string[];
  emails: string[];
  urls: string[];
  amounts: string[];
  organizations: string[];
  urgencyPhrases: string[];
  personalInfoRequested: string[];
}

export interface InvestigationResult {
  riskScore: number;
  riskBand: RiskBand;
  scamType: ScamType;
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  redFlags: RedFlag[];
  entities: ExtractedEntities;
  recommendations: string[];
  safeReply: string | null;
  exposureActions: Record<string, string[]>;
}

/* ------------------------------------------------------------------ */
/* Detection rules                                                     */
/* ------------------------------------------------------------------ */

interface Rule {
  pattern: RegExp;
  label: string;
  explanation: string;
  education: string;
  severity: FlagSeverity;
  weight: number;
}

const RULES: Rule[] = [
  // --- Urgency ---
  {
    pattern: /\b(immediately|urgent|right now|within \d+ hours?|act (now|fast|quickly)|hurry|last chance|don'?t delay|time.?sensitive|expires? (today|soon)|respond (now|immediately)|asap)\b/gi,
    label: "Urgency pressure",
    explanation: "The message pressures you to act immediately without thinking.",
    education: "Scammers create artificial urgency so victims don't have time to verify the request. Legitimate organisations give reasonable deadlines.",
    severity: "high",
    weight: 15,
  },
  // --- Threats ---
  {
    pattern: /\b(account (will be|is) (blocked|suspended|frozen|disabled|closed)|legal action|police (case|action)|arrest|penalty|fine|prosecut|court (case|summon)|consequences)\b/gi,
    label: "Threat / intimidation",
    explanation: "The message threatens negative consequences to create fear.",
    education: "Scammers use threats to panic victims into compliance. Real banks and government agencies never threaten immediate arrest or account closure via text.",
    severity: "high",
    weight: 18,
  },
  // --- OTP request ---
  {
    pattern: /\b(otp|one.?time (password|code|pin)|verification code|share (the |your )?(code|otp|pin)|confirm (the )?(otp|code))\b/gi,
    label: "OTP / verification code request",
    explanation: "The message asks you to share a verification code or OTP.",
    education: "Legitimate organisations never ask you to share OTPs. OTPs are the final security barrier — sharing them gives full account access to the scammer.",
    severity: "critical",
    weight: 30,
  },
  // --- Password / PIN request ---
  {
    pattern: /\b(password|passwd|pin (code|number)?|cvv|card (number|details)|security (code|answer|question)|account (number|details)|login (details|credentials))\b/gi,
    label: "Sensitive credential request",
    explanation: "The message requests passwords, PINs, card numbers, or login credentials.",
    education: "No legitimate service will ever ask for your password, PIN, or full card number through a message. This is a direct attempt to steal your credentials.",
    severity: "critical",
    weight: 28,
  },
  // --- Money request ---
  {
    pattern: /\b(send (me |us )?money|transfer (funds|money|₹|\$|rs\.?)|pay(ment)? (now|immediately|urgent)|deposit (₹|\$|rs\.?|amount)|wire transfer|recharge|top.?up)\b/gi,
    label: "Payment / money request",
    explanation: "The sender is requesting money or a financial transfer.",
    education: "Unsolicited requests for money are a core scam tactic. Once sent, money transfers are nearly impossible to reverse. Always verify the recipient independently.",
    severity: "critical",
    weight: 25,
  },
  // --- Lottery / prize ---
  {
    pattern: /\b(you (have )?won|congratulations|prize|lottery|lucky (draw|winner)|selected (as|for)|reward (of|points)|claim (your |the )?(prize|reward|amount|money))\b/gi,
    label: "Lottery / prize claim",
    explanation: "The message claims you've won a prize or been selected for a reward.",
    education: "You cannot win a lottery you never entered. 'Congratulations, you've won' messages are among the oldest and most common scams worldwide.",
    severity: "high",
    weight: 22,
  },
  // --- Investment / returns ---
  {
    pattern: /\b(guaranteed returns?|high (returns?|profit|income)|invest (now|today)|double your (money|investment)|passive income|\d+% (returns?|profit|per (day|month|week))|trading (tips|signals)|stock (tips|calls))\b/gi,
    label: "Investment promise",
    explanation: "The message promises unusually high or guaranteed investment returns.",
    education: "No legitimate investment guarantees returns. 'Double your money' schemes and high-return promises are hallmarks of Ponzi and investment fraud.",
    severity: "high",
    weight: 20,
  },
  // --- Job offer ---
  {
    pattern: /\b(job (offer|opportunity|opening|vacancy)|hiring (now|immediately)|work from home|earn (₹|\$|rs\.?)?\s*\d+.*(per (day|hour|week)|daily|monthly)|part.?time (job|work|earning)|no experience (needed|required)|data entry (job|work))\b/gi,
    label: "Suspicious job offer",
    explanation: "The message contains indicators of a fake job or employment scam.",
    education: "Fake job scams lure victims with high pay for minimal work, then demand registration fees, training costs, or personal documents. Real employers never charge you to get a job.",
    severity: "high",
    weight: 18,
  },
  // --- KYC / verification ---
  {
    pattern: /\b(kyc|know your customer|update (your )?(kyc|account|details|information|pan|aadhaar)|verify (your )?(account|identity|kyc|pan|aadhaar)|re.?kyc|pan (card )?(update|verify|link))\b/gi,
    label: "KYC / account update request",
    explanation: "The message asks you to update or verify KYC, PAN, or account details.",
    education: "KYC update scams impersonate banks and government services. They direct victims to phishing sites that harvest credentials. Always update KYC through the official app/branch only.",
    severity: "high",
    weight: 20,
  },
  // --- Government impersonation ---
  {
    pattern: /\b(income tax (department|office|refund|notice)|gst (refund|notice|department)|customs (department|duty|fee)|election commission|government (of india|scheme|grant)|pm(mod|kisan)|rbi|(central )?reserve bank)\b/gi,
    label: "Government impersonation",
    explanation: "The message impersonates a government agency or authority.",
    education: "Government agencies do not contact individuals about refunds, fines, or grants via WhatsApp/SMS/email. They use official letters and verified portals.",
    severity: "high",
    weight: 22,
  },
  // --- Delivery / courier ---
  {
    pattern: /\b(parcel|package|delivery|shipment|courier|tracking (number|id|link)|customs (fee|duty|charge)|held (at|by) (customs|courier|warehouse))\b/gi,
    label: "Delivery / courier scam indicator",
    explanation: "The message references a package, delivery, or customs fee.",
    education: "Courier scams claim your package is held and demand a fee to release it. Legitimate courier companies do not ask for payments via WhatsApp or SMS links.",
    severity: "medium",
    weight: 14,
  },
  // --- Tech support ---
  {
    pattern: /\b(tech(ical)? support|virus (detected|found|alert)|malware (detected|found)|device (is )?(infected|compromised|hacked)|remote (access|desktop|control)|anydesk|teamviewer)\b/gi,
    label: "Tech support impersonation",
    explanation: "The message claims your device has a problem and offers remote 'support'.",
    education: "Tech support scammers create fake alerts to gain remote access to your device. Microsoft, Google, and Apple never contact you about virus issues via unsolicited messages.",
    severity: "high",
    weight: 20,
  },
  // --- Romance / emotional ---
  {
    pattern: /\b(dear (friend|sir|madam|lover)|i (love|miss|need) you|send (me )?(nude|photos?|pictures?|selfie)|come (on )?camera|video call|meet (in person|privately)|relationship|soulmate)\b/gi,
    label: "Romance / emotional manipulation",
    explanation: "The message uses romantic or emotional language typical of romance scams.",
    education: "Romance scammers build emotional attachment over time, then exploit trust to request money. Be cautious of strangers who quickly express strong feelings online.",
    severity: "medium",
    weight: 14,
  },
  // --- Crypto ---
  {
    pattern: /\b(crypto|bitcoin|ethereum|usdt|binance|coinbase|wallet (address|transfer)|token (sale|launch)|nft (drop|mint|invest)|defi|blockchain (invest|mining))\b/gi,
    label: "Cryptocurrency reference",
    explanation: "The message references cryptocurrency, wallets, or blockchain investments.",
    education: "Crypto scams use technical jargon and fake platforms to appear legitimate. Once crypto is sent, it cannot be reversed. Be extremely cautious of unsolicited crypto messages.",
    severity: "medium",
    weight: 14,
  },
  // --- Suspicious links ---
  {
    pattern: /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|shorturl|cutt\.ly|rb\.gy)\b/gi,
    label: "Shortened / hidden URL",
    explanation: "The message contains a shortened link that hides the real destination.",
    education: "Shortened URLs conceal where a link actually leads. Scammers use them to direct victims to phishing pages. Never click shortened links from unknown senders.",
    severity: "medium",
    weight: 10,
  },
  {
    pattern: /https?:\/\/[^\s]*\.(xyz|top|click|icu|buzz|rest|monster|cam|tk|ml|ga|cf)\b/gi,
    label: "Suspicious domain extension",
    explanation: "The link uses a domain extension commonly associated with scam sites.",
    education: "While any domain can host legitimate content, extensions like .xyz, .top, .click, and free-country TLDs (.tk, .ml, .ga, .cf) are disproportionately used for phishing.",
    severity: "medium",
    weight: 12,
  },
  // --- Suspicious link patterns ---
  {
    pattern: /https?:\/\/[^\s]*(bank|secure|verify|update|login|account|confirm)[^\s]*\.(?!com\b|org\b|in\b|gov\b)[a-z]{2,}/gi,
    label: "Phishing-style URL",
    explanation: "The URL contains banking/verification keywords on a suspicious domain.",
    education: "Phishing sites use URLs that mimic real bank or service addresses. Always check the exact domain and look for the official website independently.",
    severity: "high",
    weight: 18,
  },
  // --- Personal info request ---
  {
    pattern: /\b(full name|date of birth|dob|aadhaar (number|card|id)|pan (number|card|id)|passport (number|details)|social security|ssn|mother'?s? (name|maiden))\b/gi,
    label: "Personal identity information request",
    explanation: "The message requests sensitive personal identity information.",
    education: "Aadhaar, PAN, passport, and date of birth are used for identity theft. With this information, scammers can open accounts, take loans, or commit fraud in your name.",
    severity: "high",
    weight: 20,
  },
  // --- Impersonation of known entities ---
  {
    pattern: /\b(sbi|hdfc|icici|axis (bank)?|kotak|yes bank|indusind|bob|pnb|canara|union bank|indian (bank|overseas)|bank of (baroda|india|maharashtra))\b/gi,
    label: "Bank name reference",
    explanation: "The message references a specific bank — possibly impersonating it.",
    education: "Scammers impersonate well-known banks to appear legitimate. Always verify by calling the bank's official helpline (found on their website, not in the message).",
    severity: "medium",
    weight: 10,
  },
  {
    pattern: /\b(paytm|phonepe|gpay|google pay|bhim|upi (id|payment|transfer)|@paytm|@ybl|@oksbi|@okhdfc|@okaxis)\b/gi,
    label: "Payment platform reference",
    explanation: "The message references a payment platform (UPI, Paytm, etc.).",
    education: "Scammers misuse UPI IDs and payment app names to request money or send fraudulent 'collect requests'. Never approve a UPI collect request from an unknown sender.",
    severity: "medium",
    weight: 10,
  },
];

/* ------------------------------------------------------------------ */
/* Scam type classification                                            */
/* ------------------------------------------------------------------ */

interface TypePattern {
  type: ScamType;
  keywords: RegExp;
}

const TYPE_PATTERNS: TypePattern[] = [
  { type: "OTP Scam", keywords: /\b(otp|one.?time (password|code)|verification code|share (code|otp))\b/i },
  { type: "Banking Scam", keywords: /\b(bank|sbi|hdfc|icici|axis|account (blocked|suspended|frozen|update)|net banking|debit|credit card|atm)\b/i },
  { type: "UPI / Payment Scam", keywords: /\b(upi|paytm|phonepe|gpay|google pay|bhim|payment (request|link|failed)|collect request|qr (code|scan)|scan (and|&) pay)\b/i },
  { type: "KYC Scam", keywords: /\b(kyc|re.?kyc|update kyc|pan (update|verify|link)|aadhaar (update|verify|link))\b/i },
  { type: "Job Scam", keywords: /\b(job (offer|opportunity|opening)|hiring|work from home|part.?time (job|work|earn)|data entry (job|work)|no experience|salary (of|up to))\b/i },
  { type: "Investment Scam", keywords: /\b(invest|returns?|profit|stock|trading|mutual fund|portfolio|share market|forex|commodity)\b/i },
  { type: "Cryptocurrency Scam", keywords: /\b(crypto|bitcoin|ethereum|usdt|binance|coinbase|wallet|token|nft|defi|blockchain)\b/i },
  { type: "Loan Scam", keywords: /\b(loan (offer|approved|application|disburs)|emi|interest rate|credit (score|history)|processing fee|pre.?approved loan)\b/i },
  { type: "Lottery / Prize Scam", keywords: /\b(won|winner|lottery|prize|lucky|draw|reward|selected|congratulations|claim)\b/i },
  { type: "Delivery / Courier Scam", keywords: /\b(parcel|package|delivery|courier|shipment|tracking|customs (fee|duty|charge)|held (at|by) customs)\b/i },
  { type: "Government Impersonation", keywords: /\b(income tax|gst|customs department|election commission|rbi|reserve bank|government|pm(mod|kisan))\b/i },
  { type: "Tech Support Scam", keywords: /\b(tech support|virus|malware|infected|remote (access|desktop)|anydesk|teamviewer|microsoft (support|team))\b/i },
  { type: "Romance Scam", keywords: /\b(love|dear|relationship|boyfriend|girlfriend|meet (up|in person)|video call|send (nude|photo|pic))\b/i },
  { type: "Social Media Account Scam", keywords: /\b(account (hacked|disabled|verify|recover)|instagram|facebook|whatsapp (account|banned|verify)|login (attempt|alert))\b/i },
  { type: "Phishing", keywords: /\b(click (here|this|below|the link)|link (below|above|here)|verify (your )?(account|identity)|update (your )?(info|details|account)|confirm (your )?(identity|account)|login (page|portal|here))\b/i },
];

/* ------------------------------------------------------------------ */
/* Entity extraction                                                   */
/* ------------------------------------------------------------------ */

const ENTITY_PATTERNS = {
  phoneNumbers: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{2,5}\b/g,
  emails: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  urls: /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi,
  amounts: /(?:₹|rs\.?|\$|usd|inr)\s?\d[\d,]*(?:\.\d{2})?/gi,
  urgencyPhrases: /\b(immediately|urgent|right now|within \d+ hours?|act (now|fast)|hurry|last chance|don'?t delay|asap|expires? (today|soon))\b/gi,
};

const ORG_PATTERNS = /\b(sbi|hdfc|icici|axis|kotak|pnb|bob|canara|yes bank|rbi|paytm|phonepe|google pay|amazon|flipkart|india post|speed post|income tax|gst|election commission|microsoft|apple|google|facebook|instagram|whatsapp|telegram)\b/gi;

const PERSONAL_INFO_KEYWORDS = /\b(aadhaar|pan (card|number)?|passport|date of birth|dob|ssn|social security|mother'?s? name|account number|card number|cvv|pin|password|otp)\b/gi;

/* ------------------------------------------------------------------ */
/* Recommendations by scam type                                        */
/* ------------------------------------------------------------------ */

const BASE_RECOMMENDATIONS = [
  "Do not click any links in the message.",
  "Do not share personal information, OTPs, or passwords.",
  "Do not reply to the sender.",
  "Block and report the sender on the platform.",
  "Save a screenshot of the message as evidence.",
];

const TYPE_RECOMMENDATIONS: Partial<Record<ScamType, string[]>> = {
  "Banking Scam": [
    "Do NOT click any link or call any number in the message.",
    "Open your bank's official app or visit the branch directly.",
    "Call your bank's official helpline to verify the message.",
    "If you clicked a link, change your net banking password immediately.",
    "If you shared credentials, inform your bank to freeze the account.",
  ],
  "UPI / Payment Scam": [
    "Do NOT approve any UPI collect request or scan any QR code.",
    "Do NOT enter your UPI PIN on any page linked from the message.",
    "Check your UPI transaction history for unauthorized transactions.",
    "If money was sent, contact your UPI app's support immediately.",
    "Report the UPI ID/number to your payment app.",
  ],
  "OTP Scam": [
    "NEVER share an OTP with anyone — no legitimate service asks for it.",
    "If you already shared an OTP, immediately change your account password.",
    "Check for unauthorized transactions on linked accounts.",
    "Contact the service provider through their official channel.",
  ],
  "Phishing": [
    "Do NOT click the link or download any attachment.",
    "Verify by navigating directly to the organisation's official website.",
    "If you entered credentials on a linked page, change your password now.",
    "Report the phishing URL to your email/messaging platform.",
  ],
  "Job Scam": [
    "Do NOT pay any registration fee, training fee, or security deposit.",
    "Do NOT share your PAN, Aadhaar, or bank details.",
    "Verify the company on LinkedIn, Glassdoor, or their official website.",
    "Real employers never charge candidates to start work.",
    "Report the job posting on the platform where you received it.",
  ],
  "Investment Scam": [
    "Do NOT transfer any money or invest through the offered platform.",
    "Verify the investment scheme with SEBI (Securities and Exchange Board).",
    "Check if the advisor/platform is SEBI-registered.",
    "If you already invested, try to withdraw immediately.",
    "Report the scheme to your local cybercrime cell.",
  ],
  "Cryptocurrency Scam": [
    "Do NOT send any cryptocurrency to the provided wallet address.",
    "Do NOT connect your wallet to any linked platform.",
    "If you sent crypto, the transaction is irreversible — report immediately.",
    "Verify any exchange or token through official crypto regulatory sources.",
  ],
  "Romance Scam": [
    "Do NOT send money or share intimate photos/videos.",
    "Reverse-image-search their profile photos.",
    "Do not share personal or financial details.",
    "If you sent money, report to your bank and cybercrime cell.",
  ],
  "Delivery / Courier Scam": [
    "Do NOT click the tracking link or pay any customs/delivery fee.",
    "Track your package only through the official courier's website/app.",
    "If you paid a fee, contact your bank to dispute the transaction.",
  ],
  "KYC Scam": [
    "Do NOT click the KYC update link.",
    "Update KYC only through the official bank app or branch.",
    "Banks do not send KYC update links via SMS or WhatsApp.",
    "If you entered details, change your banking passwords immediately.",
  ],
  "Government Impersonation": [
    "Government agencies do NOT contact you via WhatsApp/SMS for fines or refunds.",
    "Visit the official government portal directly to check any claim.",
    "Report the impersonation to the concerned department.",
  ],
  "Tech Support Scam": [
    "Do NOT install any software or grant remote access.",
    "Do NOT allow anyone to control your device remotely.",
    "If you already granted access, disconnect immediately and scan for malware.",
    "Change all passwords from a different, clean device.",
  ],
  "Lottery / Prize Scam": [
    "You cannot win a lottery you did not enter.",
    "Do NOT pay any 'processing fee' or 'tax' to claim a prize.",
    "Do NOT share your bank details to 'receive' winnings.",
  ],
  "Loan Scam": [
    "Do NOT pay any processing fee or advance payment for a loan.",
    "Legitimate lenders do not ask for upfront fees via message.",
    "Verify the lender's RBI registration number independently.",
  ],
  "Social Media Account Scam": [
    "Do NOT click the 'verify' or 'recover' link in the message.",
    "Access your account settings directly through the official app/website.",
    "Enable two-factor authentication on your social media accounts.",
  ],
};

/* ------------------------------------------------------------------ */
/* Exposure action plans                                               */
/* ------------------------------------------------------------------ */

const EXPOSURE_ACTIONS: Record<string, string[]> = {
  "I haven't responded": [
    "Good — you haven't exposed yourself yet.",
    "Block the sender immediately.",
    "Report the message on the platform.",
    "Do not engage or reply — even to confront the scammer.",
  ],
  "I clicked the link": [
    "Do NOT enter any information on the page the link opened.",
    "Clear your browser cache and cookies for that site.",
    "Run a malware scan on your device.",
    "If you entered credentials, change those passwords immediately from a different device.",
    "Monitor your accounts for suspicious activity.",
  ],
  "I shared information": [
    "Change all passwords for accounts that use the shared information.",
    "Contact your bank to flag your accounts for fraud monitoring.",
    "If you shared Aadhaar/PAN, file a complaint with the issuing authority.",
    "Enable two-factor authentication on all critical accounts.",
    "Report to the National Cybercrime Helpline: 1930 (India).",
  ],
  "I sent money": [
    "URGENT: Contact your bank/payment provider immediately.",
    "Request a transaction reversal or chargeback.",
    "File a complaint at cybercrime.gov.in or call 1930.",
    "Provide: transaction ID, recipient details, time, and screenshots.",
    "Do NOT send more money — scammers often demand 'fees' to 'release' previous payments.",
    "Preserve all evidence (screenshots, receipts, chat history).",
  ],
  "I shared an OTP / password": [
    "URGENT: Change the password immediately from a trusted device.",
    "Contact the service provider to lock the account.",
    "Check for unauthorized transactions or changes.",
    "Revoke active sessions on the affected account.",
    "If banking credentials were shared, call your bank to freeze the account.",
    "Report to cybercrime.gov.in or call 1930.",
  ],
};

/* ------------------------------------------------------------------ */
/* Sample investigations                                               */
/* ------------------------------------------------------------------ */

export const SAMPLE_INVESTIGATIONS: {
  emoji: string;
  label: string;
  text: string;
}[] = [
  {
    emoji: "📱",
    label: "WhatsApp bank message",
    text: "Dear Customer, your SBI account will be BLOCKED today if you don't update your KYC. Click here immediately to verify: http://sbi-kyc-update.xyz/verify. Do it within 2 hours to avoid penalty. — SBI Customer Care",
  },
  {
    emoji: "💼",
    label: "Job offer",
    text: "Congratulations! You have been selected for a part-time data entry job. Work from home, earn Rs. 5000 per day. No experience needed. Send your Aadhaar card and Rs. 2500 registration fee to start immediately. Contact: +91-9876543210",
  },
  {
    emoji: "🏦",
    label: "Banking alert",
    text: "ALERT: Your HDFC debit card was used for a transaction of Rs. 48,500 at 3:42 PM. If this was not you, call our 24x7 helpline immediately: 1800-XXX-XXXX. Share your OTP to block the card and reverse the transaction.",
  },
  {
    emoji: "💰",
    label: "Investment opportunity",
    text: "Exclusive investment opportunity: Guaranteed 30% returns per month with zero risk. Invest Rs. 10,000 today and get Rs. 13,000 in 30 days. Limited slots available. Transfer to UPI: investpro@paytm. Act now before slots fill up!",
  },
  {
    emoji: "📦",
    label: "Delivery message",
    text: "Your parcel from Amazon is held at customs. Pay customs duty of Rs. 2,499 to release the package. Click to pay: http://amzn-delivery.tk/pay?id=8734. If not paid within 24 hours, the parcel will be returned.",
  },
  {
    emoji: "🔗",
    label: "Suspicious URL",
    text: "Your Instagram account has been flagged for a policy violation. Verify your identity within 48 hours or your account will be permanently disabled. Click here to verify: http://instagram-verify.click/account",
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function extractEntities(text: string): ExtractedEntities {
  const extract = (p: RegExp) => [...new Set((text.match(p) ?? []).map((m) => m.trim()))];
  return {
    phoneNumbers: extract(ENTITY_PATTERNS.phoneNumbers).filter((p) => p.length >= 7),
    emails: extract(ENTITY_PATTERNS.emails),
    urls: extract(ENTITY_PATTERNS.urls),
    amounts: extract(ENTITY_PATTERNS.amounts),
    organizations: extract(ORG_PATTERNS),
    urgencyPhrases: extract(ENTITY_PATTERNS.urgencyPhrases),
    personalInfoRequested: extract(PERSONAL_INFO_KEYWORDS),
  };
}

function classifyScamType(text: string, redFlags: RedFlag[]): ScamType {
  const scores: Partial<Record<ScamType, number>> = {};
  for (const { type, keywords } of TYPE_PATTERNS) {
    const matches = text.match(keywords);
    if (matches) scores[type] = (scores[type] ?? 0) + matches.length;
  }
  let best: ScamType = "Unknown";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if ((score as number) > bestScore) {
      bestScore = score as number;
      best = type as ScamType;
    }
  }
  if (best === "Unknown" && redFlags.length > 0) return "Phishing";
  return best;
}

function getRiskBand(score: number): RiskBand {
  if (score >= 81) return "Critical Risk";
  if (score >= 61) return "High Risk";
  if (score >= 41) return "Suspicious";
  if (score >= 21) return "Low Risk";
  return "Very Low Risk";
}

function getConfidence(
  flagCount: number,
  score: number,
): { level: "High" | "Medium" | "Low"; reason: string } {
  if (flagCount >= 4 && score >= 60)
    return { level: "High", reason: "Multiple strong scam indicators detected with high confidence." };
  if (flagCount >= 2 && score >= 35)
    return { level: "Medium", reason: "Several scam indicators found, but some indicators are ambiguous." };
  if (flagCount >= 1)
    return { level: "Low", reason: "Limited indicators detected. The message may still be a scam — stay cautious." };
  return { level: "Low", reason: "No strong scam indicators found. This assessment has low confidence." };
}

function buildSafeReply(scamType: ScamType, score: number): string | null {
  if (score < 30) return null;

  const typeReplies: Partial<Record<ScamType, string>> = {
    "Banking Scam":
      "I don't share account information, OTPs, or passwords through messages. I will contact my bank directly through their official app or branch.",
    "UPI / Payment Scam":
      "I will not approve any payment request or scan any QR code from an unsolicited message. I will verify through my payment app directly.",
    "OTP Scam":
      "I don't share verification codes or OTPs with anyone. I will contact the organisation directly through their official channel.",
    Phishing:
      "I don't click links or verify accounts through unsolicited messages. I will navigate directly to the official website to check.",
    "Job Scam":
      "I don't pay fees to start a job. I will verify this opportunity through the company's official careers page and LinkedIn.",
    "Investment Scam":
      "I don't invest through unsolicited messages. I will consult a SEBI-registered advisor before making any investment decisions.",
    "KYC Scam":
      "I will update my KYC only through the official bank app or by visiting the branch. I don't use links sent via messages.",
    "Delivery / Courier Scam":
      "I will track my package only through the official courier website or app. I don't pay fees through links sent in messages.",
    "Lottery / Prize Scam":
      "I did not enter any lottery and I don't pay fees to claim prizes. This is not legitimate.",
    "Government Impersonation":
      "Government agencies don't contact me via personal messages. I will verify through the official government portal.",
    "Tech Support Scam":
      "I will not install software or grant remote access based on an unsolicited message. I will contact the company's official support.",
    "Romance Scam":
      "I don't share personal information or money with people I've only met online.",
    "Cryptocurrency Scam":
      "I don't send cryptocurrency based on unsolicited messages. I will only use verified, regulated exchanges.",
    "Loan Scam":
      "I don't pay advance fees for loans. I will apply through verified banks or NBFCs only.",
    "Social Media Account Scam":
      "I will access my account settings directly through the official app, not through links in messages.",
  };

  return typeReplies[scamType] ??
    "I don't share personal information or click links from unsolicited messages. I will verify through official channels.";
}

/* ------------------------------------------------------------------ */
/* Main investigation function                                         */
/* ------------------------------------------------------------------ */

export function investigateMessage(text: string): InvestigationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      riskScore: 0,
      riskBand: "Very Low Risk",
      scamType: "Unknown",
      confidence: "Low",
      confidenceReason: "No content to analyse.",
      redFlags: [],
      entities: {
        phoneNumbers: [],
        emails: [],
        urls: [],
        amounts: [],
        organizations: [],
        urgencyPhrases: [],
        personalInfoRequested: [],
      },
      recommendations: BASE_RECOMMENDATIONS,
      safeReply: null,
      exposureActions: EXPOSURE_ACTIONS,
    };
  }

  // 1. Run detection rules
  const redFlags: RedFlag[] = [];
  let rawScore = 0;

  for (const rule of RULES) {
    const matches = trimmed.match(rule.pattern);
    if (!matches) continue;
    // De-duplicate: take first match as evidence
    const uniqueMatches = [...new Set(matches.map((m) => m.trim()))];
    redFlags.push({
      label: rule.label,
      explanation: rule.explanation,
      evidence: uniqueMatches.slice(0, 2).join(", "),
      severity: rule.severity,
      education: rule.education,
    });
    rawScore += rule.weight;
  }

  // Cap at 100
  const riskScore = Math.min(100, rawScore);
  const riskBand = getRiskBand(riskScore);

  // 2. Classify scam type
  const scamType = classifyScamType(trimmed, redFlags);

  // 3. Confidence
  const conf = getConfidence(redFlags.length, riskScore);

  // 4. Entities
  const entities = extractEntities(trimmed);

  // 5. Recommendations
  const recommendations = TYPE_RECOMMENDATIONS[scamType] ?? BASE_RECOMMENDATIONS;

  // 6. Safe reply
  const safeReply = buildSafeReply(scamType, riskScore);

  return {
    riskScore,
    riskBand,
    scamType,
    confidence: conf.level,
    confidenceReason: conf.reason,
    redFlags,
    entities,
    recommendations,
    safeReply,
    exposureActions: EXPOSURE_ACTIONS,
  };
}
