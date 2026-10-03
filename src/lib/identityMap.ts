/**
 * Digital Identity Map — analysis engine (pure functions only).
 *
 * Given the public profiles the user entered, plus the personal information
 * they saw publicly on each (name, location, email, phone, workplace/school,
 * birthday), we build a graph of three kinds of nodes:
 *
 *   HUB          — a single "You" node at the centre.
 *   PLATFORM     — one node per profile.
 *   SHARED-INFO  — one node per value that 2+ profiles show publicly
 *                  (username, name, location, email, phone, workplace/school
 *                  or birthday).
 *
 * Edges: the hub connects to every platform with a thin neutral line, and
 * each shared-info node connects to every platform showing that value.
 * Platform-to-platform edges are not drawn.
 *
 * Everything is based on *publicly visible, user-provided* data processed in
 * the browser. A shared value is a possible link, never proof two accounts
 * belong to the same person — name, location, workplace and birthday matches
 * are labelled as "matching public information".
 *
 * All user-visible sentences are generated through the `identityMap` i18n
 * dictionary (`im` params below) so findings/suggestions follow the selected
 * language; without a dictionary the English defaults are kept.
 */

import type { Dict } from "./i18n/types";
import { interpolate } from "./i18n/lookups";

type ImDict = Dict["identityMap"];

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type PlatformKey = "instagram" | "youtube" | "github" | "linkedin";

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  github: "GitHub",
  linkedin: "LinkedIn",
};

export interface IdentityProfile {
  platform: PlatformKey;
  url: string; // the public profile URL
  username: string; // extracted from the URL
  name?: string; // a name shown publicly on this profile
  location?: string; // a location shown publicly on this profile
  email?: string; // an email shown publicly on this profile
  phone?: string; // a phone number shown publicly on this profile
  workplace?: string; // a workplace or school shown publicly on this profile
  birthday?: string; // a birthday shown publicly on this profile
}

/** The kinds of shared public information we can detect. */
export type SharedType =
  | "same-username"
  | "same-name"
  | "same-location"
  | "same-email"
  | "same-phone"
  | "same-workplace"
  | "same-birthday";

export const SHARED_TYPES: SharedType[] = [
  "same-username",
  "same-name",
  "same-location",
  "same-email",
  "same-phone",
  "same-workplace",
  "same-birthday",
];

/** Short label used on pills and in the legend for each shared type. */
export const SHARED_LABELS: Record<SharedType, string> = {
  "same-username": "Username",
  "same-name": "Name",
  "same-location": "Location",
  "same-email": "Email",
  "same-phone": "Phone",
  "same-workplace": "Workplace",
  "same-birthday": "Birthday",
};

/** Maps a shared type to its key inside `identityMap.sharedLabels`. */
const SHARED_LABEL_KEY: Record<SharedType, string> = {
  "same-username": "username",
  "same-name": "name",
  "same-location": "location",
  "same-email": "email",
  "same-phone": "phone",
  "same-workplace": "workplace",
  "same-birthday": "birthday",
};

/** Translated versions of SHARED_LABELS for pills, legends and panel rows. */
export function localizedSharedLabels(im: ImDict): Record<SharedType, string> {
  const out = {} as Record<SharedType, string>;
  for (const type of SHARED_TYPES) out[type] = im.sharedLabels[SHARED_LABEL_KEY[type]] ?? SHARED_LABELS[type];
  return out;
}

/**
 * Types where a match is only "matching public information" — many people
 * share a city, a name or an employer. Phone/email/username matches are
 * stronger signals; birthday matches still get the public-information label.
 */
export const PUBLIC_INFO_TYPES: ReadonlySet<SharedType> = new Set([
  "same-name",
  "same-location",
  "same-workplace",
  "same-birthday",
]);

export interface PlatformNode {
  id: string; // == platform key
  platform: PlatformKey;
  label: string; // platform name
  username: string; // @handle ("" if none)
  profile: IdentityProfile;
}

export interface SharedNode {
  id: string; // "shared:<type>:<normalised value>"
  type: SharedType;
  value: string; // full display value as the user entered it (trimmed)
  members: string[]; // platform node ids that show this value
}

export interface IdentityFinding {
  type: SharedType;
  message: string; // plain-language sentence (phone/birthday masked)
  nodeIds: string[]; // platform ids involved
  publicInfoOnly: boolean; // true = "matching public information", not proof
}

export interface IdentitySuggestionLink {
  label: string;
  href: string;
}

export interface IdentitySuggestion {
  text: string;
  links: IdentitySuggestionLink[]; // privacy-settings pages of the platforms involved
}

export interface IdentityStats {
  platforms: number;
  byType: Record<SharedType, number>;
}

export type RiskLevel = "Low" | "Medium" | "High";

export interface IdentityAnalysis {
  hub: { id: string; label: string; sublabel: string };
  platforms: PlatformNode[];
  shared: SharedNode[];
  findings: IdentityFinding[];
  suggestions: IdentitySuggestion[];
  stats: IdentityStats;
  score: number; // 0..100 — higher = more exposed
  riskLevel: RiskLevel;
}

/* ------------------------------------------------------------------ */
/* Normalisation helpers                                              */
/* ------------------------------------------------------------------ */

function toParseableUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProto).toString();
  } catch {
    return null;
  }
}

/** Extract the public username / handle from a profile URL. */
export function extractUsername(platform: PlatformKey, url: string): string {
  const parsed = toParseableUrl(url);
  if (!parsed) return "";
  try {
    const u = new URL(parsed);
    const segments = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (segments.length === 0) return "";
    if (platform === "youtube") {
      const handle = segments.find((s) => s.startsWith("@"));
      if (handle) return handle.slice(1);
      return segments[segments.length - 1];
    }
    if (platform === "linkedin") {
      const inIdx = segments.indexOf("in");
      if (inIdx >= 0 && segments[inIdx + 1]) return segments[inIdx + 1];
      return segments[segments.length - 1];
    }
    return segments[segments.length - 1];
  } catch {
    return "";
  }
}

/** trim + lowercase + collapse spaces. */
function clean(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Remove punctuation (keeps letters, numbers and spaces). */
function stripPunct(s: string): string {
  return s.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

/** Digits only, keeping at most the last 10 digits. */
function phoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Normalise a raw value for comparison, per the rules of each type. */
export function normalizeShared(type: SharedType, raw: string): string {
  switch (type) {
    // Emails compare case-insensitively as a whole (punctuation is meaningful).
    case "same-email":
      return clean(raw);
    // Names ignore case and extra spaces, but keep hyphens/apostrophes.
    case "same-name":
      return clean(raw);
    // Phone numbers compare by digits only (last 10 digits).
    case "same-phone":
      return phoneDigits(raw);
    // Everything else: trim, lowercase, collapse spaces, strip punctuation.
    default:
      return stripPunct(clean(raw));
  }
}

/** "09876543210" style input -> "••••••3210". */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return `••••••${digits.slice(-4)}`;
}

/** Mask the day and month of a birthday, keeping the year when present. */
export function maskBirthday(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4})-\d{1,2}-\d{1,2}$/);
  if (iso) return `${iso[1]}-••-••`;
  const year = t.match(/\b(?:19|20)\d{2}\b/);
  return year ? "•• •• " + year[0] : "•• •• ••••";
}

/** The value as it should appear in the graph / report (phone & birthday masked). */
export function maskedSharedValue(node: SharedNode): string {
  if (node.type === "same-phone") return maskPhone(node.value);
  if (node.type === "same-birthday") return maskBirthday(node.value);
  return node.value;
}

/** Group platform ids by a key; return only groups with 2+ members. */
function groupsBy<T>(items: T[], keyOf: (t: T) => string, idOf: (t: T) => string) {
  const map = new Map<string, { ids: string[]; sample: T }>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const entry = map.get(key) ?? { ids: [], sample: item };
    entry.ids.push(idOf(item));
    map.set(key, entry);
  }
  return Array.from(map.entries()).filter(([, v]) => v.ids.length >= 2);
}

function joinNames(labels: string[], im?: ImDict): string {
  const unique = Array.from(new Set(labels));
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) {
    if (im) return interpolate(im.joinTwo, { a: unique[0], b: unique[1] });
    return `${unique[0]} and ${unique[1]}`;
  }
  if (im) return interpolate(im.joinMany, { list: unique.slice(0, -1).join(", "), last: unique[unique.length - 1] });
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/** Maps a shared type to its `identityMap.desc*` template key. */
const DESC_KEY: Record<SharedType, string> = {
  "same-username": "descUsername",
  "same-name": "descName",
  "same-location": "descLocation",
  "same-email": "descEmail",
  "same-phone": "descPhone",
  "same-workplace": "descWorkplace",
  "same-birthday": "descBirthday",
};

/**
 * One plain sentence per shared-info node, e.g.
 *   "Instagram and YouTube both show the name Rahul Sharma."
 * Phone and birthday values are masked unless `showFull` is true — full
 * values belong in the side panel only. When `im` (the identityMap i18n
 * dictionary) is passed, the sentence is built from its templates so it
 * follows the selected language.
 */
export function describeShared(
  node: SharedNode,
  labelOf: (id: string) => string,
  showFull = false,
  im?: ImDict
): string {
  const who = joinNames(node.members.map(labelOf), im);
  const value = showFull ? node.value : maskedSharedValue(node);
  if (im) {
    return interpolate(im[DESC_KEY[node.type]], {
      who,
      quant: node.members.length > 2 ? im.quantAll : im.quantBoth,
      value,
    });
  }
  const quantifier = node.members.length > 2 ? "all" : "both";
  if (node.type === "same-username") {
    return `${who} ${quantifier} use the same username @${value}.`;
  }
  if (node.type === "same-workplace") {
    return `${who} ${quantifier} show the workplace or school ${value}.`;
  }
  if (node.type === "same-birthday") {
    return `${who} ${quantifier} show the birthday ${value}.`;
  }
  return `${who} ${quantifier} show the ${SHARED_LABELS[node.type].toLowerCase()} ${value}.`;
}

/* ------------------------------------------------------------------ */
/* Scoring & suggestions configuration                                */
/* ------------------------------------------------------------------ */

/** Exposure weights by sensitivity — phone & birthday highest, username & location lower. */
const WEIGHT: Record<SharedType, number> = {
  "same-phone": 24,
  "same-birthday": 22,
  "same-email": 18,
  "same-workplace": 12,
  "same-name": 12,
  "same-username": 10,
  "same-location": 8,
};

/**
 * Types ordered most-sensitive first. Used both for the privacy suggestions and
 * for the per-platform "Connections" list, so the riskiest matches surface
 * first in every view.
 */
export const SENSITIVITY_ORDER: SharedType[] = [
  "same-phone",
  "same-birthday",
  "same-email",
  "same-workplace",
  "same-name",
  "same-location",
  "same-username",
];

const SUGGESTION_TEXT: Record<SharedType, string> = {
  "same-phone":
    "Hide your phone number — it is the quickest way to link your profiles. Remove it from every profile that shows it.",
  "same-birthday":
    "Hide your birthday. A public date of birth makes accounts easy to match across platforms.",
  "same-email":
    "Use a different public email per platform, or a contact form, instead of showing the same address everywhere.",
  "same-workplace":
    "Avoid showing the same workplace or school on every profile — keep it only where it is genuinely needed.",
  "same-name":
    "Consider using an initial or a variation of your name on profiles that don't need your full name.",
  "same-location":
    "A broad city is safer than a neighbourhood — decide whether each profile really needs a location.",
  "same-username":
    "Consider using different usernames on each platform so they are harder to link.",
};

/** Maps a shared type to its `identityMap.sug*` key. */
const SUGGESTION_KEY: Record<SharedType, string> = {
  "same-phone": "sugPhone",
  "same-birthday": "sugBirthday",
  "same-email": "sugEmail",
  "same-workplace": "sugWorkplace",
  "same-name": "sugName",
  "same-location": "sugLocation",
  "same-username": "sugUsername",
};

/** Official privacy / profile-settings pages, linked from the suggestions. */
export const PRIVACY_SETTINGS: Record<PlatformKey, IdentitySuggestionLink> = {
  instagram: {
    label: "Instagram privacy settings",
    href: "https://www.instagram.com/accounts/privacy_and_security/",
  },
  youtube: {
    label: "YouTube (Google) privacy settings",
    href: "https://myaccount.google.com/privacy",
  },
  github: {
    label: "GitHub profile settings",
    href: "https://github.com/settings/profile",
  },
  linkedin: {
    label: "LinkedIn visibility settings",
    href: "https://www.linkedin.com/psettings/visibility",
  },
};

/** PRIVACY_SETTINGS with link labels translated via the i18n dictionary. */
export function localizedPrivacySettings(im: ImDict): Record<PlatformKey, IdentitySuggestionLink> {
  const labelKey: Record<PlatformKey, string> = {
    instagram: "linkInstagram",
    youtube: "linkYoutube",
    github: "linkGithub",
    linkedin: "linkLinkedin",
  };
  const out = {} as Record<PlatformKey, IdentitySuggestionLink>;
  for (const key of Object.keys(PRIVACY_SETTINGS) as PlatformKey[]) {
    out[key] = { label: im[labelKey[key]] ?? PRIVACY_SETTINGS[key].label, href: PRIVACY_SETTINGS[key].href };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Main analysis                                                      */
/* ------------------------------------------------------------------ */

/** Which raw profile value feeds each shared type. */
const RAW_OF: Record<SharedType, (p: IdentityProfile) => string> = {
  "same-username": (p) => p.username,
  "same-name": (p) => p.name ?? "",
  "same-location": (p) => p.location ?? "",
  "same-email": (p) => p.email ?? "",
  "same-phone": (p) => p.phone ?? "",
  "same-workplace": (p) => p.workplace ?? "",
  "same-birthday": (p) => p.birthday ?? "",
};

export function analyzeIdentityMap(input: IdentityProfile[], im?: ImDict): IdentityAnalysis {
  // One platform node per profile that has a URL or username.
  const platforms: PlatformNode[] = input
    .filter((p) => (p.url?.trim() ?? "") || (p.username?.trim() ?? ""))
    .map((p) => ({
      id: p.platform,
      platform: p.platform,
      // Platform name follows the selected language when a dictionary is
      // passed (brand names are transliterated in hi/mr); English fallback.
      label: (im?.platforms?.[p.platform] as string | undefined) ?? PLATFORM_LABELS[p.platform],
      username: (p.username ?? "").trim(),
      profile: p,
    }));

  const labelOf = (id: string) => platforms.find((p) => p.id === id)?.label ?? id;

  // HUB: "You", subtitled with the most common shared username (if any).
  const usernameCounts = new Map<string, { count: number; display: string }>();
  for (const p of platforms) {
    const key = normalizeShared("same-username", p.username);
    if (!key) continue;
    const cur = usernameCounts.get(key);
    if (cur) cur.count += 1;
    else usernameCounts.set(key, { count: 1, display: p.username });
  }
  let hubSub = "";
  let bestCount = 0;
  for (const { count, display } of usernameCounts.values()) {
    if (count > bestCount) {
      bestCount = count;
      hubSub = `@${display}`;
    }
  }
  const hub = { id: "hub", label: im?.hubYou ?? "You", sublabel: bestCount >= 2 ? hubSub : "" };

  // SHARED-INFO nodes — one per value shown publicly by 2+ profiles.
  const shared: SharedNode[] = [];
  for (const type of SHARED_TYPES) {
    const rawOf = RAW_OF[type];
    for (const [key, g] of groupsBy(
      platforms,
      (p) => normalizeShared(type, rawOf(p.profile)),
      (p) => p.id
    )) {
      shared.push({
        id: `shared:${type}:${key}`,
        type,
        value: rawOf(g.sample.profile).trim(),
        members: Array.from(new Set(g.ids)), // never duplicate an edge to the same platform
      });
    }
  }

  // FINDINGS — one plain-language sentence per shared node.
  const findings: IdentityFinding[] = shared.map((s) => ({
    type: s.type,
    message: describeShared(s, labelOf, false, im),
    nodeIds: s.members,
    publicInfoOnly: PUBLIC_INFO_TYPES.has(s.type),
  }));

  // EXPOSURE SCORE — weighted by sensitivity; absent data adds nothing; capped at 100.
  let score = 0;
  for (const s of shared) score += WEIGHT[s.type] * (s.members.length - 1);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel: RiskLevel = score >= 67 ? "High" : score >= 34 ? "Medium" : "Low";

  // SUGGESTIONS — per matched type, with privacy-settings links for the platforms involved.
  const byTypeShared = new Map<SharedType, SharedNode[]>();
  for (const s of shared) {
    byTypeShared.set(s.type, [...(byTypeShared.get(s.type) ?? []), s]);
  }
  const suggestions: IdentitySuggestion[] = [];
  const settings = im ? localizedPrivacySettings(im) : PRIVACY_SETTINGS;
  for (const type of SENSITIVITY_ORDER) {
    const nodes = byTypeShared.get(type);
    if (!nodes || nodes.length === 0) continue;
    const links: IdentitySuggestionLink[] = [];
    for (const node of nodes) {
      for (const memberId of node.members) {
        const plat = platforms.find((p) => p.id === memberId)?.platform;
        if (!plat) continue;
        const link = settings[plat];
        if (!links.some((l) => l.href === link.href)) links.push(link);
      }
    }
    suggestions.push({ text: im ? im[SUGGESTION_KEY[type]] ?? SUGGESTION_TEXT[type] : SUGGESTION_TEXT[type], links });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      text: im ? im.sugNone : "No strong public connections detected. Keep usernames, contact details and locations varied and minimal across profiles.",
      links: [],
    });
  }

  const stats: IdentityStats = {
    platforms: platforms.length,
    byType: Object.fromEntries(
      SHARED_TYPES.map((t) => [t, shared.filter((s) => s.type === t).length])
    ) as Record<SharedType, number>,
  };

  return { hub, platforms, shared, findings, suggestions, stats, score, riskLevel };
}
