import { logDatabaseError, query } from "./db";
import { hasCommercialIntent } from "./commercial-intent";
import { extraAllowedOrigins, getEnv } from "./env";
import { isLocalHost, json } from "./http";
import { SYSTEM_PROMPT } from "./prompt";
import { offTopicReply } from "./topic-guard";
import { isNewConversationOverLimit, isOverLimit, reserveGroqQuotaDetailed, reconcileGroqQuota, releaseGroqQuota, reserveFallbackQuota, settleFallbackQuota, type FallbackReservation } from "./rate-limit";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 30;
const MAX_VISITOR_MESSAGES = 40;
const MIN_MESSAGE_INTERVAL_MS = 1500;
const MAX_USER_CHARS = 2_000;
const MAX_ASSISTANT_CHARS = 8_000;
const MAX_OUTPUT_TOKENS = 600;
const MAX_ESTIMATED_REQUEST_TOKENS = 3500;
const EXPECTED_OUTPUT_RESERVATION = 600;
// Conservative character-based reservation, reconciled with Groq usage metadata.
function estimateTokens(text: string): number { return Math.ceil(new TextEncoder().encode(text).length / 3); }
/** Extract only explicit commercial details from visitor turns; no model call. */
function visitorBrief(history: ChatMessage[], latest: ChatMessage): string {
  const visitor = [...history,latest].filter(m=>m.role==="user").map(m=>m.content).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const facts: string[] = [];
  if (/concesionario|venta de coches|vender coches/.test(visitor)) facts.push("Sector declarado: concesionario o venta de coches");
  else if (/restaurante|hosteleria/.test(visitor)) facts.push("Sector mencionado: restauración");
  else if (/inmobiliaria/.test(visitor)) facts.push("Sector mencionado: inmobiliaria");
  if (/coches de lujo|vehiculos de lujo|coches premium/.test(visitor)) facts.push("Segmento mencionado: vehículos de lujo");
  if (/tienda online|ecommerce|e-commerce/.test(visitor)) facts.push("Necesidad mencionada: tienda online");
  else if (/pagina web|sitio web|necesito una web|quiero una web|web profesional/.test(visitor)) facts.push("Necesidad mencionada: página web");
  if (/redisen|renovar mi web/.test(visitor)) facts.push("Objetivo mencionado: rediseño");
  return facts.slice(0,3).join("\n");
}
function compactContext(history: ChatMessage[]): ChatMessage[] {
  return history.slice(-6).map(m=>m.role==="assistant"?{...m,content:m.content.slice(0,300)}:m);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * El chat vive ahora en el mismo origen que la web, así que el navegador envía `Origin` igual al
 * del propio sitio. Aceptamos ese origen, los de WAYAPP_ALLOWED_ORIGINS y, solo en local, localhost.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const parsed = new URL(origin);
    const allowed = new Set([requestUrl.origin, ...extraAllowedOrigins()]);
    if (isLocalHost(requestUrl)) {
      allowed.add("http://localhost:3000").add("http://127.0.0.1:3000");
      allowed.add("http://localhost:5173").add("http://127.0.0.1:5173");
    }
    if (parsed.protocol !== "https:" && !isLocalHost(parsed)) return false;
    return allowed.has(parsed.origin);
  } catch {
    return false;
  }
}

export function validateMessages(value: unknown): ChatMessage[] | null {
  if (!value || typeof value !== "object" || !("messages" in value)) return null;
  const messages = (value as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return null;
  const clean: ChatMessage[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object") return null;
    const message = item as { role?: unknown; content?: unknown };
    if (message.role !== "user" && message.role !== "assistant") return null;
    if (typeof message.content !== "string" || !message.content.trim()) return null;
    const limit = message.role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    if (message.content.length > limit) return null;
    clean.push({ role: message.role, content: message.content.trim() });
  }
  return clean.at(-1)?.role === "user" ? clean : null;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newVisitorToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function handleChat(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return json({ error: "Tipo de contenido no permitido." }, 415);
  }

  // Antiabuso primero: si Redis no responde, NO se llama al proveedor de IA (falla cerrado).
  try {
    if (await isOverLimit(clientIp(request))) {
      return json({ error: "Has enviado demasiadas consultas. Espera unos minutos." }, 429);
    }
  } catch {
    return json({ error: "El servicio está temporalmente protegido. Inténtalo más tarde." }, 503);
  }

  const groqKey = getEnv("GROQ_API_KEY");
  const anyProvider = !!groqKey || (getEnv("WAYAPP_GEMINI_ENABLED") === "true" && !!getEnv("GEMINI_API_KEY")) || (getEnv("WAYAPP_CLOUDFLARE_ENABLED") === "true" && !!getEnv("CLOUDFLARE_ACCOUNT_ID") && !!getEnv("CLOUDFLARE_AI_API_TOKEN"));
  if (!anyProvider) return json({ error: "El servicio de IA aún no está configurado." }, 503);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "La solicitud es demasiado grande." }, 413);
  }
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "No se ha podido leer la solicitud." }, 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          return json({ error: "La solicitud es demasiado grande." }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return json({ error: "No se ha podido leer la solicitud." }, 400);
  }

  const messages = validateMessages(body);
  if (!messages) return json({ error: "El formato de la conversación no es válido." }, 400);

  const commercialIntent = hasCommercialIntent(messages.at(-1)?.content ?? "");
  let showAuditOffer = commercialIntent;
  let visitorMessageCount = 1;
  let priorCommercialCount = 0;
  const requestedId = (body as { conversationId?: unknown }).conversationId;
  if (
    requestedId !== undefined &&
    requestedId !== null &&
    (typeof requestedId !== "string" || !UUID_RE.test(requestedId))
  ) {
    return json({ error: "Identificador de conversación no válido." }, 400);
  }

  // Identidad anónima del visitante: token aleatorio en cookie HttpOnly; en BD solo su hash.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const visitorMatch = cookieHeader.match(/(?:^|;[ ]*)wayapp_visitor=([a-f0-9]{64})(?:;|$)/i);
  const visitorToken = visitorMatch?.[1] ?? newVisitorToken();
  const visitorHash = await sha256Hex(visitorToken);

  let conversationId: string;
  let history: ChatMessage[] = [];
  try {
    if (typeof requestedId === "string") {
      const existing = await query<{ id: string }>(
        "UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND visitor_token_hash = $2 RETURNING id",
        [requestedId, visitorHash],
      );
      const found = existing.rows[0];
      if (!found) return json({ error: "Conversación no encontrada." }, 404);
      conversationId = found.id;
      const stats = await query<{ total: string; last_at: string | null }>(
        "SELECT count(*) FILTER (WHERE role = 'user')::text AS total, max(created_at) FILTER (WHERE role = 'user')::text AS last_at FROM messages WHERE conversation_id = $1",
        [conversationId],
      );
      visitorMessageCount = Number(stats.rows[0]?.total ?? 0) + 1;
      if (visitorMessageCount > MAX_VISITOR_MESSAGES) {
        return json({ error: "Esta conversación ha llegado a 40 mensajes. Inicia otra o solicita una auditoría." }, 429);
      }
      {
        const previous = await query<{ content: string }>(
          "SELECT content FROM messages WHERE conversation_id = $1 AND role = 'user' ORDER BY id DESC LIMIT 40",
          [conversationId],
        );
        priorCommercialCount = previous.rows.filter((row) => hasCommercialIntent(row.content)).length;
        showAuditOffer = commercialIntent && priorCommercialCount < 3;
      }
      const lastAt = stats.rows[0]?.last_at;
      if (lastAt && Date.now() - new Date(lastAt).getTime() < MIN_MESSAGE_INTERVAL_MS) {
        return json({ error: "Espera un momento antes de enviar otro mensaje." }, 429);
      }
    } else {
      try {
        if (await isNewConversationOverLimit()) {
          return json({ error: "El servicio está recibiendo muchas conversaciones nuevas. Inténtalo en un minuto." }, 429);
        }
      } catch {
        return json({ error: "No se pueden iniciar conversaciones nuevas temporalmente." }, 503);
      }
      const title =
        messages.find((m) => m.role === "user")?.content.slice(0, 120) ?? "Nueva conversación";
      const created = await query<{ id: string }>(
        "INSERT INTO conversations (title, visitor_token_hash) VALUES ($1, $2) RETURNING id",
        [title, visitorHash],
      );
      const row = created.rows[0];
      if (!row) throw new Error("conversation insert returned no row");
      conversationId = row.id;
    }
    // Commercial handoff: three well-timed invitations, no repeated AI calls after 20 turns.
    // An informational visitor is never pushed into a sales pitch prematurely.
    const hasBusinessInterest = commercialIntent || priorCommercialCount > 0;
    if (hasBusinessInterest && [6, 10, 15].includes(visitorMessageCount)) showAuditOffer = true;
    if (visitorMessageCount >= MAX_VISITOR_MESSAGES && hasBusinessInterest) {
      const message = "Gracias por contarme tanto sobre tu negocio. Para darte una orientación personalizada, lo mejor es que el equipo de WAY UP continúe contigo. Puedes solicitar una auditoría gratuita desde la sección de contacto.";
      await query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)", [conversationId, messages.at(-1)!.content, message]);
      const encoder = new TextEncoder();
      const payload = [{ type: "delta", content: message }, { type: "audit_offer" }, { type: "done" }]
        .map((event) => JSON.stringify(event)).join("\n") + "\n";
      const secure = new URL(request.url).protocol === "https:";
      return new Response(encoder.encode(payload), {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-WayApp-Conversation-Id": conversationId,
          "Set-Cookie": `wayapp_visitor=${visitorToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` + (secure ? "; Secure" : ""),
        },
      });
    }
    const prior = await query<ChatMessage>(
      "SELECT role, content FROM (SELECT id, role, content FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 29) recent ORDER BY id ASC",
      [conversationId],
    );
    history = prior.rows;
    // Persist only after the quota check succeeds.
  } catch (error) {
    logDatabaseError("conversation persistence failed", error);
    return json({ error: "No se ha podido guardar la conversación. Inténtalo más tarde." }, 503);
  }

  // Unambiguous off-topic requests are answered locally: no provider tokens, no generic advice.
  // Persist both turns so the same conversation remains auditable and coherent.
  const scopedReply = offTopicReply(messages.at(-1)!.content);
  if (scopedReply) {
    try {
      await query(
        "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)",
        [conversationId, messages.at(-1)!.content, scopedReply],
      );
      await query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
    } catch (error) {
      logDatabaseError("scoped reply persistence failed", error);
      return json({ error: "No se ha podido guardar la conversación." }, 503);
    }
    const events = [{ type: "delta", content: scopedReply }, { type: "done" }];
    const secure = new URL(request.url).protocol === "https:";
    return new Response(events.map(event => JSON.stringify(event)).join("\n") + "\n", {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-WayApp-Conversation-Id": conversationId,
        "Set-Cookie": `wayapp_visitor=${visitorToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` + (secure ? "; Secure" : ""),
      },
    });
  }

  // Preserve the system instructions and latest question; trim oldest history first.
  const latestMessage = messages.at(-1)!;
  const context = compactContext(history);
  const brief = visitorBrief(history,latestMessage);
  const memoryMessage: ChatMessage[] = brief ? [{role:"system" as "user",content:"Resumen determinista de datos mencionados (no asumir hechos adicionales):\n"+brief}] : [];
  // The brief is an instruction-side note, not an additional visitor turn.
  const instructions = brief ? SYSTEM_PROMPT + "\n\nFICHA DE CONTEXTO (solo datos mencionados):\n" + brief : SYSTEM_PROMPT;
  const estimateRequest = () => estimateTokens(instructions) +
    estimateTokens(latestMessage.content) +
    context.reduce((sum, item) => sum + estimateTokens(item.content) + 8, 0) +
    EXPECTED_OUTPUT_RESERVATION + 128;
  while (context.length && estimateRequest() > MAX_ESTIMATED_REQUEST_TOKENS) context.shift();
  const reservedTokens = estimateRequest();
  if (reservedTokens > MAX_ESTIMATED_REQUEST_TOKENS) {
    return json({ error: "La consulta supera el límite de contexto permitido." }, 413);
  }
  // Reserve per provider at dispatch time, not globally against Groq.
  // This allows a fallback when Groq has exhausted its own allowance.
  let reservation: Awaited<ReturnType<typeof reserveGroqQuotaDetailed>>["reservation"] = null;
  let fallbackReservation: FallbackReservation | null = null;

  try {
    await query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [conversationId, latestMessage.content]);
  } catch (error) {
    logDatabaseError("visitor message persistence failed", error);
    return json({ error: "No se ha podido guardar el mensaje." }, 503);
  }

  // Provider failover is opt-in. Never switch after a text delta is emitted.
  const relayUrl = getEnv("WAYAPP_LOVABLE_RELAY_URL");
  const relaySecret = getEnv("WAYAPP_RELAY_SECRET");
  const fallbackEnabled = getEnv("WAYAPP_FALLBACK_ENABLED") === "true" && !!relayUrl && !!relaySecret;
  const geminiKey = getEnv("GEMINI_API_KEY");
  // Opt-in until the preview has passed integration tests. No paid fallback by default.
  const geminiEnabled = getEnv("WAYAPP_GEMINI_ENABLED") === "true" && !!geminiKey;
  const cfAccount = getEnv("CLOUDFLARE_ACCOUNT_ID");
  const cfToken = getEnv("CLOUDFLARE_AI_API_TOKEN");
  const cloudflareEnabled = getEnv("WAYAPP_CLOUDFLARE_ENABLED") === "true" && !!cfAccount && !!cfToken;
  const primary = getEnv("WAYAPP_PRIMARY_PROVIDER") === "lovable" && fallbackEnabled ? "lovable" : "groq";
  const providers: Array<"groq" | "gemini" | "cloudflare" | "lovable"> = primary === "lovable" ? ["lovable", "groq", "gemini", "cloudflare"] : ["groq", "gemini", "cloudflare", "lovable"];
  let upstream: Response | undefined;
  let selectedProvider: "groq" | "gemini" | "cloudflare" | "lovable" = primary;
  let groqReserved = false;
  let upstreamError = 502;
  for (const provider of providers) {
    if (provider === "lovable" && !fallbackEnabled) continue;
    if (provider === "gemini" && !geminiEnabled) continue;
    if (provider === "cloudflare" && !cloudflareEnabled) continue;
    if (provider === "groq" && !groqKey) continue;
    try {
      if (provider === "groq") {
        const decision = await reserveGroqQuotaDetailed(reservedTokens);
        if (!decision.reservation) continue;
        reservation = decision.reservation;
        groqReserved = true;
      } else if (provider === "gemini" || provider === "cloudflare") {
        fallbackReservation = await reserveFallbackQuota(provider, reservedTokens);
        if (!fallbackReservation) continue;
      }
      const isGroq = provider === "groq";
      const isGemini = provider === "gemini";
      const isCloudflare = provider === "cloudflare";
      const response = await fetch(isGroq ? "https://api.groq.com/openai/v1/chat/completions" : isGemini ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" : isCloudflare ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccount!)}/ai/run/${getEnv("WAYAPP_CLOUDFLARE_MODEL") ?? "@cf/meta/llama-3.1-8b-instruct"}` : relayUrl!, {
        method: "POST",
        headers: (isGroq || isGemini || isCloudflare)
          ? { Authorization: `Bearer ${isGroq ? groqKey : isGemini ? geminiKey : cfToken}`, "Content-Type": "application/json" }
          : { Authorization: `Bearer ${relaySecret}`, "Content-Type": "application/json" },
        body: JSON.stringify(isGroq ? {
          model: getEnv("GROQ_MODEL") ?? "openai/gpt-oss-120b",
          messages: [{ role: "system", content: instructions }, ...context, latestMessage],
          stream_options: { include_usage: true }, stream: true,
          temperature: 0.6, max_completion_tokens: MAX_OUTPUT_TOKENS,
          include_reasoning: false, reasoning_effort: "low",
        } : isCloudflare ? {
          messages: [{ role: "system", content: instructions }, ...context, latestMessage],
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: false,
        } : isGemini ? {
          model: getEnv("GEMINI_MODEL") ?? "gemini-2.5-flash",
          messages: [{ role: "system", content: instructions }, ...context, latestMessage],
          stream: true, temperature: 0.6, max_tokens: MAX_OUTPUT_TOKENS,
        } : {
          instructions: instructions.slice(0, 24000),
          messages: [...history.slice(-29), latestMessage].map(m => ({
            role: m.role, content: m.content.slice(0, 2000),
          })),
          model: "openai/gpt-6-astra",
        }),
        signal: AbortSignal.timeout(isGroq ? 20000 : isGemini || isCloudflare ? 25000 : 65000),
        cache: "no-store",
      });
      if (response.ok && response.body) {
        if (isCloudflare) {
          // Workers AI REST returns a JSON envelope, unlike Groq/Gemini SSE.
          const envelope = await response.json() as { success?: boolean; result?: { response?: string } };
          const answer = envelope.result?.response;
          if (!envelope.success || typeof answer !== "string" || !answer.trim()) {
            upstreamError = 502;
            continue;
          }
          const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(0, 8000) } }] })}\n\ndata: [DONE]\n\n`;
          upstream = new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
        } else upstream = response;
        selectedProvider = provider;
        break;
      }
      upstreamError = response.status;
      await response.body?.cancel().catch(() => undefined);
      if (provider === "groq" && reservation) {
        await reconcileGroqQuota(reservation, reservedTokens).catch(() => undefined);
        reservation = null; groqReserved = false;
      }
      if (fallbackReservation) {
        await settleFallbackQuota(fallbackReservation, reservedTokens).catch(() => undefined);
        fallbackReservation = null;
      }
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch {
      upstreamError = 504;
      if (provider === "groq" && reservation) {
        await reconcileGroqQuota(reservation, reservedTokens).catch(() => undefined);
        reservation = null; groqReserved = false;
      }
      if (fallbackReservation) {
        await settleFallbackQuota(fallbackReservation, reservedTokens).catch(() => undefined);
        fallbackReservation = null;
      }
    }
  }
  if (!upstream || !upstream.body) {
    return json({ error: "Ahora mismo no puedo responder. Puedes solicitar una auditoría gratuita desde el formulario de contacto." }, upstreamError === 429 ? 429 : 502);
  }
  // If Lovable answers, Groq did not generate tokens. Release the Groq reservation.


  const encoder = new TextEncoder();
  const upstreamBody = upstream.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let actualTokens: number | undefined;
      const emit = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (selectedProvider === "lovable") {
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed) as { type?: string; content?: string; message?: string };
                if (event.type === "delta" && typeof event.content === "string") {
                  assistantText += event.content;
                  emit({ type: "delta", content: event.content });
                } else if (event.type === "error") {
                  throw new Error("Lovable relay error");
                }
              } catch (error) {
                if (error instanceof Error && error.message === "Lovable relay error") throw error;
              }
              continue;
            }
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const chunk = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
                usage?: { total_tokens?: number };
              };
              if (typeof chunk.usage?.total_tokens === "number") actualTokens = chunk.usage.total_tokens;
              const text = chunk.choices?.[0]?.delta?.content;
              if (typeof text === "string" && text) {
                assistantText += text;
                emit({ type: "delta", content: text });
              }
            } catch {
              /* Se ignoran trozos malformados del proveedor; nunca se reenvían en bruto. */
            }
          }
        }
        if (assistantText.trim()) {
          await query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)", [
            conversationId,
            assistantText.slice(0, MAX_ASSISTANT_CHARS),
          ]);
          await query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
        }
        if (showAuditOffer) emit({ type: "audit_offer" });
        emit({ type: "done" });
        controller.close();
      } catch (error) {
        logDatabaseError("assistant persistence or stream failed", error);
        emit({ type: "error", message: "La respuesta se ha interrumpido. Inténtalo de nuevo." });
        controller.close();
      } finally {
        // On interrupted streams keep the conservative reservation; never undercount.
        const accountedTokens = actualTokens ?? Math.max(reservedTokens, estimateTokens(assistantText) + estimateTokens(instructions));
        if (groqReserved && reservation) await reconcileGroqQuota(reservation, accountedTokens).catch(() => undefined);
        if (fallbackReservation) await settleFallbackQuota(fallbackReservation, accountedTokens).catch(() => undefined);
        reader.releaseLock();
      }
    },
  });

  const secure = new URL(request.url).protocol === "https:";
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
      "X-WayApp-Conversation-Id": conversationId,
      "Set-Cookie":
        `wayapp_visitor=${visitorToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` +
        (secure ? "; Secure" : ""),
    },
  });
}
