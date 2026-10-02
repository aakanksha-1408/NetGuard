import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/geo-reverse  { lat, lng }
 *
 * Reverse-geocodes coordinates from a geo: QR code using OpenStreetMap
 * Nominatim (free, no key, no Gemini quota). Fail-open: any problem
 * returns ok:false and the UI simply says the location could not be
 * verified — we never guess a place name from raw coordinates.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const TIMEOUT_MS = 6000;

interface GeoReverseResponse {
  ok: boolean;
  name?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
  reason?: string;
}

function validCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

export async function POST(request: NextRequest) {
  try {
    const { lat, lng } = (await request.json()) as { lat?: unknown; lng?: unknown };
    const coords = validCoords(lat, lng);
    if (!coords) {
      return NextResponse.json<GeoReverseResponse>({ ok: false, reason: "invalid_coordinates" });
    }

    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(coords.lat),
      lon: String(coords.lng),
      zoom: "18",
      acceptlanguage: "en",
    });

    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "NetGuardSocialSafetyApp/1.0 (safety research)" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json<GeoReverseResponse>({ ok: false, reason: "provider_unavailable", ...coords });
    }

    const data = (await res.json()) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    };

    const addr = data.address ?? {};
    const parts = [
      addr.neighbourhood || addr.quarter || addr.road || "",
      addr.city || addr.town || addr.village || addr.county || "",
      addr.state || "",
      addr.country || "",
    ].filter(Boolean);

    // "Thane, Mumbai, Maharashtra, India" style short label
    const location =
      data.name && !parts.some((p) => p.toLowerCase().startsWith(data.name!.toLowerCase()))
        ? `${data.name}, ${parts.slice(0, 3).join(", ")}`
        : parts.slice(0, 4).join(", ");

    if (!location && !data.display_name) {
      return NextResponse.json<GeoReverseResponse>({ ok: false, reason: "no_result", ...coords });
    }

    return NextResponse.json<GeoReverseResponse>({
      ok: true,
      name: data.name || parts[0] || null,
      address: location || data.display_name?.slice(0, 250) || null,
      ...coords,
    });
  } catch (err) {
    console.error("geo-reverse route error:", err);
    return NextResponse.json<GeoReverseResponse>(
      { ok: false, reason: "internal_error" },
      { status: 500 },
    );
  }
}
