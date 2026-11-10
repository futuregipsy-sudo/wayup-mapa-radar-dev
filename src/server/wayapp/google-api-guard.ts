import { getEnv } from "./env";

/** Shared Redis quota for paid Google API requests. Fail closed if unavailable. */
export async function guardGoogleApi(request: Request, kind: "places" | "pagespeed"): Promise<Response | null> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return Response.json({ error: "Se requiere JSON." }, { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 2048) return Response.json({ error: "Petición demasiado grande." }, { status: 413 });
  const url = (getEnv("KV_REST_API_URL") ?? getEnv("UPSTASH_REDIS_REST_URL"))?.replace(/\/$/, "");
  const token = getEnv("KV_REST_API_TOKEN") ?? getEnv("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return Response.json({ error: "Protección de cuota no disponible." }, { status: 503 });
  const ip = (request.headers.get("CF-Connecting-IP") ?? "unknown").replace(/[^a-zA-Z0-9:._-]/g, "_");
  const limit = kind === "pagespeed" ? 5 : 15;
  const key = `wayapp:google:${kind}:${ip}`;
  const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600); end; return n";
  try {
    const res = await fetch(url + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify([["EVAL", script, "1", key]]), signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) throw new Error("Redis unavailable");
    const data = await res.json() as Array<{ result?: unknown; error?: string }>;
    if (data[0]?.error || !Number.isFinite(Number(data[0]?.result))) throw new Error("Redis invalid response");
    if (Number(data[0]?.result) > limit) return Response.json({ error: "Has alcanzado el límite temporal de consultas. Inténtalo más tarde." }, { status: 429, headers: { "Retry-After": "600" } });
    return null;
  } catch (error) {
    console.warn("WAYAPP_GOOGLE_QUOTA_ERROR", { kind, category: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "redis_unavailable" });
    return Response.json({ error: "No se pudo comprobar el límite de consultas. Inténtalo de nuevo en unos segundos.", code: "GOOGLE_QUOTA_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "5" } });
  }
}
