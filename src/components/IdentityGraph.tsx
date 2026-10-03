"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/i18n/context";
import { interpolate } from "@/lib/i18n/lookups";
import {
  PUBLIC_INFO_TYPES,
  SENSITIVITY_ORDER,
  describeShared,
  localizedSharedLabels,
  maskedSharedValue,
  type IdentityAnalysis,
  type PlatformNode,
  type SharedNode,
  type SharedType,
} from "@/lib/identityMap";

/**
 * IdentityGraph — interactive map of a person's public online identity.
 *
 * Model: a central "You" hub, platform nodes evenly spaced on a ring around it,
 * and rounded "pill" nodes for every piece of public information shared by 2+
 * profiles. Phone numbers and birthdays are masked in the graph — full values
 * appear in the side panel only. Edges are trimmed to node boundaries; pills
 * are pushed apart by a collision pass so nothing overlaps. Plain SVG, no
 * dependency.
 */

/* ── Geometry (viewBox units; the SVG never scales below 1:1 so text stays legible) ── */
// The frame is wider than tall so a long, thin shared-info pill can clear a
// side platform node without being clamped back on top of it. Horizontal scroll
// on narrow screens keeps the pills readable at 1:1 scale instead of shrinking.
const VBW = 1040;
const VBH = 760;
const CX = VBW / 2;
const CY = VBH / 2;
const RING = 190; // platform ring radius
const PILL_RING = 300; // preferred radius for shared-info pills
const HUB_R = 58;
const PLAT_R = 46;

interface TypeStyle {
  color: string;
  dash: string;
  icon: string;
}

// One distinct colour + dash pattern + icon per type, so meaning never
// relies on colour alone.
const SHARED_STYLE: Record<SharedType, TypeStyle> = {
  "same-username": { color: "#0d9488", dash: "", icon: "@" },
  "same-name": { color: "#2563eb", dash: "9 5", icon: "👤" },
  "same-location": { color: "#d97706", dash: "12 4 2 4", icon: "📍" },
  "same-email": { color: "#dc2626", dash: "2 4", icon: "✉️" },
  "same-phone": { color: "#db2777", dash: "2 6", icon: "📞" },
  "same-workplace": { color: "#7c3aed", dash: "8 4 2 4", icon: "💼" },
  "same-birthday": { color: "#16a34a", dash: "4 4", icon: "🎂" },
};

interface FocusRef {
  kind: "platform" | "shared";
  id: string;
}

interface Pt {
  x: number;
  y: number;
}
interface PlatLayout extends Pt {
  node: PlatformNode;
  connected: boolean;
}
interface PillLayout {
  node: SharedNode;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  text: string;
  full: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

function pillText(node: SharedNode, labels: Record<SharedType, string>): { display: string; full: string; w: number } {
  const label = labels[node.type];
  // Phone and birthday values are masked in the graph — the <title> tooltip
  // uses the masked value too, so nothing sensitive leaks on hover.
  const bare = maskedSharedValue(node);
  const value = node.type === "same-username" ? `@${bare}` : bare;
  const full = `${label}: ${value}`;
  let shown = value;
  // keep the pill within ~240 units
  const maxChars = Math.floor((240 - 44) / 6.6) - label.length - 2;
  if (shown.length > maxChars) shown = `${shown.slice(0, Math.max(2, maxChars - 1))}…`;
  const display = `${label}: ${shown}`;
  const w = Math.min(240, 44 + display.length * 6.6);
  return { display, full, w };
}

export default function IdentityGraph({ analysis }: { analysis: IdentityAnalysis }) {
  const { t } = useLang();
  const im = t.identityMap;
  const labels = useMemo(() => localizedSharedLabels(im), [im]);
  const [selected, setSelected] = useState<FocusRef | null>(null);
  const [hovered, setHovered] = useState<FocusRef | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hover previews take priority over the persistent selection, so hovering a
  // panel row highlights its pill + platforms even while a platform is selected;
  // on mouse-out we fall back to the selection.
  const focus = hovered ?? selected;

  const connectedPlatformIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of analysis.shared) for (const m of s.members) set.add(m);
    return set;
  }, [analysis.shared]);

  /* ── Layout ────────────────────────────────────────────────── */
  const layout = useMemo(() => {
    const n = analysis.platforms.length;
    const plats: PlatLayout[] = analysis.platforms.map((node, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        node,
        x: CX + RING * Math.cos(angle),
        y: CY + RING * Math.sin(angle),
        connected: connectedPlatformIds.has(node.id),
      };
    });
    const platById = new Map(plats.map((p) => [p.node.id, p]));

    // Pills start at the average direction of their members, on the outer ring.
    const pills: PillLayout[] = analysis.shared.map((node) => {
      const members = node.members.map((id) => platById.get(id)).filter(Boolean) as PlatLayout[];
      let sx = 0;
      let sy = 0;
      for (const m of members) {
        sx += m.x - CX;
        sy += m.y - CY;
      }
      let angle: number;
      if (Math.hypot(sx, sy) < 1) {
        const first = members[0];
        angle = first ? Math.atan2(first.y - CY, first.x - CX) : -Math.PI / 2;
      } else {
        angle = Math.atan2(sy, sx);
      }
      const { display, full, w } = pillText(node, labels);
      const h = 30;
      return {
        node,
        x: CX + PILL_RING * Math.cos(angle),
        y: CY + PILL_RING * Math.sin(angle),
        w,
        h,
        r: Math.max(w, h) / 2,
        text: display,
        full,
      };
    });

    // Collision-avoidance relaxation. Each pill is a rounded rectangle, so the
    // required gap uses the pill's true half-extent along the line joining the
    // two centres (an elliptical radius would demand huge vertical gaps). Only
    // pills move — platform nodes stay pinned to the ring so nothing drifts.
    const PAD = 12;
    for (let iter = 0; iter < 220; iter++) {
      for (let i = 0; i < pills.length; i++) {
        const a = pills[i];
        for (let j = i + 1; j < pills.length; j++) {
          sepPillPill(a, pills[j], 18);
        }
        for (const p of plats) sepPillCircle(a, p.x, p.y, PLAT_R, 16);
        sepPillCircle(a, CX, CY, HUB_R, 18);
        a.x = Math.max(PAD + a.w / 2, Math.min(VBW - PAD - a.w / 2, a.x));
        a.y = Math.max(PAD + a.h / 2, Math.min(VBH - PAD - a.h / 2, a.y));
      }
    }
    return { plats, pills, platById };
  }, [analysis, connectedPlatformIds, labels]);

  /* ── Highlight sets derived from the focused node ──────────── */
  const active = useMemo(() => {
    if (!focus) return null;
    const nodes = new Set<string>();
    const edges = new Set<string>();
    if (focus.kind === "platform") {
      nodes.add(focus.id);
      nodes.add("hub");
      edges.add(`hub:${focus.id}`);
      for (const s of analysis.shared) {
        if (s.members.includes(focus.id)) {
          nodes.add(s.id);
          for (const m of s.members) {
            nodes.add(m);
            edges.add(`shared:${s.id}->${m}`);
          }
        }
      }
    } else if (focus.kind === "shared") {
      const s = analysis.shared.find((x) => x.id === focus.id);
      if (s) {
        nodes.add(s.id);
        for (const m of s.members) {
          nodes.add(m);
          edges.add(`shared:${s.id}->${m}`);
        }
      }
    }
    return { nodes, edges };
  }, [focus, analysis]);

  const nodeOpacity = (id: string) => (active ? (active.nodes.has(id) ? 1 : 0.2) : 1);
  const edgeOpacity = (key: string) => (active ? (active.edges.has(key) ? 1 : 0.12) : 1);

  // When a connection is selected from the panel, scroll the (possibly
  // horizontally clipped) SVG so its pill is centred in view. Honors
  // prefers-reduced-motion by jumping instantly instead of animating.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected || selected.kind !== "shared") return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pill = layout.pills.find((p) => p.node.id === selected.id);
    if (!pill) return;
    // Use the SVG's real rendered width, not the wrapper's: the SVG has a
    // min-width so it never shrinks below 1:1, and this keeps the centring exact
    // when the container is wider than the viewBox.
    const svg = wrap.querySelector("svg");
    const renderedW = svg ? svg.getBoundingClientRect().width : wrap.clientWidth;
    const scale = renderedW / VBW; // CSS px per viewBox unit
    const targetX = pill.x * scale;
    const left = Math.max(0, targetX - wrap.clientWidth / 2);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    wrap.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [selected, layout]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Graph */}
      <div ref={wrapRef} className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          className="h-auto w-full"
          style={{ minWidth: `${VBW}px` }}
          role="group"
          aria-label={im.graphAria}
        >
          {/* 1. Edges (drawn first) */}
          <g>
            {layout.plats.map((p) => {
              const { x1, y1, x2, y2 } = trim(CX, CY, HUB_R, p.x, p.y, PLAT_R);
              return (
                <line
                  key={`hub:${p.node.id}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  className="dark:opacity-40"
                  opacity={edgeOpacity(`hub:${p.node.id}`)}
                />
              );
            })}

            {layout.pills.map((pill) =>
              pill.node.members.map((mid) => {
                const p = layout.platById.get(mid);
                if (!p) return null;
                const key = `shared:${pill.node.id}->${mid}`;
                const { x1, y1, x2, y2 } = trim(pill.x, pill.y, pill.r * 0.6, p.x, p.y, PLAT_R);
                const st = SHARED_STYLE[pill.node.type];
                return (
                  <line
                    key={key}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={st.color}
                    strokeWidth={2.5}
                    strokeDasharray={st.dash || undefined}
                    opacity={edgeOpacity(key)}
                  />
                );
              })
            )}
          </g>

          {/* 2. Shared-info pills */}
          {layout.pills.map((pill) => (
            <Pill
              key={pill.node.id}
              pill={pill}
              opacity={nodeOpacity(pill.node.id)}
              selected={selected?.kind === "shared" && selected.id === pill.node.id}
              onSelect={() => toggle(setSelected, selected, { kind: "shared", id: pill.node.id })}
              onHover={(h) => setHovered(h)}
            />
          ))}

          {/* 3. Nodes (circles drawn last, on top) */}
          {/* Hub */}
          <g
            role="button"
            tabIndex={0}
            aria-label={im.hubAria}
            className="cursor-pointer focus:drop-shadow-[0_0_3px_rgba(13,148,136,0.9)]"
            onClick={() => toggle(setSelected, selected, null)}
            onKeyDown={(e) => onActivate(e, () => toggle(setSelected, selected, null))}
            opacity={nodeOpacity("hub")}
          >
            <circle cx={CX} cy={CY} r={HUB_R} fill="#0f766e" stroke="#134e4a" strokeWidth={2} />
            <text x={CX} y={CY - 6} textAnchor="middle" fontSize={20} fontWeight={700} fill="#ffffff">
              {analysis.hub.label}
            </text>
            {analysis.hub.sublabel && (
              <text x={CX} y={CY + 16} textAnchor="middle" fontSize={12} fill="#ccfbf1">
                {analysis.hub.sublabel}
              </text>
            )}
          </g>

          {layout.plats.map((p) => (
            <PlatformNodeView
              key={p.node.id}
              plat={p}
              opacity={nodeOpacity(p.node.id)}
              selected={selected?.kind === "platform" && selected.id === p.node.id}
              onSelect={() => toggle(setSelected, selected, { kind: "platform", id: p.node.id })}
              onHover={(h) => setHovered(h)}
            />
          ))}
        </svg>
      </div>

      {/* Side panel */}
      <aside className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Panel
          analysis={analysis}
          selected={selected}
          onSelect={(sel) => {
            setSelected(sel);
          }}
          onHover={(h) => setHovered(h)}
        />
      </aside>
    </div>
  );
}

/* ── Geometry helpers ──────────────────────────────────────────── */

/** Half-extent of a pill (rounded rect) along the unit direction (ux, uy). */
function pillHalfExtent(pill: PillLayout, ux: number, uy: number): number {
  return Math.abs(ux) * (pill.w / 2) + Math.abs(uy) * (pill.h / 2);
}

/** Separate two pills, moving both, using their true rect extents. */
function sepPillPill(a: PillLayout, b: PillLayout, gap: number) {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  let d = Math.hypot(dx, dy);
  if (d === 0) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  const ux = dx / d;
  const uy = dy / d;
  const need = pillHalfExtent(a, ux, uy) + pillHalfExtent(b, ux, uy) + gap;
  if (d < need) {
    const push = (need - d) / 2;
    a.x += ux * push;
    a.y += uy * push;
    b.x -= ux * push;
    b.y -= uy * push;
  }
}

/** Push only the pill `a` clear of a fixed circle (platform node or the hub). */
function sepPillCircle(a: PillLayout, cx: number, cy: number, cr: number, gap: number) {
  let dx = a.x - cx;
  let dy = a.y - cy;
  let d = Math.hypot(dx, dy);
  if (d === 0) {
    dx = 0;
    dy = -1;
    d = 1;
  }
  const ux = dx / d;
  const uy = dy / d;
  const need = pillHalfExtent(a, ux, uy) + cr + gap;
  if (d < need) {
    const push = need - d;
    a.x += ux * push;
    a.y += uy * push;
  }
}

function trim(fx: number, fy: number, fr: number, tx: number, ty: number, tr: number) {
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: fx + ux * (fr + 2),
    y1: fy + uy * (fr + 2),
    x2: tx - ux * (tr + 2),
    y2: ty - uy * (tr + 2),
  };
}

function toggle<T>(
  setter: (v: T | null) => void,
  current: T | null,
  next: T | null
) {
  setter(current && JSON.stringify(current) === JSON.stringify(next) ? null : next);
}

function onActivate(e: React.KeyboardEvent, fn: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
}

/* ── Pill (shared-info node) ───────────────────────────────────── */

function Pill({
  pill,
  opacity,
  selected,
  onSelect,
  onHover,
}: {
  pill: PillLayout;
  opacity: number;
  selected: boolean;
  onSelect: () => void;
  onHover: (h: FocusRef | null) => void;
}) {
  const st = SHARED_STYLE[pill.node.type];
  const { t: tr } = useLang();
  const x = pill.x - pill.w / 2;
  const y = pill.y - pill.h / 2;
  const enter = () => onHover({ kind: "shared", id: pill.node.id });
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={interpolate(tr.identityMap.pillAria, { full: pill.full, count: pill.node.members.length })}
      className="cursor-pointer focus:outline-none"
      opacity={opacity}
      onClick={onSelect}
      onKeyDown={(e) => onActivate(e, onSelect)}
      onMouseEnter={enter}
      onMouseLeave={() => onHover(null)}
      onFocus={enter}
      onBlur={() => onHover(null)}
    >
      <title>{pill.full}</title>
      <rect
        x={x}
        y={y}
        width={pill.w}
        height={pill.h}
        rx={15}
        fill="var(--pill-bg, #ffffff)"
        stroke={st.color}
        strokeWidth={selected ? 2.5 : 1}
        className="[fill:#ffffff] dark:[fill:#18181b]"
      />
      <circle cx={x + 16} cy={pill.y} r={5} fill={st.color} />
      <text
        x={x + 28}
        y={pill.y}
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={600}
        fill="#27272a"
        className="select-none dark:[fill:#e4e4e7]"
      >
        {pill.text}
      </text>
    </g>
  );
}

/* ── Platform node ─────────────────────────────────────────────── */

function PlatformNodeView({
  plat,
  opacity,
  selected,
  onSelect,
  onHover,
}: {
  plat: PlatLayout;
  opacity: number;
  selected: boolean;
  onSelect: () => void;
  onHover: (h: FocusRef | null) => void;
}) {
  const { node, x, y, connected } = plat;
  const { t: tr } = useLang();
  const name = truncate(node.label, 12);
  const handle = node.username ? truncate(`@${node.username}`, 13) : "";
  const enter = () => onHover({ kind: "platform", id: node.id });
  const aria = node.username
    ? interpolate(tr.identityMap.platformAriaHandle, { label: node.label, handle: node.username })
    : interpolate(tr.identityMap.platformAria, { label: node.label });
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={aria}
      className="cursor-pointer focus:drop-shadow-[0_0_3px_rgba(13,148,136,0.9)]"
      opacity={opacity}
      onClick={onSelect}
      onKeyDown={(e) => onActivate(e, onSelect)}
      onMouseEnter={enter}
      onMouseLeave={() => onHover(null)}
      onFocus={enter}
      onBlur={() => onHover(null)}
    >
      <title>{`${node.label}${node.username ? ` · @${node.username}` : ""}`}</title>
      <circle
        cx={x}
        cy={y}
        r={PLAT_R}
        fill={connected ? "#ffffff" : "#f4f4f5"}
        stroke={selected ? "#0d9488" : connected ? "#a1a1aa" : "#e4e4e7"}
        strokeWidth={selected ? 3 : 1.5}
        className="dark:[fill:#18181b]"
      />
      <text
        x={x}
        y={handle ? y - 5 : y}
        textAnchor="middle"
        dominantBaseline={handle ? "auto" : "middle"}
        fontSize={14}
        fontWeight={700}
        fill={connected ? "#18181b" : "#a1a1aa"}
        className="select-none dark:[fill:#e4e4e7]"
      >
        {name}
      </text>
      {handle && (
        <text x={x} y={y + 13} textAnchor="middle" fontSize={12} fill="#71717a" className="select-none dark:[fill:#a1a1aa]">
          {handle}
        </text>
      )}
    </g>
  );
}

/* ── Side panel ────────────────────────────────────────────────── */

function Panel({
  analysis,
  selected,
  onSelect,
  onHover,
}: {
  analysis: IdentityAnalysis;
  selected: FocusRef | null;
  onSelect: (s: FocusRef | null) => void;
  onHover: (h: FocusRef | null) => void;
}) {
  const { t } = useLang();
  const im = t.identityMap;
  const labels = localizedSharedLabels(im);
  const labelOf = (id: string) => analysis.platforms.find((p) => p.id === id)?.label ?? id;
  const selPlatform =
    selected?.kind === "platform" ? analysis.platforms.find((p) => p.id === selected.id) : undefined;
  const selShared =
    selected?.kind === "shared" ? analysis.shared.find((s) => s.id === selected.id) : undefined;

  const hasConnections = analysis.shared.length > 0;

  // One row per (shared type, other platform) pair for the selected profile,
  // ordered by type sensitivity then platform name so the riskiest matches are
  // on top. Phone/birthday rows are kept (a shared phone is a strong link) but
  // their value is never surfaced — not in the row and not in the tooltip.
  const connectionRows = (() => {
    if (!selPlatform) return [] as { type: SharedType; otherId: string; node: SharedNode }[];
    const seen = new Set<string>();
    const rows: { type: SharedType; otherId: string; node: SharedNode }[] = [];
    for (const s of analysis.shared) {
      if (!s.members.includes(selPlatform.id)) continue;
      for (const m of s.members) {
        if (m === selPlatform.id) continue;
        const key = `${s.id}|${m}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ type: s.type, otherId: m, node: s });
      }
    }
    rows.sort(
      (a, b) =>
        SENSITIVITY_ORDER.indexOf(a.type) - SENSITIVITY_ORDER.indexOf(b.type) ||
        labelOf(a.otherId).localeCompare(labelOf(b.otherId))
    );
    return rows;
  })();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {selPlatform ? selPlatform.label : selShared ? interpolate(im.panelMatch, { label: labels[selShared.type] }) : im.panelDefault}
        </h3>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {im.clearSelection}
          </button>
        )}
      </div>

      <div className="mt-3 flex-1 text-sm">
        {selShared ? (
          <div className="space-y-3">
            <p className="text-zinc-700 dark:text-zinc-300">{describeShared(selShared, labelOf, true, im)}</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              {PUBLIC_INFO_TYPES.has(selShared.type)
                ? im.sharedPublicNote
                : im.sharedStrongNote}
            </p>
            <ul className="space-y-1">
              {selShared.members.map((m) => (
                <li key={m} className="text-zinc-600 dark:text-zinc-400">
                  • {labelOf(m)}
                </li>
              ))}
            </ul>
          </div>
        ) : selPlatform ? (
          <div className="space-y-2">
            <InfoRow label={im.infoUsername} value={selPlatform.username ? `@${selPlatform.username}` : ""} />
            <InfoRow label={im.infoNameShown} value={selPlatform.profile.name ?? ""} />
            <InfoRow label={im.infoLocationShown} value={selPlatform.profile.location ?? ""} />
            <InfoRow label={im.infoEmailShown} value={selPlatform.profile.email ?? ""} />
            <InfoRow label={im.infoPhoneShown} value={selPlatform.profile.phone ?? ""} />
            <InfoRow label={im.infoWorkplaceShown} value={selPlatform.profile.workplace ?? ""} />
            <InfoRow label={im.infoBirthdayShown} value={selPlatform.profile.birthday ?? ""} />
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{im.connectionsHeading}</p>
              {connectionRows.length === 0 ? (
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">{im.noConnectionsFor}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {connectionRows.map(({ type, otherId, node }) => {
                    const otherLabel = labelOf(otherId);
                    const text = interpolate(im.sameType, { type: labels[type].toLowerCase(), other: otherLabel });
                    // Phone & birthday values are never shown, not even masked.
                    const showValue = type !== "same-phone" && type !== "same-birthday";
                    const masked = maskedSharedValue(node);
                    const valStr = type === "same-username" ? `@${masked}` : masked;
                    const tooltip = showValue
                      ? interpolate(im.alsoShownOn, { label: labels[type], value: valStr, other: otherLabel })
                      : interpolate(im.matchWith, { label: labels[type], other: otherLabel });
                    return (
                      <li key={`${node.id}|${otherId}`}>
                        <ConnectionRow
                          type={type}
                          text={text}
                          tooltip={tooltip}
                          onHover={() => onHover({ kind: "shared", id: node.id })}
                          onLeave={() => onHover(null)}
                          onSelect={() => onSelect({ kind: "shared", id: node.id })}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : hasConnections ? (
          <ul className="space-y-1">
            {analysis.shared.map((s) => {
              const sentence = describeShared(s, labelOf, true, im);
              return (
                <li key={s.id}>
                  <ConnectionRow
                    type={s.type}
                    text={sentence}
                    tooltip={sentence}
                    onHover={() => onHover({ kind: "shared", id: s.id })}
                    onLeave={() => onHover(null)}
                    onSelect={() => onSelect({ kind: "shared", id: s.id })}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-2 text-zinc-600 dark:text-zinc-400">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">
              {im.noConnectionsAtAll1}
            </p>
            <p>
              {im.noConnectionsAtAll2}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{im.legend}</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {(Object.keys(SHARED_STYLE) as SharedType[]).map((typ) => (
            <li key={typ} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <svg width="26" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="26" y2="4" stroke={SHARED_STYLE[typ].color} strokeWidth="2.5" strokeDasharray={SHARED_STYLE[typ].dash || undefined} />
              </svg>
              <span>
                {SHARED_STYLE[typ].icon} {labels[typ]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        {im.graphDisclaimer}
      </p>
    </div>
  );
}

/**
 * A single connection row used across the panel (default overview, the
 * platform-selected "Connections" list and the mobile bottom sheet — same
 * component, same styling). A colour dot matching the graph pill plus the
 * per-type icon mean the row never relies on colour alone; the label wraps onto
 * multiple lines with the dot aligned to the first line.
 */
function ConnectionRow({
  type,
  text,
  tooltip,
  onHover,
  onLeave,
  onSelect,
}: {
  type: SharedType;
  text: string;
  tooltip: string;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
}) {
  const st = SHARED_STYLE[type];
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <span
        className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: st.color }}
        aria-hidden="true"
      />
      <span className="min-w-0 break-words leading-snug">
        <span aria-hidden="true" className="mr-1">
          {st.icon}
        </span>
        {text}
      </span>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="truncate text-right font-medium text-zinc-800 dark:text-zinc-200" title={value}>
        {value}
      </span>
    </div>
  );
}
