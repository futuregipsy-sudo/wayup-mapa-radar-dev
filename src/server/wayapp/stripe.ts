import { getEnv } from "./env";
import { isAllowedOrigin } from "./chat";
import { json } from "./http";
import { requireAdmin } from "./admin-auth";

const SERVICES = {
  marketing: "STRIPE_PRICE_MARKETING",
  social: "STRIPE_PRICE_SOCIAL",
  web: "STRIPE_PRICE_WEB",
} as const;

function stripeKey(): string | undefined {
  const key = getEnv("STRIPE_SECRET_KEY");
  return key?.startsWith("sk_test_") || key?.startsWith("sk_live_") ? key : undefined;
}

function safeRedirect(request: Request): string | null {
  const origin = new URL(request.url).origin;
  return origin.startsWith("https://") || origin.startsWith("http://localhost:") ? origin : null;
}

async function createSession(params: URLSearchParams, key: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: params.toString(),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return json({ error: "No se ha podido contactar con el proveedor de pagos." }, 502);
  }
  if (!response.ok) return json({ error: "Stripe no ha podido preparar el pago." }, 502);
  const result = await response.json() as { url?: unknown };
  if (typeof result.url !== "string" || !result.url.startsWith("https://checkout.stripe.com/")) {
    return json({ error: "La sesión de pago no es válida." }, 502);
  }
  return json({ url: result.url });
}

/** Public checkout: price IDs are chosen exclusively by the server, never by visitors. */
export async function handleFixedCheckout(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Formato no válido." }, 415);
  const key = stripeKey();
  const origin = safeRedirect(request);
  if (!key || !origin) return json({ error: "Los pagos todavía no están habilitados." }, 503);
  let data: unknown;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 1024) return json({ error: "Solicitud demasiado grande." }, 413);
    data = await request.json();
  } catch { return json({ error: "Solicitud no válida." }, 400); }
  const service = (data as { service?: unknown } | null)?.service;
  if (typeof service !== "string" || !Object.hasOwn(SERVICES, service)) return json({ error: "Servicio desconocido." }, 400);
  const price = getEnv(SERVICES[service as keyof typeof SERVICES]);
  if (!price?.startsWith("price_")) return json({ error: "Este servicio requiere confirmar presupuesto antes de pagar." }, 503);
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/servicios-y-tarifas?checkout=success`,
    cancel_url: `${origin}/servicios-y-tarifas?checkout=cancel`,
    "metadata[service]": service,
  });
  return createSession(params, key);
}

/** Custom quotes: only a verified WAYUP administrator may set the amount. */
export async function handleQuoteCheckout(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (!admin) return json({ error: "No autorizado." }, 401);
  if (!isAllowedOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Formato no válido." }, 415);
  const key = stripeKey();
  const origin = safeRedirect(request);
  if (!key || !origin) return json({ error: "Stripe no está configurado." }, 503);
  let data: unknown;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return json({ error: "Solicitud demasiado grande." }, 413);
    data = await request.json();
  } catch { return json({ error: "Solicitud no válida." }, 400); }
  if (!data || typeof data !== "object") return json({ error: "Solicitud no válida." }, 400);
  const { description, amountCents, email, reference } = data as Record<string, unknown>;
  if (typeof description !== "string" || description.trim().length < 5 || description.length > 180 ||
      typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 10000000 ||
      (email !== undefined && email !== "" && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) ||
      typeof reference !== "string" || !/^[a-zA-Z0-9_-]{3,60}$/.test(reference)) {
    return json({ error: "Presupuesto no válido: descripción, importe en céntimos y referencia obligatorios." }, 400);
  }
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": description.trim(),
    "line_items[0][quantity]": "1",
    client_reference_id: reference,
    success_url: `${origin}/servicios-y-tarifas?checkout=success`,
    cancel_url: `${origin}/servicios-y-tarifas?checkout=cancel`,
    "metadata[created_by]": admin.id,
    "metadata[quote_reference]": reference,
  });
  if (typeof email === "string" && email.trim()) params.set("customer_email", email.trim());
  return createSession(params, key);
}
