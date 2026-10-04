"use client";

import { useEffect, useState } from "react";

/**
 * Black launch splash for the installed (standalone) PWA: logo + "NetGuard"
 * for 1500ms, then a 300ms fade-out.
 *
 * No-flash + no-hydration-mismatch trick: the overlay is ALWAYS rendered on
 * the server, but CSS keeps it `display: none` unless the page runs in
 * display-mode: standalone (see .app-splash in globals.css). So the very
 * first paint inside the installed app is already black, browser tabs are
 * untouched, and the server HTML matches the client's first render exactly.
 *
 * Shown once per app launch via sessionStorage (wrapped in try/catch for
 * private-mode browsers); later page reloads within the same session skip it.
 * prefers-reduced-motion: CSS drops the animations and the overlay is simply
 * removed after the same 1500ms - no fade step at all.
 */
const STORAGE_KEY = "netguard-splash-shown";
const SPLASH_MS = 1500;
const FADE_MS = 300;

export default function AppSplash() {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Older iOS Safari exposes its own flag instead of matching the media query.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    let shownBefore = false;
    try {
      shownBefore = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage unavailable (private mode etc.) - show the splash anyway.
    }

    if (!standalone || shownBefore) {
      setHidden(true); // plain browser tab, or second launch this session
      return;
    }

    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore - the once-per-launch guarantee is best effort only.
    }

    const reduceMotion = window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    const timers = reduceMotion
      ? [window.setTimeout(() => setHidden(true), SPLASH_MS)]
      : [
          window.setTimeout(() => setFading(true), SPLASH_MS),
          window.setTimeout(() => setHidden(true), SPLASH_MS + FADE_MS),
        ];

    return () => timers.forEach(clearTimeout);
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`app-splash${fading ? " app-splash-fading" : ""}`}
      role="presentation"
    >
      <img src="/logo.png?v=2" alt="" className="app-splash-logo" />
      <p className="app-splash-name">NetGuard</p>
    </div>
  );
}
