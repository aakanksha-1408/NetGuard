"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BackToHome from "@/components/BackToHome";
import IdentityGraph from "@/components/IdentityGraph";
import {
  analyzeIdentityMap,
  extractUsername,
  type IdentityAnalysis,
  type IdentityProfile,
  type IdentitySuggestionLink,
  type PlatformKey,
} from "@/lib/identityMap";
import { saveIdentityMapResult } from "@/lib/exposureStore";
import { useLang } from "@/lib/i18n/context";
import { interpolate } from "@/lib/i18n/lookups";

type ProfilePlatform = "instagram" | "youtube" | "github" | "linkedin";
const PROFILE_PLATFORMS: ProfilePlatform[] = ["instagram", "youtube", "github", "linkedin"];

interface PlatformForm {
  url: string;
  name: string;
  location: string;
  email: string;
  phone: string;
  workplace: string;
  birthday: string;
}

type PersonalField = Exclude<keyof PlatformForm, "url">;

type FormState = Record<ProfilePlatform, PlatformForm>;

const EMPTY_FORM: FormState = {
  instagram: { url: "", name: "", location: "", email: "", phone: "", workplace: "", birthday: "" },
  youtube: { url: "", name: "", location: "", email: "", phone: "", workplace: "", birthday: "" },
  github: { url: "", name: "", location: "", email: "", phone: "", workplace: "", birthday: "" },
  linkedin: { url: "", name: "", location: "", email: "", phone: "", workplace: "", birthday: "" },
};

// Realistic, entirely fictional sample person for Demo Mode. These are data
// values (a fake name/place/company), not UI copy, so they stay as-is.
const DEMO_FORM: FormState = {
  instagram: { url: "https://instagram.com/rahul123", name: "Rahul Sharma", location: "Mumbai", email: "", phone: "", workplace: "", birthday: "" },
  youtube: { url: "https://youtube.com/@rahul123", name: "Rahul Sharma", location: "Mumbai", email: "hello@rahulphotography.com", phone: "+91 98765 43210", workplace: "", birthday: "" },
  github: { url: "https://github.com/rahul123", name: "", location: "", email: "hello@rahulphotography.com", phone: "", workplace: "Studio Frame", birthday: "" },
  linkedin: { url: "https://linkedin.com/in/rahul123", name: "Rahul Sharma", location: "Mumbai", email: "", phone: "", workplace: "Studio Frame", birthday: "" },
};

// The personal information fields offered inside each platform card. Labels
// and placeholders come from the identityMap i18n dictionary; this fixed key
// order keeps every card's inputs aligned.
const PERSONAL_FIELD_KEYS: { key: PersonalField; order: number }[] = [
  { key: "name", order: 0 },
  { key: "location", order: 1 },
  { key: "email", order: 2 },
  { key: "phone", order: 3 },
  { key: "workplace", order: 4 },
  { key: "birthday", order: 5 },
];

const FIELD_INPUT_TYPES: Partial<Record<PersonalField, string>> = {
  email: "email",
  phone: "tel",
};

function hasPersonalValue(f: PlatformForm): boolean {
  return PERSONAL_FIELD_KEYS.some(({ key }) => f[key].trim() !== "");
}

function hasHost(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return /\./.test(u.hostname) && !u.hostname.includes(" ");
  } catch {
    return false;
  }
}

export default function IdentityMapPage() {
  const { t, lang } = useLang();
  const im = t.identityMap;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // The profiles behind the current analysis — recomputing through
  // analyzeIdentityMap on language change keeps findings/suggestions in sync.
  const [analyzedProfiles, setAnalyzedProfiles] = useState<IdentityProfile[] | null>(null);
  const [error, setError] = useState<string>("");
  const [githubStatus, setGithubStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [githubMessage, setGithubMessage] = useState<string>("");
  // Explicit open/closed choice per card. When unset, the group opens itself
  // automatically as soon as any personal-info field has a value.
  const [personalOpen, setPersonalOpen] = useState<Partial<Record<ProfilePlatform, boolean>>>({});

  const analysis: IdentityAnalysis | null = useMemo(
    () => (analyzedProfiles ? analyzeIdentityMap(analyzedProfiles, im) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyzedProfiles, lang],
  );

  function update(platform: ProfilePlatform, field: keyof PlatformForm, value: string) {
    setForm((prev) => ({ ...prev, [platform]: { ...prev[platform], [field]: value } }));
    // Editing the GitHub URL invalidates any previous auto-fill status/message.
    if (platform === "github" && field === "url") {
      setGithubStatus("idle");
      setGithubMessage("");
    }
  }

  function buildProfiles(state: FormState): IdentityProfile[] {
    const profiles: IdentityProfile[] = [];
    for (const platform of PROFILE_PLATFORMS) {
      const f = state[platform];
      if (!f.url.trim()) continue;
      profiles.push({
        platform: platform as PlatformKey,
        url: f.url.trim(),
        username: extractUsername(platform, f.url),
        name: f.name.trim(),
        location: f.location.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        workplace: f.workplace.trim(),
        birthday: f.birthday.trim(),
      });
    }
    return profiles;
  }

  function runAnalysis(state: FormState) {
    const provided = PROFILE_PLATFORMS.map((p) => state[p].url).filter((v) => v.trim());

    if (provided.length < 2) {
      setError(im.needTwoLinks);
      setAnalyzedProfiles(null);
      return;
    }
    const invalid = PROFILE_PLATFORMS.filter((p) => state[p].url.trim() && !hasHost(state[p].url));
    if (invalid.length > 0) {
      setError(
        interpolate(im.fixLinks, {
          links: invalid.length > 1 ? im.linkPlural : im.linkSingular,
          platforms: invalid.map((p) => im.platforms[p]).join(", "),
        }),
      );
      setAnalyzedProfiles(null);
      return;
    }

    const profiles = buildProfiles(state);
    const result = analyzeIdentityMap(profiles, im);
    setAnalyzedProfiles(profiles);
    setError("");
    saveIdentityMapResult({
      score: result.score,
      riskLevel: result.riskLevel,
      topFindings: result.findings.map((f) => f.message).slice(0, 4),
      platformCount: result.stats.platforms,
      generatedAt: new Date().toISOString(),
    });
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    runAnalysis(form);
  }

  function loadDemo() {
    setForm(DEMO_FORM);
    setPersonalOpen({ instagram: true, youtube: true, github: true, linkedin: true });
    setGithubStatus("idle");
    setGithubMessage("");
    runAnalysis(DEMO_FORM);
  }

  async function fetchGithub() {
    const username = extractUsername("github", form.github.url);
    if (!username) {
      setGithubStatus("error");
      setGithubMessage(im.autofillNeedsUrl);
      return;
    }
    setGithubStatus("loading");
    setGithubMessage("");
    try {
      const res = await fetch(`/api/identity/github?username=${encodeURIComponent(username)}`);
      const data = (await res.json()) as {
        ok: boolean;
        reason?: string;
        name?: string | null;
        location?: string | null;
        email?: string | null;
        company?: string | null;
      };
      if (!data.ok) {
        const msg =
          data.reason === "not_found"
            ? im.autofillNotFound
            : data.reason === "rate_limited"
              ? im.autofillRateLimited
              : im.autofillFailed;
        setGithubStatus("error");
        setGithubMessage(msg);
        return;
      }
      setForm((prev) => ({
        ...prev,
        github: {
          ...prev.github,
          name: data.name || prev.github.name,
          location: data.location || prev.github.location,
          email: data.email || prev.github.email,
          workplace: data.company || prev.github.workplace,
        },
      }));
      setGithubStatus("done");
      setGithubMessage(im.autofillDone);
    } catch {
      setGithubStatus("error");
      setGithubMessage(im.autofillOffline);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <BackToHome className="mb-6" />

      <header>
        <span className="inline-flex items-center rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
          {im.badge}
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          {im.title}
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
          {im.description}
        </p>
      </header>

      <p className="mt-6 flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <span aria-hidden="true">🔒</span>
        <span>
          {im.privacyNote}
        </span>
      </p>

      <p className="mt-3 flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <span aria-hidden="true">ℹ️</span>
        <span>{im.visibilityNote}</span>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {im.optionalNote}
          </p>
          <button
            type="button"
            onClick={loadDemo}
            className="inline-flex h-10 items-center justify-center rounded-full bg-teal-500 px-5 text-sm font-semibold text-black shadow-sm transition hover:bg-teal-400"
          >
            {im.demoBtn}
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {PROFILE_PLATFORMS.map((platform) => {
            const personalOpenForCard = personalOpen[platform] ?? hasPersonalValue(form[platform]);
            return (
            <fieldset
              key={platform}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <legend className="px-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {im.platforms[platform]}
              </legend>
              <TextInput
                label={interpolate(im.urlField, { platform: im.platforms[platform] })}
                placeholder={placeholderFor(platform)}
                value={form[platform].url}
                onChange={(v) => update(platform, "url", v)}
                trailing={
                  platform === "github" ? (
                    <button
                      type="button"
                      onClick={fetchGithub}
                      disabled={githubStatus === "loading"}
                      className="text-xs font-medium text-teal-600 hover:text-teal-500 disabled:opacity-50 dark:text-teal-400"
                    >
                      {githubStatus === "loading" ? im.autofillLoading : im.autofillBtn}
                    </button>
                  ) : null
                }
              />
              <div className="mt-3 grid gap-3">
                <div>
                  <button
                    type="button"
                    aria-expanded={personalOpenForCard}
                    aria-controls={`personal-${platform}`}
                    onClick={() =>
                      setPersonalOpen((prev) => ({ ...prev, [platform]: !personalOpenForCard }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-semibold text-zinc-700 outline-none transition hover:text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:text-zinc-300 dark:hover:text-teal-400"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block text-[10px] transition-transform motion-reduce:transition-none ${personalOpenForCard ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    {im.addPersonal}
                  </button>
                  {personalOpenForCard && (
                    <>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{im.groupReminder}</p>
                      <div
                        id={`personal-${platform}`}
                        role="group"
                        aria-label={im.personalGroupAria}
                        className="mt-2 grid grid-cols-2 gap-x-3 gap-y-4"
                      >
                        {PERSONAL_FIELD_KEYS.map((field) => (
                          <TextInput
                            key={field.key}
                            small
                            inputType={FIELD_INPUT_TYPES[field.key]}
                            label={im.fields[field.key].label}
                            placeholder={im.fields[field.key].placeholder}
                            value={form[platform][field.key]}
                            onChange={(v) => update(platform, field.key, v)}
                            labelHint={im.hints[platform][field.key]}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {platform === "github" && githubMessage && (
                  <p
                    className={`text-xs ${
                      githubStatus === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-teal-700 dark:text-teal-400"
                    }`}
                    role="status"
                  >
                    {githubMessage}
                  </p>
                )}
              </div>
            </fieldset>
            );
          })}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {im.tipBox}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-full bg-teal-500 px-7 text-sm font-semibold text-black shadow-lg shadow-teal-500/25 transition hover:bg-teal-400"
          >
            {im.submitBtn}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setAnalyzedProfiles(null);
              setError("");
              setGithubStatus("idle");
              setGithubMessage("");
              setPersonalOpen({});
            }}
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {im.clearBtn}
          </button>
        </div>
      </form>

      {analysis && (
        <section className="mt-12 space-y-10">
          <ScoreHeader analysis={analysis} />

          <IdentityGraph analysis={analysis} />

          <FootprintReport analysis={analysis} />

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-900 dark:bg-teal-950/40">
            <p className="text-sm text-teal-900 dark:text-teal-200">
              {im.quizCta}
            </p>
            <Link
              href="/quiz"
              className="inline-flex h-10 items-center justify-center rounded-full bg-teal-500 px-5 text-sm font-semibold text-black transition hover:bg-teal-400"
            >
              {im.quizBtn}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-views                                                          */
/* ------------------------------------------------------------------ */

function ScoreHeader({ analysis }: { analysis: IdentityAnalysis }) {
  const { t } = useLang();
  const im = t.identityMap;
  const riskColor =
    analysis.riskLevel === "High"
      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
      : analysis.riskLevel === "Medium"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  const riskLabel =
    analysis.riskLevel === "High" ? im.riskHigh : analysis.riskLevel === "Medium" ? im.riskMedium : im.riskLow;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{im.scoreHeading}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {im.scoreDesc}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-4xl font-bold text-teal-600 dark:text-teal-400">{analysis.score}</span>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${riskColor}`}>
          {interpolate(im.riskTag, { risk: riskLabel })}
        </span>
      </div>
    </div>
  );
}

function FootprintReport({ analysis }: { analysis: IdentityAnalysis }) {
  const { t } = useLang();
  const im = t.identityMap;
  const { stats, findings, suggestions } = analysis;
  const rows = [
    { label: im.rowPlatforms, value: stats.platforms },
    { label: im.rowSameUsername, value: stats.byType["same-username"] },
    { label: im.rowSameName, value: stats.byType["same-name"] },
    { label: im.rowSameLocation, value: stats.byType["same-location"] },
    { label: im.rowSameEmail, value: stats.byType["same-email"] },
    { label: im.rowSamePhone, value: stats.byType["same-phone"] },
    { label: im.rowSameWorkplace, value: stats.byType["same-workplace"] },
    { label: im.rowSameBirthday, value: stats.byType["same-birthday"] },
  ];
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <caption className="bg-zinc-50 px-5 py-3 text-left text-sm font-semibold text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {im.reportCaption}
          </caption>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-5 py-3 text-left font-normal text-zinc-600 dark:text-zinc-400">
                  {r.label}
                </th>
                <td className="px-5 py-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ReportList
          title={im.connectionsTitle}
          empty={im.connectionsEmpty}
          items={findings.map((f) => ({ text: f.message }))}
          tone="neutral"
        />
        <ReportList
          title={im.suggestionsTitle}
          empty=""
          items={suggestions}
          tone="teal"
        />
      </div>

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        {im.reportDisclaimer}
      </p>
    </div>
  );
}

function ReportList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: { text: string; links?: IdentitySuggestionLink[] }[];
  empty: string;
  tone: "neutral" | "teal";
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  tone === "teal" ? "bg-teal-500" : "bg-zinc-400"
                }`}
                aria-hidden="true"
              />
              <span>
                {item.text}
                {item.links && item.links.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {item.links.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-teal-600 underline-offset-2 hover:underline dark:text-teal-400"
                      >
                        {link.label} ↗
                      </a>
                    ))}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form input                                                         */
/* ------------------------------------------------------------------ */

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  small,
  trailing,
  labelHint,
  inputType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  small?: boolean;
  trailing?: React.ReactNode;
  labelHint?: string;
  inputType?: string;
}) {
  return (
    <label className="block">
      <span className={`flex items-center justify-between gap-2 ${small ? "text-xs" : "text-sm"} font-medium text-zinc-700 dark:text-zinc-300`}>
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="whitespace-nowrap">{label}</span>
          {labelHint && <InfoHint hint={labelHint} />}
        </span>
        {trailing}
      </span>
      <input
        type={inputType ?? "text"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-xl border border-zinc-300 bg-white text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${
          small ? "px-3 py-2 text-sm" : "px-4 py-2.5 text-sm"
        }`}
      />
    </label>
  );
}

/**
 * The (i) badge next to a field label. Its tooltip says where to find the
 * value on that platform plus the public-visibility reminder, and opens on
 * hover (group-hover/group-focus CSS), on keyboard focus and on tap/click
 * (state toggle). Esc or moving away closes a tap-opened tooltip. mousedown
 * is prevented so tapping the badge inside a <label> doesn't focus the input.
 */
function InfoHint({ hint }: { hint: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const text = `${hint} ${t.identityMap.tooltipReminder}`;
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label={text}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        } else if (e.key === "Escape") {
          setOpen(false);
        }
      }}
      className="group relative inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-zinc-400 text-[10px] font-semibold text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:border-zinc-600 dark:text-zinc-400"
    >
      i
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-44 -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-normal leading-relaxed text-white shadow-lg dark:bg-zinc-700 ${
          open ? "block" : "hidden group-hover:block group-focus:block"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

function placeholderFor(platform: ProfilePlatform): string {
  switch (platform) {
    case "instagram":
      return "https://instagram.com/username";
    case "youtube":
      return "https://youtube.com/@handle";
    case "github":
      return "https://github.com/username";
    case "linkedin":
      return "https://linkedin.com/in/username";
  }
}
