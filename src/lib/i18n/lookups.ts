import type { CombinedFlag, TipKey } from "@/lib/linkCheck";
import type { QrScanResult, UpiCautionSignal } from "@/lib/qrScanner";
import type { Dict } from "./types";

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export function translateVerdict(verdict: string, t: Dict): string {
  if (verdict === "Likely fraud") return t.lib.likelyFraud;
  if (verdict === "Suspicious") return t.lib.suspicious;
  return t.lib.safe;
}

export function translateCategory(tipKey: TipKey | string, t: Dict): string {
  switch (tipKey) {
    case "personal-info":
      return t.lib.personalInfo;
    case "bullying":
      return t.lib.bullying;
    case "suspicious-link":
      return t.lib.suspiciousLink;
    case "scam":
      return t.lib.possibleScam;
    default:
      return t.lib.linkAnalysis;
  }
}

export function translateFlagExplanation(flag: CombinedFlag, t: Dict): string {
  switch (flag.tipKey) {
    case "url-ip":
      return t.lib.expUrlIp;
    case "url-at-symbol":
      return t.lib.expUrlAt;
    case "url-tld":
      return t.lib.expUrlTld;
    case "url-shortener":
      return t.lib.expUrlShortener;
    case "url-subdomain":
      return t.lib.expUrlSubdomain;
    case "url-impersonation":
      return t.lib.expUrlImpersonation;
    case "personal-info": {
      const exp = flag.explanation.toLowerCase();
      if (exp.includes("email")) return t.lib.expEmail;
      if (exp.includes("address") || exp.includes("home")) return t.lib.expAddress;
      return t.lib.expPhone;
    }
    case "bullying":
      return t.lib.expBullying;
    case "suspicious-link": {
      const exp = flag.explanation.toLowerCase();
      if (exp.includes("unusual")) return t.lib.expUnusual;
      return t.lib.expShortener;
    }
    case "scam":
      return t.lib.expFreeMoney;
    default:
      return flag.explanation;
  }
}

const TIP_KEYS: Record<string, string[]> = {
  "personal-info": ["tipPersonalInfo1", "tipPersonalInfo2"],
  bullying: ["tipBullying1", "tipBullying2"],
  "suspicious-link": ["tipSuspiciousLink1", "tipSuspiciousLink2"],
  scam: ["tipScam1", "tipScam2", "tipScam3"],
  "url-ip": ["tipUrlIp1", "tipUrlIp2"],
  "url-at-symbol": ["tipUrlAt1", "tipUrlAt2"],
  "url-tld": ["tipUrlTld1", "tipUrlTld2"],
  "url-shortener": ["tipUrlShortener1", "tipUrlShortener2"],
  "url-subdomain": ["tipUrlSubdomain1", "tipUrlSubdomain2"],
  "url-impersonation": ["tipUrlImpersonation1", "tipUrlImpersonation2"],
};

export function translateTips(flags: CombinedFlag[], t: Dict): string[] {
  if (flags.length === 0) {
    return [t.lib.emptyTip1, t.lib.emptyTip2];
  }
  const tips: string[] = [];
  for (const flag of flags) {
    const keys = TIP_KEYS[flag.tipKey] ?? [];
    for (const key of keys) {
      const tip = t.lib[key];
      if (typeof tip === "string" && !tips.includes(tip)) tips.push(tip);
      if (tips.length >= 3) return tips;
    }
  }
  if (tips.length === 0) return [t.lib.tipDefault1, t.lib.tipDefault2];
  return tips;
}

export function qrTypeLabel(type: string, t: Dict): string {
  const map: Record<string, string> = {
    url: t.qrScanner.typeUrl,
    upi: t.qrScanner.typeUpi,
    vcard: t.qrScanner.typeVcard,
    phone: t.qrScanner.typePhone,
    wifi: t.qrScanner.typeWifi,
    text: t.qrScanner.typeText,
    encoded: t.qrScanner.typeEncoded,
  };
  return map[type] ?? type;
}

export function qrHistoryTypeLabel(type: string, t: Dict): string {
  const map: Record<string, string> = {
    url: t.qrScanner.historyUrl,
    upi: t.qrScanner.historyUpi,
    vcard: t.qrScanner.historyVcard,
    phone: t.qrScanner.historyPhone,
    wifi: t.qrScanner.historyWifi,
    text: t.qrScanner.historyText,
    encoded: t.qrScanner.typeEncoded,
  };
  return map[type] ?? type;
}

export function qrAssessmentLabel(assessment: string, t: Dict): string {
  const map: Record<string, string> = {
    Safe: t.qrScanner.assessSafe,
    "Low Risk": t.qrScanner.assessLowRisk,
    Suspicious: t.qrScanner.assessSuspicious,
    "High Risk": t.qrScanner.assessHighRisk,
    "Unable to Determine": t.qrScanner.assessUnable,
  };
  return map[assessment] ?? assessment;
}

function isShortenedUrl(url: string): boolean {
  const shorteners = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
    "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at",
    "rb.gy", "bl.ink", "lnkd.in",
  ];
  try {
    const hostname = new URL(url).hostname;
    return shorteners.some((s) => hostname === s || hostname.endsWith("." + s));
  } catch {
    return false;
  }
}

export function qrDescription(r: QrScanResult, t: Dict): string {
  const q = t.qrScanner;
  switch (r.contentType) {
    case "url": {
      let desc = r.hiddenLink ? q.descHiddenLink : "";
      desc += q.descUrl;
      if (r.url) {
        try {
          desc += interpolate(q.descUrlHost, { host: new URL(r.url).hostname });
        } catch {
          /* ignore */
        }
        if (isShortenedUrl(r.url)) desc += q.descUrlShort;
      }
      return desc;
    }
    case "upi": {
      let desc = r.hiddenLink ? q.descHiddenLink : "";
      desc += q.descUpi;
      if (r.upi?.payeeName) desc += interpolate(q.descUpiName, { name: r.upi.payeeName });
      if (r.upi?.amount) {
        const amount = `${r.upi.currency === "INR" ? "₹" : r.upi.currency ? `${r.upi.currency} ` : ""}${r.upi.amount}`;
        desc += interpolate(q.descUpiAmount, { amount });
      }
      return desc + q.descUpiEnd;
    }
    case "vcard": {
      let desc = q.descVcard;
      if (r.vcard?.fullName) desc += interpolate(q.descVcardName, { name: r.vcard.fullName });
      return desc + q.descVcardEnd;
    }
    case "phone":
      return interpolate(q.descPhone, { phone: r.phone ?? "" });
    case "wifi": {
      let desc = q.descWifi;
      if (r.wifi?.ssid) desc += interpolate(q.descWifiSsid, { ssid: r.wifi.ssid });
      return desc + q.descWifiEnd;
    }
    case "encoded":
      return q.descEncoded;
    default:
      if (r.decodedText) {
        const preview = r.decodedText.length > 100 ? r.decodedText.slice(0, 100) + "..." : r.decodedText;
        return interpolate(q.descTextDecoded, { text: preview });
      }
      return q.descText;
  }
}

export function qrCautions(cautions: UpiCautionSignal[], t: Dict): UpiCautionSignal[] {
  const q = t.qrScanner;
  return cautions.map((c) => {
    if (c.label.startsWith("No payee address")) {
      return { label: q.cautionNoPa, reason: q.cautionNoPaReason };
    }
    if (c.label.startsWith("No payee name")) {
      return { label: q.cautionNoPn, reason: q.cautionNoPnReason };
    }
    if (c.label.startsWith("Malformed VPA")) {
      return { label: q.cautionMalformed, reason: q.cautionMalformedReason };
    }
    if (c.label.startsWith("Unrecognized VPA")) {
      return { label: q.cautionUnknownDomain, reason: q.cautionUnknownDomainReason };
    }
    if (c.label.startsWith("Numeric VPA")) {
      return { label: q.cautionNumeric, reason: q.cautionNumericReason };
    }
    if (c.label.startsWith("Very short VPA")) {
      return { label: q.cautionShort, reason: q.cautionShortReason };
    }
    if (c.label.startsWith("Amount set")) {
      return { label: q.cautionZero, reason: q.cautionZeroReason };
    }
    return c;
  });
}

export function qrReasons(
  r: QrScanResult,
  t: Dict,
  linkFlags?: CombinedFlag[],
): string[] {
  const q = t.qrScanner;
  const reasons: string[] = [];

  switch (r.contentType) {
    case "url": {
      if (r.securityAssessment === "High Risk") reasons.push(q.reasonLcFraud);
      else if (r.securityAssessment === "Suspicious") reasons.push(q.reasonLcSuspicious);
      else if (r.securityAssessment === "Safe") reasons.push(q.reasonLcSafe);
      else reasons.push(q.reasonUrlUnable);
      if (r.hiddenLink) reasons.push(q.reasonHiddenLink);
      if (linkFlags) {
        for (const flag of linkFlags) {
          reasons.push(`${translateCategory(flag.tipKey, t)}: ${translateFlagExplanation(flag, t)}`);
        }
      }
      return reasons;
    }
    case "upi": {
      if (r.upiCautions.length === 0) {
        return [q.reasonUpiNone, q.reasonUpiVerify];
      }
      return qrCautions(r.upiCautions, t).map((c) => `${c.label}: ${c.reason}`);
    }
    case "vcard":
      return [q.reasonVcard1, q.reasonVcard2];
    case "phone":
      return [q.reasonPhone];
    case "wifi": {
      const list = [q.reasonWifi1];
      if (r.wifi?.password) list.push(q.reasonWifi2);
      return list;
    }
    case "encoded":
      return [q.reasonEncoded, q.reasonEncoded2];
    default:
      if (r.securityAssessment === "Suspicious") return [q.reasonText, q.reasonTextScam];
      return [q.reasonText];
  }
}

export function translateScamType(type: string, t: Dict): string {
  return t.scamChatbot.types?.[type] ?? type;
}

export function translateRiskBand(band: string, t: Dict): string {
  return t.scamChatbot.bands?.[band] ?? band;
}

export function translateConfidence(level: string, t: Dict): string {
  if (level === "High") return t.scamChatbot.confHigh;
  if (level === "Medium") return t.scamChatbot.confMedium;
  return t.scamChatbot.confLow;
}

export function translateConfidenceReason(reason: string, t: Dict): string {
  const map = t.scamChatbot.confReasons ?? {};
  if (reason.includes("Multiple strong")) return map.multiple ?? reason;
  if (reason.includes("Several scam")) return map.several ?? reason;
  if (reason.includes("Limited indicators")) return map.limited ?? reason;
  if (reason.includes("No strong")) return map.none ?? reason;
  if (reason.includes("No content")) return map.empty ?? reason;
  return reason;
}

export function translateFlagCopy(
  label: string,
  t: Dict,
): { label: string; explanation?: string; education?: string } {
  const mapped = t.scamChatbot.flagMap?.[label];
  return mapped ?? { label };
}

export function translateHeatmapLabel(
  value: string,
  map: Record<string, string> | undefined,
): string {
  return map?.[value] ?? value;
}
