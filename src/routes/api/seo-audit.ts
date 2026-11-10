import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "@/server/wayapp/env";
import { guardGoogleApi } from "@/server/wayapp/google-api-guard";
import { json } from "@/server/wayapp/http";

function safeWebsite(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".example") || host.endsWith(".localhost") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return null;
    return url.toString();
  } catch { return null; }
}
type Audit = { id: string; score?: number; title?: string; description?: string };
export const Route = createFileRoute("/api/seo-audit")({
  server: { handlers: { POST: async ({ request }) => {
    const guard = await guardGoogleApi(request, "pagespeed");
    if (guard) return guard;
    const key = getEnv("PAGESPEED_API_KEY");
    if (!key) return json({ error: "PageSpeed Insights no está configurado." }, 503);
    const body = await request.json().catch(() => null) as { url?: unknown } | null;
    const website = typeof body?.url === "string" && body.url.length <= 500 ? safeWebsite(body.url) : null;
    if (!website) return json({ error: "Introduce una URL pública válida (https://...)." }, 400);
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", website);
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("strategy", "mobile");
    for (const category of ["performance", "seo", "accessibility", "best-practices"]) endpoint.searchParams.append("category", category);
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) return json({ error: "PageSpeed no pudo analizar esta web.", status: response.status }, 502);
      const data = await response.json() as { lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, Audit> }; loadingExperience?: unknown };
      const categories = data.lighthouseResult?.categories ?? {};
      const audits = data.lighthouseResult?.audits ?? {};
      const issues = Object.entries(audits).filter(([, a]) => typeof a.score === "number" && a.score < 0.9 && a.title).slice(0, 12).map(([id, a]) => ({ id, title: a.title, description: a.description?.replace(/\[[^\]]*\]\([^)]*\)/g, "").slice(0, 350), score: a.score }));
      return json({ website, source: "Google PageSpeed Insights · Lighthouse móvil", scores: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.score == null ? null : Math.round(v.score * 100)])), issues });
    } catch { return json({ error: "La auditoría ha tardado demasiado o no está disponible." }, 502); }
  } } },
});
