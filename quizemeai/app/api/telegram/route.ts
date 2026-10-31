import { NextResponse } from "next/server";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const WEBAPP_URL = process.env.WEBAPP_URL!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
console.log(BOT_TOKEN,WEBAPP_URL,WEBHOOK_SECRET)
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`Telegram ${method} failed:`, await res.text());
}

export async function POST(req: Request) {
 const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
console.log("[tg]", {
  gotLen: got,
  envLen: WEBHOOK_SECRET,
  envHasWhitespace: /\s/.test(WEBHOOK_SECRET ?? ""),
  envHasQuotes: /["']/.test(WEBHOOK_SECRET ?? ""),
});
  // Only accept requests that really come from Telegram
  if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const update = await req.json();
    const message = update.message;

    // Ignore anything that is not a private text message
    if (!message || message.chat?.type !== "private") {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text: string = message.text ?? "";
    const firstName: string = message.from?.first_name ?? "there";

    const isStart = text.startsWith("/start");

    await tg("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: isStart
        ? `👋 Hi <b>${escapeHtml(firstName)}</b>!\n\nUpload your study material and <b>QuizeMe AI</b> will turn it into notes and quizzes for you.\n\nTap the button below to start.`
        : "Tap the button below to open <b>QuizeMe AI</b>.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Open QuizeMe AI", web_app: { url: WEBAPP_URL } }],
        ],
      },
    });
  } catch (err) {
    console.error("Webhook error:", err);
  }

  // Always answer 200, otherwise Telegram keeps retrying the same update
  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}