// Save as: lib/telegram.ts
import crypto from "crypto";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export type TgUser = {
  id: number;
  first_name?: string;
  username?: string;
};

/**
 * Verifies the signed `initData` string that Telegram gives the Mini App
 * (window.Telegram.WebApp.initData). Returns the user, or null if invalid.
 */
export function validateInitData(
  initData: string,
  maxAgeSec = 60 * 60 * 24
): TgUser | null {
  if (!initData || !BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculated);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "");
    return user?.id ? (user as TgUser) : null;
  } catch {
    return null;
  }
}

/** Reads the verified Telegram user from the request header. */
export function getTelegramUser(req: Request): TgUser | null {
  return validateInitData(req.headers.get("x-telegram-init-data") ?? "");
}

export async function sendMessage(chatId: number | string, text: string) {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) console.error("sendMessage failed:", await res.text());
  return res.ok;
}

export async function sendDocument(
  chatId: number | string,
  bytes: Uint8Array,
  filename: string,
  caption?: string
) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append(
    "document",
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
    filename
  );

  const res = await fetch(`${API}/sendDocument`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) console.error("sendDocument failed:", await res.text());
  return res.ok;
}