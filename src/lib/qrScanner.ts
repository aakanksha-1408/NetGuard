// QR Code Scam Scanner — content-type classifier, UPI parser, vCard parser
// Decoded QR content is classified as URL / UPI / vCard / phone / text.
// For URLs: the component calls runLinkCheck() from linkCheck.ts — no duplicate scanning.

export type QrContentType = "url" | "upi" | "vcard" | "phone" | "wifi" | "geo" | "email" | "app" | "text" | "encoded";

export interface UpiField {
  /** Payee VPA (pa) — e.g. "merchant@bank" */
  payeeAddress: string | null;
  /** Payee name (pn) */
  payeeName: string | null;
  /** Amount (am) */
  amount: string | null;
  /** Currency (cu) */
  currency: string | null;
  /** Transaction note (tn) */
  transactionNote: string | null;
  /** Merchant code (mc) */
  merchantCode: string | null;
  /** Transaction ID (tid) */
  transactionId: string | null;
}

export interface UpiCautionSignal {
  label: string;
  reason: string;
}

export interface WifiData {
  ssid: string | null;
  password: string | null;
  encryption: string | null;
  hidden: boolean;
}

export interface VCardData {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  org: string | null;
  raw: string;
}

export interface GeoData {
  lat: number;
  lng: number;
  /** Optional place label embedded in the geo: URI (self-declared!) */
  label: string | null;
}

export interface EmailData {
  address: string;
  subject: string | null;
  body: string | null;
}

export interface QrScanResult {
  contentType: QrContentType;
  /** The raw decoded string from the QR code */
  rawContent: string;
  /** UPI-specific parsed fields (only when contentType === "upi") */
  upi: UpiField | null;
  /** UPI caution signals — shown as "signals to check manually," not a verdict */
  upiCautions: UpiCautionSignal[];
  /** vCard parsed data (only when contentType === "vcard") */
  vcard: VCardData | null;
  /** Phone number (only when contentType === "phone") */
  phone: string | null;
  /** URL to pass to Link Checker (only when contentType === "url") */
  url: string | null;
  /** Wi-Fi parsed data (only when contentType === "wifi") */
  wifi: WifiData | null;
  /** Geo coordinates (only when contentType === "geo") */
  geo: GeoData | null;
  /** Email address (only when contentType === "email") */
  email: EmailData | null;
  /** Human-readable content-type label */
  contentTypeLabel: string;
  /** Human-readable description of what the QR code contains */
  description: string;
  /** Security assessment */
  securityAssessment: string;
  /** Reasons supporting the security assessment */
  assessmentReasons: string[];
  /** True when the real content was hidden inside encoded (scrambled) data */
  hiddenLink: boolean;
  /** Decoded readable text, when the encoded content turned out to be text */
  decodedText: string | null;
}

/* ── Content-type detection ──────────────────────────────────── */

const URL_REGEX = /^https?:\/\//i;
const UPI_REGEX = /^upi:\/\/pay\?/i;
const VCARD_REGEX = /^BEGIN:VCARD/i;
const PHONE_REGEX = /^(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}$/;
const WIFI_REGEX = /^WIFI:/i;
const BASE64_REGEX = /^[A-Za-z0-9+/]{16,}={0,2}$/;
const GEO_REGEX = /^geo:/i;
const MAILTO_REGEX = /^mailto:/i;
const TEL_REGEX = /^tel:/i;
const APP_SCHEME_REGEX = /^(intent:\/\/|market:\/\/|itms-apps:\/\/|https?:\/\/(play\.google\.com|apps\.apple\.com)\/)/i;

function detectContentType(raw: string): QrContentType {
  const trimmed = raw.trim();
  if (UPI_REGEX.test(trimmed)) return "upi";
  if (WIFI_REGEX.test(trimmed)) return "wifi";
  if (GEO_REGEX.test(trimmed)) return "geo";
  if (MAILTO_REGEX.test(trimmed)) return "email";
  if (APP_SCHEME_REGEX.test(trimmed)) return "app";
  if (URL_REGEX.test(trimmed)) return "url";
  if (VCARD_REGEX.test(trimmed)) return "vcard";
  if (TEL_REGEX.test(trimmed) || PHONE_REGEX.test(trimmed.replace(/^tel:/i, ""))) return "phone";
  if (isEncodedData(trimmed)) return "encoded";
  return "text";
}

function contentTypeLabel(type: QrContentType): string {
  switch (type) {
    case "url": return "URL (web link)";
    case "upi": return "UPI Payment Request";
    case "vcard": return "vCard (contact card)";
    case "phone": return "Phone Number";
    case "wifi": return "Wi-Fi Network";
    case "geo": return "Location (map)";
    case "email": return "Email Address";
    case "app": return "App Link";
    case "text": return "Plain Text";
    case "encoded": return "Encoded Data";
  }
}

/* ── Geo / email parsing ──────────────────────────────────── */

function parseGeo(raw: string): GeoData | null {
  // geo:lat,lng[,accuracy][?q=label]  or  geo:lat,lng?q=...
  const m = raw.trim().match(/^geo:([^?]+)(\?(.*))?$/i);
  if (!m) return null;
  const parts = m[1].split(",");
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  let label: string | null = null;
  try {
    const params = new URLSearchParams(m[3] ?? "");
    label = params.get("q") || params.get("query") || null;
    if (label) label = decodeURIComponent(label.replace(/\+/g, " "));
  } catch { /* ignore query parsing */ }
  return { lat, lng, label };
}

function parseEmail(raw: string): EmailData | null {
  const m = raw.trim().match(/^mailto:([^?]+)(\?(.*))?$/i);
  if (!m) return null;
  const address = decodeURIComponent(m[1]).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return null;
  const params = new URLSearchParams(m[3] ?? "");
  const subject = params.get("subject");
  const body = params.get("body");
  return { address, subject, body };
}

/* ── UPI parsing ─────────────────────────────────────────────── */

function parseUpi(raw: string): { fields: UpiField; cautions: UpiCautionSignal[] } {
  const params = new URLSearchParams(raw.replace(/^upi:\/\/pay\?/i, ""));

  const fields: UpiField = {
    payeeAddress: params.get("pa") ?? null,
    payeeName: params.get("pn") ?? null,
    amount: params.get("am") ?? null,
    currency: params.get("cu") ?? null,
    transactionNote: params.get("tn") ?? null,
    merchantCode: params.get("mc") ?? null,
    transactionId: params.get("tid") ?? null,
  };

  const cautions = evaluateUpiCautions(fields);
  return { fields, cautions };
}

/**
 * Known UPI PSP / bank domain suffixes.
 * This list is not exhaustive — it covers major Indian banks and payment
 * providers. A VPA not matching these is not necessarily fake; it is
 * simply flagged for manual verification.
 */
const KNOWN_UPI_DOMAINS = [
  // Banks
  "ybl", "ibl", "axl", "okhdfcbank", "okicici", "okaxis", "oksbi",
  "paytm", "apl", "dbs", "kotak", "fbl", "citi", "hsdb", "sbi",
  "hdfcbank", "icici", "axisbank", "rbl", "yesbank", "idbi",
  "indus", "federal", "kbl", "sib", "cub", "jkb", "kvb",
  "andb", "vijb", "cnrb", "pnb", "boi", "bob", "ubi",
  // Payment apps
  "gpay", "googlepay", "phonepe", "bhim", "amazonpay", "mobikwik",
  "freecharge", "airtel", "jiopayments", "whatsapp",
  // Other PSP handles
  "razorpay", "instamojo", "payu", "ccavenue", "billdesk",
];

function evaluateUpiCautions(fields: UpiField): UpiCautionSignal[] {
  const cautions: UpiCautionSignal[] = [];

  // 1. Missing payee address
  if (!fields.payeeAddress) {
    cautions.push({
      label: "No payee address (pa)",
      reason: "A valid UPI payment request should include a payee VPA address. Without it, the payment may not be directed to anyone specific.",
    });
    return cautions; // Cannot analyze further without VPA
  }

  // 2. Missing payee name
  if (!fields.payeeName || fields.payeeName.trim() === "") {
    cautions.push({
      label: "No payee name (pn)",
      reason: "The payee name field is missing. Legitimate merchants and known contacts usually include a display name so you can verify who you are paying.",
    });
  }

  // 3. Check VPA domain against known PSP/bank patterns
  const vpaParts = fields.payeeAddress.split("@");
  if (vpaParts.length !== 2 || !vpaParts[1]) {
    cautions.push({
      label: "Malformed VPA format",
      reason: `The payee address "${fields.payeeAddress}" does not follow the standard username@bank format. Verify the address before making any payment.`,
    });
  } else {
    const domain = vpaParts[1].toLowerCase();
    const isKnown = KNOWN_UPI_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
    if (!isKnown) {
      cautions.push({
        label: "Unrecognized VPA domain",
        reason: `The domain "@${domain}" is not in the list of commonly known bank or PSP handles. This does not mean it is fake — many smaller banks and wallets exist — but verify it matches the intended recipient's bank.`,
      });
    }
  }

  // 4. Generic / random-looking username part
  if (vpaParts.length === 2 && vpaParts[0]) {
    const username = vpaParts[0].toLowerCase();
    // Check if it's purely numeric and long (could be auto-generated)
    if (/^\d{8,}$/.test(username)) {
      cautions.push({
        label: "Numeric VPA username",
        reason: `The VPA username "${username}" is purely numeric. While some legitimate services use numeric VPAs, this can also indicate an auto-generated or temporary address. Verify the recipient.`,
      });
    }
    // Check for very short (1-2 char) usernames
    if (username.length <= 2) {
      cautions.push({
        label: "Very short VPA username",
        reason: `The VPA username "${username}" is unusually short. Verify this matches the intended recipient.`,
      });
    }
  }

  // 5. Amount set to 0 or very large
  if (fields.amount) {
    const amt = parseFloat(fields.amount);
    if (amt === 0) {
      cautions.push({
        label: "Amount set to ₹0",
        reason: "The payment amount is set to zero. This might be a test QR or a request that will ask you to enter the amount manually.",
      });
    }
  }

  return cautions;
}

/* ── vCard parsing ───────────────────────────────────────────── */

function parseVCard(raw: string): VCardData {
  const lines = raw.split(/\r?\n/);
  let fullName: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  let org: string | null = null;

  for (const line of lines) {
    if (/^FN:/i.test(line)) fullName = line.replace(/^FN:/i, "").trim();
    else if (/^TEL/i.test(line) && !phone) phone = line.replace(/^TEL[^:]*:/i, "").trim();
    else if (/^EMAIL/i.test(line) && !email) email = line.replace(/^EMAIL[^:]*:/i, "").trim();
    else if (/^ORG:/i.test(line)) org = line.replace(/^ORG:/i, "").trim();
  }

  return { fullName, phone, email, org, raw };
}

/* ── Wi-Fi parsing ─────────────────────────────────────────── */

function parseWifi(raw: string): WifiData {
  const ssidMatch = raw.match(/S:([^;]*)/);
  const passMatch = raw.match(/P:([^;]*)/);
  const encMatch = raw.match(/T:([^;]*)/);
  const hiddenMatch = raw.match(/H:([^;]*)/);

  return {
    ssid: ssidMatch?.[1] || null,
    password: passMatch?.[1] || null,
    encryption: encMatch?.[1] || null,
    hidden: hiddenMatch?.[1]?.toUpperCase() === "TRUE",
  };
}

/* ── Encoded data detection ────────────────────────────────── */

function isEncodedData(raw: string): boolean {
  if (raw.length < 16) return false;
  if (BASE64_REGEX.test(raw)) return true;
  if (/^[0-9a-fA-F]{32,}$/.test(raw)) return true;
  const hasSpaces = /\s/.test(raw);
  const hasVowels = (raw.match(/[aeiouAEIOU]/g) || []).length;
  if (!hasSpaces && hasVowels < 2 && raw.length >= 20) return true;
  return false;
}

/* ── Encoded-content decoding (base64 / hex) ──────────────
 * "Encoded data" QR codes are a dead end for users unless we actually
 * try to decode them. Scammers hide links in base64 to dodge scanners,
 * so a successful decode is re-analyzed as its real type. Genuinely
 * encrypted (binary) payloads stay unreadable — we explain that in
 * plain words instead of shrugging. */

function decodeBase64(raw: string): Uint8Array | null {
  try {
    let s = raw.replace(/\s+/g, "");
    while (s.length % 4 !== 0) s += "=";
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function decodeHex(raw: string): Uint8Array | null {
  const s = raw.replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0) return null;
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Decode bytes to text only when the result is genuinely readable. */
function bytesToReadableText(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
  if (!text) return null;
  let junk = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127 || c === 0xfffd) junk++;
  }
  // More than ~15% control/replacement characters → it's binary, not text
  if (junk / text.length > 0.15) return null;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tryDecodeEncoded(raw: string): { value: string } | { byteLength: number } | null {
  const bytes = BASE64_REGEX.test(raw)
    ? decodeBase64(raw)
    : /^[0-9a-fA-F]{32,}$/.test(raw.replace(/\s+/g, ""))
      ? decodeHex(raw)
      : null;
  if (!bytes) return null;
  const text = bytesToReadableText(bytes);
  if (text) return { value: text };
  return { byteLength: bytes.length };
}

/* ── Human-readable description ────────────────────────────── */

function decodedTypeLabelEN(type: QrContentType): string {
  switch (type) {
    case "url": return "a web link";
    case "upi": return "a UPI payment request";
    case "vcard": return "a contact card";
    case "wifi": return "Wi-Fi network settings";
    case "phone": return "a phone number";
    default: return "readable text";
  }
}

function generateDescription(result: QrScanResult): string {
  switch (result.contentType) {
    case "url": {
      const url = result.url!;
      let desc = "This QR code contains a website link.";
      try {
        const u = new URL(url);
        desc += ` It directs you to ${u.hostname}.`;
      } catch { /* ignore */ }
      if (isShortenedUrl(url)) {
        desc += " The link appears to be a shortened URL, so the final destination should be checked before opening it.";
      }
      return desc;
    }
    case "upi": {
      let desc = "This QR code contains UPI payment information";
      if (result.upi?.payeeName) desc += ` for a payment to "${result.upi.payeeName}"`;
      if (result.upi?.amount) desc += ` with an amount of ${result.upi.currency === "INR" ? "₹" : ""}${result.upi.amount}`;
      desc += ". Verify the recipient and payment details before making any transaction.";
      return desc;
    }
    case "vcard": {
      let desc = "This QR code contains contact information";
      if (result.vcard?.fullName) desc += ` for ${result.vcard.fullName}`;
      desc += " that can be used to save or communicate with the provided contact. Verify the details independently before saving.";
      return desc;
    }
    case "phone":
      return `This QR code contains a phone number (${result.phone}). No verification has been performed on this number — exercise caution before calling.`;
    case "wifi": {
      let desc = "This QR code contains Wi-Fi connection information.";
      if (result.wifi?.ssid) desc += ` The network name is "${result.wifi.ssid}".`;
      desc += " Scanning it may allow a device to connect to the specified network.";
      return desc;
    }
    case "geo": {
      if (result.geo) {
        let desc = `This QR code shows a location on the map at coordinates ${result.geo.lat.toFixed(5)}, ${result.geo.lng.toFixed(5)}.`;
        if (result.geo.label) {
          desc += ` The QR itself claims the place is "${result.geo.label}" — that label is self-declared (anyone can write anything), so NetGuard verifies it from the real coordinates.`;
        }
        return desc;
      }
      return "This QR code claims to contain a map location, but the coordinates are invalid.";
    }
    case "email": {
      let desc = `This QR code opens a new email addressed to "${result.email?.address}".`;
      if (result.email?.subject) desc += ` The pre-filled subject is "${result.email.subject}".`;
      desc += " Nothing is sent until you press Send.";
      return desc;
    }
    case "app":
      return "This QR code is a link that opens or installs a mobile app. Check the developer name on the store page before installing — scammers publish look-alike apps.";
    case "encoded": {
      const decoded = tryDecodeEncoded(result.rawContent);
      const size = decoded && "byteLength" in decoded ? ` about ${decoded.byteLength} bytes of` : "";
      return `This QR code holds a scrambled/locked code (${size ? size.trim() : "encrypted"} data) that cannot be read as text or a link by any tool. Banking, login and payment apps use codes like this as one-time tokens. If you were not expecting this QR code, do not use it — and never enter OTPs, passwords or payment details after scanning a code like this.`;
    }
    case "text": {
      const source = result.decodedText ?? result.rawContent;
      const preview = source.length > 100 ? source.slice(0, 100) + "..." : source;
      const prefix = result.decodedText ? "Decoded from the hidden (encoded) data, this QR code contains plain text: " : "This QR code contains plain text: ";
      return `${prefix}"${preview}"`;
    }
  }
}

function isShortenedUrl(url: string): boolean {
  const shorteners = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
    "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at",
    "rb.gy", "bl.ink", "lnkd.in",
  ];
  try {
    const hostname = new URL(url).hostname;
    return shorteners.some(s => hostname === s || hostname.endsWith("." + s));
  } catch {
    return false;
  }
}

/* ── Security assessment ───────────────────────────────────── */

function generateSecurityAssessment(
  result: QrScanResult,
  linkCheckResult: { verdict: string; flags: Array<{ category: string; explanation: string }> } | null,
): { assessment: string; reasons: string[] } {
  const reasons: string[] = [];

  switch (result.contentType) {
    case "url": {
      if (linkCheckResult) {
        if (linkCheckResult.verdict === "Likely fraud") {
          reasons.push("The Link Checker identified this URL as likely fraudulent.");
          for (const flag of linkCheckResult.flags) {
            reasons.push(`${flag.category}: ${flag.explanation}`);
          }
          return { assessment: "High Risk", reasons };
        }
        if (linkCheckResult.verdict === "Suspicious") {
          reasons.push("The Link Checker flagged this URL as suspicious.");
          for (const flag of linkCheckResult.flags) {
            reasons.push(`${flag.category}: ${flag.explanation}`);
          }
          if (result.hiddenLink) {
            reasons.push("The link was deliberately hidden inside encoded (scrambled) data instead of being given openly — a common trick to avoid detection.");
            return { assessment: "Suspicious", reasons };
          }
          return { assessment: "Suspicious", reasons };
        }
        if (result.hiddenLink) {
          // A clean URL that was intentionally concealed is still a red flag
          reasons.push("The Link Checker found no risk in the link itself, BUT the link was deliberately hidden inside encoded (scrambled) data — scammers do this to avoid detection.");
          return { assessment: "Suspicious", reasons };
        }
        reasons.push("The Link Checker found no significant risk indicators for this URL.");
        return { assessment: "Safe", reasons };
      }
      reasons.push("URL could not be fully analyzed.");
      if (result.hiddenLink) {
        reasons.push("The link was hidden inside encoded (scrambled) data — a common trick to avoid detection.");
        return { assessment: "Suspicious", reasons };
      }
      return { assessment: "Unable to Determine", reasons };
    }
    case "upi": {
      if (result.upiCautions.length === 0) {
        reasons.push("No obvious red flags were detected in the UPI payment fields.");
        reasons.push("This does not guarantee the payment is safe — always verify the recipient before sending money.");
        return { assessment: "Low Risk", reasons };
      }
      for (const c of result.upiCautions) {
        reasons.push(`${c.label}: ${c.reason}`);
      }
      if (result.upiCautions.length >= 3) return { assessment: "Suspicious", reasons };
      return { assessment: "Low Risk", reasons };
    }
    case "vcard": {
      reasons.push("The QR code contains contact information. No verification was performed on the details.");
      reasons.push("Verify the contact details independently before saving or reaching out.");
      return { assessment: "Unable to Determine", reasons };
    }
    case "phone": {
      reasons.push("A phone number was detected. No verification or risk analysis was performed on this number.");
      return { assessment: "Unable to Determine", reasons };
    }
    case "wifi": {
      reasons.push("The QR code contains Wi-Fi network credentials. The network safety cannot be verified.");
      if (result.wifi?.password) reasons.push("A password is included — ensure you trust the source before connecting.");
      return { assessment: "Low Risk", reasons };
    }
    case "geo": {
      if (result.geo) {
        reasons.push("This QR only shows a location on a map. It does not open a website or make a payment.");
        if (result.geo.label) reasons.push("The place name written in the QR is self-declared — it was verified separately from the actual coordinates (see identification above).");
        return { assessment: "Low Risk", reasons };
      }
      reasons.push("The QR claims to be a location but the coordinates are invalid — the QR may be corrupted or deliberately malformed.");
      return { assessment: "Unable to Determine", reasons };
    }
    case "email": {
      reasons.push(`This opens a pre-filled email to ${result.email?.address ?? "an address"}. Nothing is sent until you press Send.`);
      reasons.push("Be cautious about who asked you to scan this — pre-filled emails are sometimes used for phishing.");
      return { assessment: "Unable to Determine", reasons };
    }
    case "app": {
      reasons.push("This links to an app page. Installing apps from unknown sources can be risky — check the developer name and reviews before installing.");
      return { assessment: "Unable to Determine", reasons };
    }
    case "encoded": {
      reasons.push("This is a scrambled/locked code (encrypted data). No tool can read it as text or a link — it is usually a one-time token for a specific app.");
      reasons.push("If you were not expecting this QR code, do not use it. Never enter OTPs, passwords or payment details after scanning a code like this.");
      return { assessment: "Unable to Determine", reasons };
    }
    case "text": {
      reasons.push("The QR code contains plain text. No URL, payment, or known malicious pattern was detected.");
      const scamPhrases = ["free money", "winner", "congratulations", "urgent", "otp", "password", "bank"];
      const lower = (result.decodedText ?? result.rawContent).toLowerCase();
      const matches = scamPhrases.filter(p => lower.includes(p));
      if (matches.length > 0) {
        reasons.push(`However, the text contains words often associated with scams: ${matches.join(", ")}.`);
        return { assessment: "Suspicious", reasons };
      }
      return { assessment: "Unable to Determine", reasons };
    }
  }
}

/* ── Main entry point ────────────────────────────────────────── */

/**
 * Classify and parse the decoded content of a QR code.
 * Does NOT run any URL safety scanning — the component is responsible
 * for calling runLinkCheck() separately when contentType === "url".
 */
export function analyzeQrContent(
  rawContent: string,
  linkCheckResult?: { verdict: string; flags: Array<{ category: string; explanation: string }> } | null,
): QrScanResult {
  const trimmed = rawContent.trim();
  const contentType = detectContentType(trimmed);

  const result: QrScanResult = {
    contentType,
    rawContent: trimmed,
    upi: null,
    upiCautions: [],
    vcard: null,
    phone: null,
    url: null,
    wifi: null,
    geo: null,
    email: null,
    contentTypeLabel: contentTypeLabel(contentType),
    description: "",
    securityAssessment: "Unable to Determine",
    assessmentReasons: [],
    hiddenLink: false,
    decodedText: null,
  };

  // "Encoded" is only a label — try to actually decode base64/hex content.
  // If it turns out to hide a real link / payment request / text, analyze
  // the decoded value as its true type so the user gets a useful answer.
  if (contentType === "encoded") {
    const decoded = tryDecodeEncoded(trimmed);
    if (decoded && "value" in decoded) {
      const innerType = detectContentType(decoded.value);
      if (innerType !== "encoded") {
        const inner = analyzeQrContent(decoded.value, linkCheckResult ?? null);
        inner.rawContent = trimmed; // history/display still shows the original code
        inner.hiddenLink = innerType === "url" || innerType === "upi" || innerType === "vcard" || innerType === "wifi" || innerType === "phone";
        if (innerType === "text") inner.decodedText = decoded.value;
        const concealNote = inner.hiddenLink
          ? "⚠ The real content was deliberately hidden inside encoded (scrambled) data — a trick sometimes used to dodge scanners. "
          : "";
        inner.description = `${concealNote}Decoded content (${decodedTypeLabelEN(innerType)}): ${inner.description}`;
        return inner;
      }
    }
    // Unreadable / binary payload — stays "encoded" with a plain-words explanation
  }

  switch (contentType) {
    case "url":
      result.url = trimmed;
      break;
    case "app":
      // https store links can be inspected further; custom schemes cannot
      if (URL_REGEX.test(trimmed)) result.url = trimmed;
      break;
    case "geo": {
      const geo = parseGeo(trimmed);
      if (geo) {
        result.geo = geo;
      } else {
        result.contentType = "text";
        result.contentTypeLabel = contentTypeLabel("text");
      }
      break;
    }
    case "email": {
      const email = parseEmail(trimmed);
      if (email) {
        result.email = email;
      } else {
        result.contentType = "text";
        result.contentTypeLabel = contentTypeLabel("text");
      }
      break;
    }
    case "upi": {
      const { fields, cautions } = parseUpi(trimmed);
      result.upi = fields;
      result.upiCautions = cautions;
      break;
    }
    case "vcard":
      result.vcard = parseVCard(trimmed);
      break;
    case "phone":
      result.phone = trimmed;
      break;
    case "wifi":
      result.wifi = parseWifi(trimmed);
      break;
    case "encoded":
    case "text":
      break;
  }

  result.description = generateDescription(result);
  const assessment = generateSecurityAssessment(result, linkCheckResult ?? null);
  result.securityAssessment = assessment.assessment;
  result.assessmentReasons = assessment.reasons;

  return result;
}
