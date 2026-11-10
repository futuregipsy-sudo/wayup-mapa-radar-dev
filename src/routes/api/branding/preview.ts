import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "@/server/wayapp/env";
import { json } from "@/server/wayapp/http";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MAX_BYTES = 3000;
function validText(x: unknown, max: number): x is string { return typeof x === "string" && x.trim().length > 0 && x.length <= max; }
async function quota(request: Request): Promise<Response | null> {
  const url = getEnv("KV_REST_API_URL"), token = getEnv("KV_REST_API_TOKEN");
  if (!url || !token) return json({ error: "Protección de generación no configurada." }, 503);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = "wayapp:branding:preview:" + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("").slice(0,32);
  try {
    const response = await fetch(url.replace(/\/$/,"") + "/pipeline", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR",key],["EXPIRE",key,86400,"NX"]]), signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return json({ error: "No se pudo verificar el límite de generación." }, 503);
    const data = await response.json() as Array<{ result?: number; error?: string }>;
    if (!Array.isArray(data) || data.some(x=>x.error) || typeof data[0]?.result !== "number") return json({ error: "Protección de generación temporalmente no disponible." }, 503);
    if (data[0].result > 1) return json({ error: "Ya has utilizado tu vista previa gratuita de hoy. Vuelve mañana." }, 429);
    return null;
  } catch { return json({ error: "Protección de generación temporalmente no disponible." }, 503); }
}
export const Route = createFileRoute("/api/branding/preview")({
  server: { handlers: { POST: async ({ request }) => {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "Solicitud demasiado grande." }, 413);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Origen no autorizado." }, 403);
    const body = await request.json().catch(()=>null) as Record<string, unknown> | null;
    if (!body || !validText(body['name'],120) || !validText(body['sector'],120) || (body['style'] && !validText(body['style'],120)) || (body['colors'] && !validText(body['colors'],120))) return json({ error: "Completa el nombre y el sector de tu marca." }, 400);
    const account = getEnv("CLOUDFLARE_ACCOUNT_ID"), apiToken = getEnv("CLOUDFLARE_AI_API_TOKEN");
    if (!account || !apiToken) return json({ error: "El generador visual aún no está configurado en Cloudflare." }, 503);
    const guard = await quota(request); if (guard) return guard;
    const concept = body['concept'] === "symbol" ? "minimal iconic symbol" : body['concept'] === "energy" ? "expressive dynamic abstract mark" : "refined monogram combining the brand initials";
    const prompt = [
      "Professional brand identity concept board, single square image, polished premium visual design, clean minimalist composition, bold symbolic mark, carefully balanced shapes, sophisticated brand aesthetic.",
      "Brand:", body['name'], "Industry:", body['sector'], "Creative direction:", concept, "Style:", body['style'] || "modern elegant", "Palette:", body['colors'] || "deep cobalt blue and ivory",
      "Present one coherent creative direction with abstract symbol and supporting brand moodboard elements. Avoid tiny text, watermarks, fake trademarks and photo-realistic mockup clutter. This is a conceptual preview, not a production-ready vector logo."
    ].join(" ").slice(0,1800);
    try {
      const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(account) + "/ai/run/" + MODEL, {
        method: "POST", headers: { Authorization: "Bearer " + apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, steps: 4 }), signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) { console.warn("BRANDING_IMAGE_PROVIDER_STATUS", response.status); return json({ error: "No se pudo generar la vista previa. Inténtalo más tarde." }, 502); }
      const result = await response.json() as { success?: boolean; result?: { image?: string } };
      const image = result.result?.image;
      if (!result.success || !image || image.length > 9_000_000) return json({ error: "El proveedor no devolvió una imagen válida." }, 502);
      return json({ preview: "data:image/jpeg;base64," + image, model: MODEL, notice: "Vista previa conceptual gratuita. No es un logotipo vectorial ni un archivo final listo para uso comercial." });
    } catch { return json({ error: "El generador visual tardó demasiado o no respondió." }, 504); }
  } } },
});
