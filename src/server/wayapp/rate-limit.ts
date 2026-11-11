import { getEnv } from "./env";

const WINDOW_SECONDS = 600;
const MAX_REQUESTS_PER_WINDOW = 20;

/**
 * Límite distribuido por IP en Upstash Redis (REST). Devuelve `true` si la IP se ha pasado del límite.
 * Lanza si Redis no está disponible: el llamador debe FALLAR CERRADO y no llamar al proveedor de IA.
 */
export async function isOverLimit(ip: string): Promise<boolean> {
  const url = (getEnv("KV_REST_API_URL") ?? getEnv("UPSTASH_REDIS_REST_URL"))?.replace(/\/$/, "");
  const token = getEnv("KV_REST_API_TOKEN") ?? getEnv("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Rate limiter is not configured");

  const key = `wayapp:chat:ip:${ip.replace(/[^a-zA-Z0-9:._-]/g, "_")}`;
  const script =
    "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n";
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["EVAL", script, "1", key, String(WINDOW_SECONDS)]]),
    signal: AbortSignal.timeout(2500),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Rate limiter unavailable");
  const result = (await response.json()) as Array<{ result?: number; error?: string }>;
  const count = Number(result?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("Invalid rate limiter response");
  return count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Distributed, atomic quota for new conversations: 60 per rolling minute.
 * Shared by every Worker instance, unlike an in-memory counter.
 */
export async function isNewConversationOverLimit(): Promise<boolean> {
  const url = (getEnv("KV_REST_API_URL") ?? getEnv("UPSTASH_REDIS_REST_URL"))?.replace(/\/$/, "");
  const token = getEnv("KV_REST_API_TOKEN") ?? getEnv("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Rate limiter is not configured");
  const key = "wayapp:conversations:global";
  const script =
    "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60); end; return n";
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["EVAL", script, "1", key]]),
    signal: AbortSignal.timeout(2500),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Conversation quota unavailable");
  const result = (await response.json()) as Array<{ result?: number; error?: string }>;
  if (result?.[0]?.error) throw new Error("Conversation quota unavailable");
  const count = Number(result?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("Invalid conversation quota response");
  return count > 60;
}

/**
 * Global Groq guard. Requests and confirmed usage are separate from temporary
 * in-flight reservations. Every reservation has a unique Redis key with TTL.
 * The provider remains the authority for actual model-specific limits.
 */
const QUOTAS = { minuteRequests: 28, dayRequests: 950, minuteTokens: 7800, dayTokens: 190000, concurrent: 3 };
const PREFIX = "wayapp:groq:v3:";
function redisCredentials(): { url: string; token: string } {
  const url = (getEnv("KV_REST_API_URL") ?? getEnv("UPSTASH_REDIS_REST_URL"))?.replace(/\/$/, "");
  const token = getEnv("KV_REST_API_TOKEN") ?? getEnv("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Global AI quota is not configured");
  return { url, token };
}
async function redisEval(script: string, keys: string[], args: string[]): Promise<number> {
  const { url, token } = redisCredentials();
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["EVAL", script, String(keys.length), ...keys, ...args]]),
    signal: AbortSignal.timeout(2500),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Global AI quota unavailable");
  const results = await response.json() as Array<{ result?: unknown; error?: string }>;
  if (results?.[0]?.error) throw new Error("Global AI quota Redis error");
  const result = Number(results?.[0]?.result);
  if (!Number.isFinite(result)) throw new Error("Invalid global AI quota response");
  return result;
}
const RESERVE_SCRIPT = `
local estimated=tonumber(ARGV[1])
local limits={tonumber(ARGV[2]),tonumber(ARGV[3]),tonumber(ARGV[4]),tonumber(ARGV[5]),tonumber(ARGV[6])}
local now=tonumber(redis.call('TIME')[1])
local expired=redis.call('ZRANGEBYSCORE',KEYS[5],'-inf',now)
if #expired>0 then
 redis.call('ZREM',KEYS[5],unpack(expired))
 redis.call('HDEL',KEYS[6],unpack(expired))
end
local pending=0
local active=redis.call('ZRANGE',KEYS[5],0,-1)
for _,id in ipairs(active) do pending=pending+tonumber(redis.call('HGET',KEYS[6],id) or '0') end
local reqMin=tonumber(redis.call('GET',KEYS[1]) or '0')
local reqDay=tonumber(redis.call('GET',KEYS[2]) or '0')
local tokenMin=tonumber(redis.call('GET',KEYS[3]) or '0')
local tokenDay=tonumber(redis.call('GET',KEYS[4]) or '0')
if reqMin+1>limits[1] then return 1 end
if reqDay+1>limits[2] then return 2 end
if tokenMin+pending+estimated>limits[3] then return 3 end
if tokenDay+pending+estimated>limits[4] then return 4 end
if #active+1>limits[5] then return 5 end
if redis.call('HEXISTS',KEYS[6],KEYS[7])==1 then return 6 end
redis.call('HSET',KEYS[6],KEYS[7],estimated)
redis.call('ZADD',KEYS[5],now+120,KEYS[7])
redis.call('EXPIRE',KEYS[5],180)
redis.call('EXPIRE',KEYS[6],180)
for i=1,2 do
 redis.call('INCR',KEYS[i])
 if redis.call('TTL',KEYS[i])<0 then redis.call('EXPIRE',KEYS[i],i==1 and 60 or 86400) end
end
return 0
`;
const FINISH_SCRIPT = `
local reserved=tonumber(redis.call('HGET',KEYS[6],KEYS[7]) or '0')
if reserved<=0 then return 0 end
redis.call('HDEL',KEYS[6],KEYS[7])
redis.call('ZREM',KEYS[5],KEYS[7])
local usage=math.max(0,tonumber(ARGV[1]))
if usage>0 then
 for i=3,4 do
  redis.call('INCRBY',KEYS[i],usage)
  if redis.call('TTL',KEYS[i])<0 then redis.call('EXPIRE',KEYS[i],i==3 and 60 or 86400) end
 end
end
return 1
`;
const KEYS = [PREFIX+"req:min",PREFIX+"req:day",PREFIX+"tokens:min",PREFIX+"tokens:day",PREFIX+"leases",PREFIX+"lease-estimates"];
export type GroqReservation = { id: string; estimatedTokens: number };
export type GroqQuotaDecision = { reservation: GroqReservation | null; reason: "minute_requests" | "day_requests" | "minute_tokens" | "day_tokens" | "concurrent" | "duplicate" | "invalid_estimate" | null };
export async function reserveGroqQuotaDetailed(estimatedTokens: number): Promise<GroqQuotaDecision> {
  if (!Number.isInteger(estimatedTokens) || estimatedTokens < 1 || estimatedTokens > QUOTAS.minuteTokens) {
    return { reservation: null, reason: "invalid_estimate" };
  }
  const id = crypto.randomUUID();
  const q = QUOTAS;
  const result = await redisEval(RESERVE_SCRIPT, [...KEYS, PREFIX + "reservation:" + id],
    [String(estimatedTokens), String(q.minuteRequests), String(q.dayRequests), String(q.minuteTokens), String(q.dayTokens), String(q.concurrent)]);
  if (result === 0) return { reservation: { id, estimatedTokens }, reason: null };
  const reasons = ["", "minute_requests", "day_requests", "minute_tokens", "day_tokens", "concurrent", "duplicate"] as const;
  if (result < 1 || result > 6) throw new Error("Unexpected quota decision");
  return { reservation: null, reason: reasons[result] || null };
}
export async function reserveGroqQuota(estimatedTokens: number): Promise<GroqReservation | null> {
  return (await reserveGroqQuotaDetailed(estimatedTokens)).reservation;
}
export async function reconcileGroqQuota(reservation: GroqReservation, actual: number): Promise<void> {
  if (!Number.isFinite(actual) || actual<0) return;
  await redisEval(FINISH_SCRIPT,[...KEYS,PREFIX+"reservation:"+reservation.id],[String(Math.ceil(actual))]);
}
export async function releaseGroqQuota(reservation: GroqReservation): Promise<void> {
  await redisEval(FINISH_SCRIPT,[...KEYS,PREFIX+"reservation:"+reservation.id],["0"]);
}

/**
 * Independent distributed reservations for fallback providers.
 * Fail closed when Redis is unavailable. Conservative limits are intentionally
 * below provider free-tier ceilings; they are NOT a substitute for provider billing caps.
 */
export type FallbackProvider = "gemini" | "cloudflare";
export type FallbackReservation = { provider: FallbackProvider; id: string; estimatedTokens: number };
const FALLBACK_QUOTAS: Record<FallbackProvider, typeof QUOTAS> = {
  gemini: { minuteRequests: 5, dayRequests: 100, minuteTokens: 6000, dayTokens: 100000, concurrent: 2 },
  cloudflare: { minuteRequests: 5, dayRequests: 100, minuteTokens: 6000, dayTokens: 100000, concurrent: 2 },
};
function fallbackKeys(provider: FallbackProvider): { prefix: string; keys: string[] } {
  const prefix = "wayapp:" + provider + ":v1:";
  return { prefix, keys: [prefix+"req:min",prefix+"req:day",prefix+"tokens:min",prefix+"tokens:day",prefix+"leases",prefix+"lease-estimates"] };
}
export async function reserveFallbackQuota(provider: FallbackProvider, estimatedTokens: number): Promise<FallbackReservation | null> {
  const q = FALLBACK_QUOTAS[provider];
  if (!Number.isInteger(estimatedTokens) || estimatedTokens < 1 || estimatedTokens > q.minuteTokens) return null;
  const id = crypto.randomUUID();
  const { prefix, keys } = fallbackKeys(provider);
  const result = await redisEval(RESERVE_SCRIPT, [...keys, prefix+"reservation:"+id],
    [String(estimatedTokens), String(q.minuteRequests), String(q.dayRequests), String(q.minuteTokens), String(q.dayTokens), String(q.concurrent)]);
  return result === 0 ? { provider, id, estimatedTokens } : null;
}
export async function settleFallbackQuota(reservation: FallbackReservation, actualTokens: number): Promise<void> {
  const { prefix, keys } = fallbackKeys(reservation.provider);
  await redisEval(FINISH_SCRIPT, [...keys, prefix+"reservation:"+reservation.id], [String(Math.max(0, Math.ceil(actualTokens)))]);
}
