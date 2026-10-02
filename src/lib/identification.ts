// Evidence-based identification engine.
//
// Turns the raw FACTS collected by /api/link-meta, /api/geo-reverse, the QR
// classifier and the security checks into a structured identification:
//   WHAT is it / WHO is it associated with / WHERE / WHAT does it do,
// each with an explicit confidence level and the evidence behind it.
//
// Golden rule: an organisation or place name is ONLY ever shown when it came
// from concrete evidence (the site's own structured data, its published name,
// a verified reverse-geocode, or a parsed QR field). When evidence is missing
// we say "could not be verified" — we never guess.

import type { Dict } from "@/lib/i18n/types";
import { interpolate } from "@/lib/i18n/lookups";
import type { QrScanResult } from "@/lib/qrScanner";

export interface LinkMetaFacts {
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
  org?: { name: string; type: string; locality: string | null; region: string | null } | null;
  geo?: { placename?: string | null; lat?: string | null; lng?: string | null } | null;
  blocked?: boolean;
  reason?: string;
}

export interface GeoReverseFacts {
  ok: boolean;
  name?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
}

export type Confidence = "high" | "medium" | "low" | "unknown";
export type RiskLevel4 = "low" | "medium" | "high" | "unknown";

export interface Identification {
  whatType: string;
  orgName: string | null;
  orgSelfDeclared: boolean; // true when the "name" is written by the QR creator (payee/vCard)
  location: string | null;
  purpose: string;
  evidence: string[];
  sources: string[];
  cannotVerify: string[];
  idConfidence: Confidence;
  risk: RiskLevel4;
  riskConfidence: Confidence;
  recommendation: string;
  techDetails: string[];
}

export interface BuildInput {
  qr?: QrScanResult | null;
  meta?: LinkMetaFacts | null;
  geoReverse?: GeoReverseFacts | null;
  linkVerdict?: "Safe" | "Suspicious" | "Likely fraud" | null;
  sbThreatCount?: number;
  sbConfigured?: boolean;
  effectiveAssessment?: string | null;
}

function confidenceLabel(c: Confidence, t: Dict): string {
  const id = t.ident;
  if (c === "high") return id.confHigh;
  if (c === "medium") return id.confMedium;
  if (c === "low") return id.confLow;
  return id.confUnknown;
}

export function riskLabel(r: RiskLevel4, t: Dict): string {
  const id = t.ident;
  if (r === "high") return id.riskHigh;
  if (r === "medium") return id.riskMedium;
  if (r === "low") return id.riskLow;
  return id.riskUnknown;
}

export function formatConfidence(c: Confidence, t: Dict): string {
  return confidenceLabel(c, t);
}

export function buildIdentification(input: BuildInput, t: Dict): Identification {
  const id = t.ident;
  const qr = input.qr ?? null;
  const meta = input.meta ?? null;
  const evidence: string[] = [];
  const sources: string[] = [];
  const cannotVerify: string[] = [];
  const techDetails: string[] = [];

  // ── What type is it? ──
  const typeMeta: Record<string, { label: string; purpose: string }> = {
    url: { label: id.typeUrl, purpose: id.purposeForUrl },
    upi: { label: id.typeUpi, purpose: id.purposeForUpi },
    vcard: { label: id.typeVcard, purpose: id.purposeForVcard },
    phone: { label: id.typePhone, purpose: id.purposeForPhone },
    wifi: { label: id.typeWifi, purpose: id.purposeForWifi },
    geo: { label: id.typeGeo, purpose: id.purposeForGeo },
    email: { label: id.typeEmail, purpose: id.purposeForEmail },
    app: { label: id.typeApp, purpose: id.purposeForApp },
    text: { label: id.typeText, purpose: id.purposeForText },
    encoded: { label: id.typeEncoded, purpose: id.purposeForEncoded },
  };
  const contentType = qr?.contentType ?? "url";
  const tm = typeMeta[contentType] ?? typeMeta.url;
  const whatType = tm.label;
  const purpose = tm.purpose;

  // ── QR-level evidence ──
  if (qr) {
    evidence.push(id.evDecoded);
    if (qr.hiddenLink) evidence.push(id.evHiddenDecoded);
  }

  let orgName: string | null = null;
  let orgSelfDeclared = false;
  let location: string | null = null;
  let idConfidence: Confidence = "unknown";

  // ── Type-specific identification ──
  if (contentType === "url" || contentType === "app") {
    if (meta && meta.ok) {
      sources.push(id.srcWebpage);
      if (meta.domain) {
        sources.push(id.srcDomain);
        evidence.push(interpolate(id.evDomain, { domain: meta.domain }));
      }
      if (meta.isHttps) evidence.push(id.evHttps);
      if (meta.org?.name) {
        orgName = meta.org.name;
        evidence.push(interpolate(id.evOrgJsonLd, { name: meta.org.name }));
        const place = [meta.org.locality, meta.org.region].filter(Boolean).join(", ");
        if (place) {
          location = place;
          evidence.push(interpolate(id.evOrgLocation, { place }));
        }
      }
      if (meta.siteName) {
        evidence.push(interpolate(id.evSiteName, { name: meta.siteName }));
        if (!orgName) orgName = meta.siteName;
      }
      if (meta.title) evidence.push(interpolate(id.evTitle, { title: meta.title }));
      if (meta.description) evidence.push(interpolate(id.evDescription, {}));
      if (meta.geo?.placename) {
        evidence.push(interpolate(id.evGeoMeta, { place: meta.geo.placename }));
        if (!location) location = meta.geo.placename;
      }
      if (meta.redirectHops && meta.redirectHops.length > 1) {
        evidence.push(interpolate(id.evRedirectChain, { count: String(meta.redirectHops.length) }));
        if (meta.passedThroughShortener) evidence.push(id.evViaShortener);
      }
      // Confidence from corroboration
      const score = (meta.org?.name ? 3 : 0) + (meta.siteName ? 2 : 0) + (meta.title ? 1 : 0);
      if (score >= 3 && meta.isHttps && !meta.suspiciousRedirect) idConfidence = "high";
      else if (score >= 2) idConfidence = "medium";
      else if (score >= 1) idConfidence = "low";
      else {
        idConfidence = "low";
        cannotVerify.push(id.evNoOrgEvidence);
      }
      // A name taken only from page-declared metadata (og:site_name) is the
      // site telling us what it calls ITSELF — not independently verified
      // evidence. Cap confidence and flag it, per the never-guess rule.
      if (orgName && !meta.org?.name && meta.siteName && orgName === meta.siteName) {
        orgSelfDeclared = true;
        if (idConfidence === "high") idConfidence = "medium";
      }
      if (meta.suspiciousRedirect) cannotVerify.push(id.cannotRedirect);
      techDetails.push(...(meta.redirectHops ?? []).map((h, i) => `Hop ${i + 1}: ${h}`));
    } else {
      cannotVerify.push(id.cannotSeeInside);
      if (meta?.domain) evidence.push(interpolate(id.evDomain, { domain: meta.domain }));
      // App-store deep links: even when the page isn't fetched, the store URL
      // itself tells us the app type — that much IS identified, so "low".
      idConfidence = meta?.domain || contentType === "app" ? "low" : "unknown";
    }
    if (!orgName) cannotVerify.push(id.cannotOrg);
  } else if (contentType === "upi" && qr?.upi) {
    if (qr.upi.payeeName) {
      orgName = qr.upi.payeeName;
      orgSelfDeclared = true;
      evidence.push(interpolate(id.evUpiPayee, { name: qr.upi.payeeName }));
    }
    if (qr.upi.payeeAddress) {
      evidence.push(interpolate(id.evUpiVpa, { vpa: qr.upi.payeeAddress }));
      idConfidence = qr.upi.payeeName ? "medium" : "low";
    } else {
      idConfidence = "low";
    }
    cannotVerify.push(id.cannotUpi);
  } else if (contentType === "vcard" && qr?.vcard) {
    if (qr.vcard.fullName) {
      orgName = qr.vcard.fullName;
      orgSelfDeclared = true;
      evidence.push(interpolate(id.evVcardName, { name: qr.vcard.fullName }));
    }
    if (qr.vcard.org) evidence.push(interpolate(id.evVcardOrg, { org: qr.vcard.org }));
    idConfidence = qr.vcard.fullName ? "medium" : "low";
    cannotVerify.push(id.cannotVcard);
  } else if (contentType === "wifi" && qr?.wifi) {
    if (qr.wifi.ssid) {
      evidence.push(interpolate(id.evWifiSsid, { ssid: qr.wifi.ssid }));
      idConfidence = "medium";
    } else idConfidence = "low";
    cannotVerify.push(id.cannotWifi);
  } else if (contentType === "geo" && qr?.geo) {
    sources.push(id.srcGeo);
    evidence.push(interpolate(id.evCoords, { lat: qr.geo.lat.toFixed(5), lng: qr.geo.lng.toFixed(5) }));
    const gr = input.geoReverse;
    if (gr?.ok && gr.address) {
      location = gr.address;
      evidence.push(interpolate(id.evGeoReversed, { place: gr.address }));
      if (qr.geo.label) {
        const l1 = qr.geo.label.toLowerCase();
        const l2 = gr.address.toLowerCase();
        if (l2.includes(l1) || l1.includes((gr.name ?? "\u0000").toLowerCase())) {
          evidence.push(id.evGeoLabelMatch);
          idConfidence = "high";
        } else {
          cannotVerify.push(interpolate(id.cannotGeoMismatch, { label: qr.geo.label }));
          idConfidence = "medium";
        }
      } else {
        idConfidence = "medium";
      }
    } else {
      idConfidence = "low";
      cannotVerify.push(id.cannotGeo);
    }
  } else if (contentType === "email" && qr?.email) {
    evidence.push(interpolate(id.evEmail, { address: qr.email.address }));
    idConfidence = "low";
    cannotVerify.push(id.cannotEmail);
  } else if (contentType === "phone") {
    if (qr?.phone) evidence.push(interpolate(id.evPhone, { phone: qr.phone }));
    idConfidence = "low";
    cannotVerify.push(id.cannotPhone);
  } else if (contentType === "text") {
    idConfidence = qr?.decodedText ? "low" : "unknown";
    cannotVerify.push(id.cannotText);
  } else {
    // encoded / unknown
    cannotVerify.push(id.cannotEncoded);
    idConfidence = "unknown";
  }

  // ── Risk (separate from identification confidence) ──
  let risk: RiskLevel4 = "unknown";
  const assessment = input.effectiveAssessment ?? "";
  if (
    input.linkVerdict === "Likely fraud" ||
    assessment === "High Risk" ||
    (input.sbThreatCount ?? 0) > 0
  ) {
    risk = "high";
  } else if (
    input.linkVerdict === "Suspicious" ||
    assessment === "Suspicious" ||
    (meta && (meta.suspiciousRedirect || !meta.isHttps || meta.adult)) ||
    qr?.hiddenLink
  ) {
    risk = "medium";
  } else if (
    (input.linkVerdict === "Safe" && contentType === "url") ||
    assessment === "Safe" ||
    assessment === "Low Risk" ||
    (contentType === "url" && meta?.ok && meta.isHttps)
  ) {
    risk = "low";
  }

  let riskConfidence: Confidence;
  if (input.sbConfigured && input.sbThreatCount !== undefined) riskConfidence = "high";
  else if (input.linkVerdict || assessment) riskConfidence = "medium";
  else riskConfidence = "low";
  if (risk === "unknown") riskConfidence = "unknown";

  // ── Recommendation ──
  let recommendation: string;
  if (risk === "high") recommendation = id.recDontUse;
  else if (contentType === "upi") recommendation = id.recUpi;
  else if (contentType === "wifi") recommendation = id.recWifi;
  else if (contentType === "geo") recommendation = id.recGeo;
  else if (contentType === "vcard" || contentType === "email" || contentType === "phone") recommendation = id.recContact;
  else if (contentType === "encoded" || contentType === "text") recommendation = id.recUnknown;
  else if (risk === "medium") recommendation = id.recCareful;
  else if (risk === "low") recommendation = id.recOk;
  else recommendation = id.recUnknown;

  if (qr?.hiddenLink) cannotVerify.push(id.cannotHidden);

  return {
    whatType,
    orgName,
    orgSelfDeclared,
    location,
    purpose,
    evidence,
    sources,
    cannotVerify,
    idConfidence,
    risk,
    riskConfidence,
    recommendation,
    techDetails,
  };
}
