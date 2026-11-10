import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "@/server/wayapp/env";
import { guardGoogleApi } from "@/server/wayapp/google-api-guard";
import { json } from "@/server/wayapp/http";

export const Route = createFileRoute("/api/places-search")({
  server: { handlers: { POST: async ({ request }) => {
    const guard = await guardGoogleApi(request, "places");
    if (guard) return guard;
    const key = getEnv("GOOGLE_MAPS_API_KEY");
    if (!key) return json({ error: "Google Maps no está configurado en el servidor." }, 503);
    const body = await request.json().catch(() => null) as { query?: unknown } | null;
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query.length < 3 || query.length > 120) return json({ error: "Introduce un negocio o lugar válido." }, 400);
    try {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.googleMapsUri,places.primaryType,places.rating" },
        body: JSON.stringify({ textQuery: query, languageCode: "es", maxResultCount: 8 }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return json({ error: "Google Places no ha podido completar la búsqueda.", status: response.status }, 502);
      const data = await response.json() as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; websiteUri?: string; googleMapsUri?: string; primaryType?: string; rating?: number }> };
      return json({ places: (data.places ?? []).map(p => ({ id: p.id, name: p.displayName?.text, address: p.formattedAddress, lat: p.location?.latitude, lng: p.location?.longitude, website: p.websiteUri, mapsUrl: p.googleMapsUri, type: p.primaryType, rating: p.rating })) });
    } catch { return json({ error: "No se pudo contactar con Google Places." }, 502); }
  } } },
});
