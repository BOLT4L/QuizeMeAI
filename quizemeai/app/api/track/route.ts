// Save as: app/api/track/route.ts
import { NextResponse } from "next/server";
import { getTelegramUser } from "@/lib/telegram";
import { trackVisit } from "@/lib/analytics";

export async function POST(req: Request) {
  try {
    const user = getTelegramUser(req);

    if (user) {
      await trackVisit({ tgId: user.id });
    } else {
      // Normal browser visitor: use the random id the page generated
      const body = await req.json().catch(() => ({}));
      const anonId =
        typeof body?.anonId === "string" ? body.anonId.slice(0, 64) : "";
      if (anonId) await trackVisit({ anonId });
    }
  } catch (err) {
    console.error("track error:", err);
  }
  return NextResponse.json({ ok: true });
}