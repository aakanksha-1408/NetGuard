"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (public/sw.js) exactly once, mounted in
 * the root layout. Skipped in development so the cache-first strategies
 * cannot shadow `next dev` hot reloads - test with `npm run build` +
 * `npm start`, or on the Vercel deploy.
 */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return; // SSR-safe + very old browsers
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // Registration failure must never break the app - it just means no
        // offline support for this visit.
        console.warn("Service worker registration failed:", err);
      });
  }, []);

  return null;
}
