/*
 * NetGuard service worker - plain JS, no Workbox (no new dependencies).
 * Registered from src/components/sw-register.tsx.
 *
 * Caching rules (privacy-first, mirrors the app's Supabase auth usage):
 *   - NEVER touches cross-origin requests (Supabase auth/storage, GitHub, ...)
 *     - they fall through to the network untouched.
 *   - NEVER caches same-origin /api/* (these hit Gemini/Supabase with
 *     per-user data), /login, or /auth* paths - network only.
 *   - Only non-GET requests are ignored outright.
 *   - Static build assets (/_next/static/*, versioned immutable filenames)
 *     and the PWA icons are cached-first.
 *   - Page navigations are network-first; when offline, the previously cached
 *     copy is served, and /offline is the final fallback.
 */

// v2: icon bytes changed (black maskable + black apple-icon background), and
// icons are served cache-first - the rename forces old caches to be purged
// on activate.
const CACHE_NAME = "netguard-v2";
const OFFLINE_URL = "/offline";

// Precached at install so the offline shell exists before the first
// disconnect. These are all public, non-auth assets. /logo.png is here
// because the offline page, the navbar and the launch splash all render it
// (as /logo.png?v=2 - the cache-first match ignores query strings for these
// paths, so the version param cannot break the offline hit).
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/logo.png",
];

// Same-origin paths that must never enter the cache: API routes (server-side
// Gemini/Supabase calls), authentication, anything auth-shaped.
const NETWORK_ONLY_PREFIXES = ["/api/", "/login", "/auth"];

function isNetworkOnly(pathname) {
  return NETWORK_ONLY_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Non-GET (form posts, Supabase mutations, API writes): straight to network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (Supabase auth/storage, fonts, external): never intercept,
  // never cache - private user data must not land in the Cache API.
  if (url.origin !== self.location.origin) return;

  // Auth and API routes: network only, no caching under any circumstances.
  if (isNetworkOnly(url.pathname)) return;

  // Static build assets and PWA icons: cache-first, fill cache on miss.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/manifest.webmanifest" ||
    /^\/(icon-.*|logo\.png|favicon\.ico|apple-icon\.png|icon\.png)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then(async (cache) => {
          // ignoreSearch only where the path alone identifies the asset -
          // /_next/image responses differ by their ?url= query.
          const matchOpts = { ignoreSearch: !url.pathname.startsWith("/_next/image") };
          const hit = await cache.match(request, matchOpts);
          if (hit) return hit;
          const res = await fetch(request);
          // Only same-origin successful responses may enter the cache.
          if (res && res.ok && res.type === "basic") cache.put(request, res.clone());
          return res;
        })
        // Offline and not cached yet: hand back a synthetic network error
        // instead of letting the rejection escape as an uncaught
        // "TypeError: Failed to fetch" in the console.
        .catch(() => Response.error())
    );
    return;
  }

  // Everything else (page navigations, prerendered HTML): network-first so
  // users always get fresh content when online; cache, then /offline, when
  // the network fails.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res && res.ok && res.type === "basic") {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, res.clone());
        }
        return res;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") {
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
        }
        throw err;
      }
    })()
  );
});
