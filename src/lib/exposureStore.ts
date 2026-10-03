/**
 * exposureStore — SSR-safe persistence for the Digital Identity Map result.
 *
 * The Identity Map runs client-side; we stash a compact summary in localStorage
 * so the Footprint Score quiz can fold it into a combined score. Every access is
 * wrapped in try/catch and guarded against a server render (no `window`).
 */

import type { RiskLevel } from "./identityMap";

export interface IdentityMapResult {
  score: number; // 0..100 identity exposure
  riskLevel: RiskLevel;
  topFindings: string[]; // plain-language sentences
  platformCount: number;
  generatedAt: string; // ISO timestamp
}

const STORAGE_KEY = "netguard.identityMap.v1";

/** Persist the latest identity-map result. Safe on the server and in private mode. */
export function saveIdentityMapResult(result: IdentityMapResult): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    /* storage may be unavailable (private mode / quota) — ignore */
  }
}

/** Load the stored result, or null when nothing is saved / parsing fails. */
export function loadIdentityMapResult(): IdentityMapResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IdentityMapResult;
    if (typeof parsed?.score !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove any stored result. */
export function clearIdentityMapResult(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Combined footprint score: 60% quiz score + 40% identity exposure.
 * Only used for display on the quiz results — it never changes how the quiz
 * calculates its own score.
 */
export function combinedFootprintScore(quizScore: number, identityScore: number): number {
  const combined = quizScore * 0.6 + identityScore * 0.4;
  return Math.max(0, Math.min(100, Math.round(combined)));
}
