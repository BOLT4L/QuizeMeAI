// Save as: lib/analytics.ts   (uses the same Upstash Redis as your rate limiter)
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// The day boundary and the 19:00 report both use this timezone.
export const REPORT_TZ = process.env.REPORT_TZ || "Africa/Addis_Ababa";
const TTL = 60 * 60 * 24 * 45; // keep 45 days

/** "YYYY-MM-DD" in REPORT_TZ */
export function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TZ }).format(d);
}

export async function trackVisit(opts: { tgId?: number; anonId?: string }) {
  const day = dayKey();
  const p = redis.pipeline();

  if (opts.tgId) {
    p.sadd(`visitors:tg:${day}`, String(opts.tgId));
    p.expire(`visitors:tg:${day}`, TTL);
  } else if (opts.anonId) {
    p.sadd(`visitors:web:${day}`, opts.anonId);
    p.expire(`visitors:web:${day}`, TTL);
  } else {
    return;
  }

  p.incr(`visits:${day}`);
  p.expire(`visits:${day}`, TTL);
  await p.exec();
}

export async function trackGeneration() {
  const day = dayKey();
  const key = `generations:${day}`;
  await redis.incr(key);
  await redis.expire(key, TTL);
}

export async function getStats(day = dayKey()) {
  const [tg, web, visits, generations] = await Promise.all([
    redis.scard(`visitors:tg:${day}`),
    redis.scard(`visitors:web:${day}`),
    redis.get<number>(`visits:${day}`),
    redis.get<number>(`generations:${day}`),
  ]);

  return {
    day,
    telegramUsers: tg ?? 0,
    webVisitors: web ?? 0,
    uniqueVisitors: (tg ?? 0) + (web ?? 0),
    totalVisits: Number(visits ?? 0),
    generations: Number(generations ?? 0),
  };
}