import { createFileRoute } from "@tanstack/react-router";
import { getEnv } from "@/server/wayapp/env";
import { json } from "@/server/wayapp/http";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MAX_BYTES = 3000;
// Read Cloudflare Worker bindings when process.env is unavailable.
// Keep this scoped to branding to avoid affecting working chat/auth routes.
async function imageCredentials(): Promise<{ account?: string; apiToken?: string }> {
  const account = getEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = getEnv("CLOUDFLARE_AI_API_TOKEN");
  if (account && apiToken) return { account, apiToken };
  try {
    const { env } = await import("cloudflare:workers");
    const bindings = env as unknown as Record<string, unknown>;
    const read = (name: string): string | undefined => {
      const value = bindings[name];
      return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };
    return { account: account ?? read("CLOUDFLARE_ACCOUNT_ID"), apiToken: apiToken ?? read("CLOUDFLARE_AI_API_TOKEN") };
  } catch {
    return { account, apiToken };
  }
}
function validText(x: unknown, max: number): x is string { return typeof x === "string" && x.trim().length > 0 && x.length <= max; }
type QuotaLease = { key: string; lockKey: string; owner: string; url: string; token: string };
async function redis(lease: QuotaLease, command: (string | number)[]): Promise<unknown> {
  const response = await fetch(lease.url + "/pipeline", {
    method: "POST", headers: { Authorization: "Bearer " + lease.token, "Content-Type": "application/json" },
    body: JSON.stringify([command]), signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error("Redis HTTP " + response.status);
  const data = await response.json() as Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.error) throw new Error("Redis command failed");
  return data[0]?.result;
}
async function reserveQuota(request: Request): Promise<{ lease?: QuotaLease; error?: Response }> {
  const url = getEnv("KV_REST_API_URL"), token = getEnv("KV_REST_API_TOKEN");
  if (!url || !token) return { error: json({ error: "Protección de generación no configurada." }, 503) };
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("").slice(0,32);
  // v2 avoids penalizing visitors whose failed generations were counted by the old code.
  const key = "wayapp:branding:preview:v2:" + hash;
  const lease: QuotaLease = { key, lockKey: key + ":lock", owner: crypto.randomUUID(), url: url.endsWith("/") ? url.slice(0, -1) : url, token };
  try {
    if (await redis(lease, ["EXISTS", key]) === 1) return { error: json({ error: "Ya has utilizado tu vista previa gratuita de hoy. Vuelve mañana." }, 429) };
    const acquired = await redis(lease, ["SET", lease.lockKey, lease.owner, "NX", "EX", 120]);
    if (acquired !== "OK") return { error: json({ error: "Ya hay una imagen en proceso. Espera un momento." }, 429) };
    if (await redis(lease, ["EXISTS", key]) === 1) {
      await releaseQuota(lease);
      return { error: json({ error: "Ya has utilizado tu vista previa gratuita de hoy. Vuelve mañana." }, 429) };
    }
    return { lease };
  } catch {
    return { error: json({ error: "Protección de generación temporalmente no disponible." }, 503) };
  }
}
async function releaseQuota(lease: QuotaLease): Promise<void> {
  // Do not delete a different request's lock after the TTL has expired.
  try { await redis(lease, ["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, lease.lockKey, lease.owner]); } catch {}
}
async function confirmQuota(lease: QuotaLease): Promise<boolean> {
  try {
    const result = await redis(lease, ["EVAL", "if redis.call('GET',KEYS[2]) ~= ARGV[1] then return 0 end; local v=redis.call('SET',KEYS[1],'1','NX','EX',86400); redis.call('DEL',KEYS[2]); if v then return 1 else return 0 end", 2, lease.key, lease.lockKey, lease.owner]);
    return result === 1;
  } catch { return false; }
}
export const Route = createFileRoute("/api/branding/preview")({
  server: { handlers: { POST: async ({ request }) => {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return json({ error: "Solicitud demasiado grande." }, 413);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Origen no autorizado." }, 403);
    const body = await request.json().catch(()=>null) as Record<string, unknown> | null;
    if (!body || !validText(body['name'],120) || !validText(body['sector'],120) || (body['style'] && !validText(body['style'],120)) || (body['colors'] && !validText(body['colors'],120))) return json({ error: "Completa el nombre y el sector de tu marca." }, 400);
    const { account, apiToken } = await imageCredentials();
    if (!account || !apiToken) return json({ error: "El generador visual no puede leer sus credenciales en este despliegue.", diagnostic: { accountConfigured: Boolean(account), tokenConfigured: Boolean(apiToken) } }, 503);
    const reservation = await reserveQuota(request); if (reservation.error) return reservation.error;
    const lease = reservation.lease!;
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
      if (!response.ok) { console.warn("BRANDING_IMAGE_PROVIDER_STATUS", response.status); return json({ error: "Cloudflare AI rechazó la generación (HTTP " + response.status + ").", }, 502); }
      const result = await response.json() as { success?: boolean; result?: { image?: string } };
      const image = result.result?.image;
      if (!result.success || !image || image.length > 9_000_000) return json({ error: "El proveedor no devolvió una imagen válida." }, 502);
      if (!await confirmQuota(lease)) return json({ error: "No se pudo registrar la generación. Inténtalo de nuevo." }, 503);
      return json({ preview: "data:image/jpeg;base64," + image, model: MODEL, notice: "Vista previa conceptual gratuita. No es un logotipo vectorial ni un archivo final listo para uso comercial." });
    } catch { return json({ error: "El generador visual tardó demasiado o no respondió." }, 504); }
    finally { await releaseQuota(lease); }
  } } },
});
