import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = Redis.fromEnv();

export const userLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "rl:user",
});

// Safety net so many different IPs can't drain your AI quota
export const globalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, "1 h"),
  prefix: "rl:global",
});

function verifyTelegram(initData: string, botToken: string): string | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "{}");
    return user.id ? String(user.id) : null;
  } catch {
    return null;
  }
}

export function getIdentifier(req: Request): string | null {
  const initData = req.headers.get("x-tg-init-data");

  if (initData) {
    const tgId = verifyTelegram(initData, process.env.BOT_TOKEN!);
    return tgId ? `tg:${tgId}` : null; // null = invalid Telegram data
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `ip:${ip}`;
}