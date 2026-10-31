import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

type ProviderName = "gemini" | "groq" | "openrouter";

type ProviderResult = {
  text: string;
  provider: ProviderName;
};

type ProviderFailure = {
  provider: ProviderName;
  status?: number;
  message: string;
  category:
    | "rate_limit"
    | "quota_exhausted"
    | "invalid_credentials"
    | "insufficient_credits"
    | "model_unavailable"
    | "provider_unavailable"
    | "invalid_request"
    | "unknown";
  retryAfter?: number;
};

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 300000 },
    })
  : null;

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
      timeout: 60000,
      maxRetries: 0,
    })
  : null;

const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: 60000,
      maxRetries: 0,
    })
  : null;

const MODELS = {
  gemini: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  groq: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  openrouter:
    process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
};
function getApiKeys(
  pluralEnv: string,
  singleEnv: string
): string[] {
  const pluralKeys = process.env[pluralEnv]
    ?.split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (pluralKeys?.length) {
    return [...new Set(pluralKeys)];
  }

  const singleKey = process.env[singleEnv]?.trim();

  return singleKey ? [singleKey] : [];
}

const geminiClients = getApiKeys(
  "GEMINI_API_KEYS",
  "GEMINI_API_KEY"
).map(
  (apiKey) =>
    new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 300000 },
    })
);

const groqClients = getApiKeys(
  "GROQ_API_KEYS",
  "GROQ_API_KEY"
).map(
  (apiKey) =>
    new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
      timeout: 60000,
      maxRetries: 0,
    })
);

const openrouterClients = getApiKeys(
  "OPENROUTER_API_KEYS",
  "OPENROUTER_API_KEY"
).map(
  (apiKey) =>
    new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: 60000,
      maxRetries: 0,
    })
);
function classifyError(
  error: any
): ProviderFailure["category"] {
  const status = Number(error?.status ?? error?.statusCode ?? 0);

  const code = String(
    error?.code ?? error?.error?.code ?? ""
  ).toLowerCase();

  const message = String(
    error?.message ??
      error?.error?.message ??
      error?.error?.metadata?.raw ??
      ""
  ).toLowerCase();

  if (
    /insufficient_quota|resource_exhausted|quota_exceeded/.test(code) ||
    /quota exceeded|daily quota|resource exhausted/.test(message)
  ) {
    return "quota_exhausted";
  }

  if (
    /insufficient credits|credits exhausted|payment required/.test(
      message
    ) ||
    status === 402
  ) {
    return "insufficient_credits";
  }

  if (
    status === 401 ||
    status === 403 ||
    /invalid api key|invalid credentials|unauthorized/.test(message)
  ) {
    return "invalid_credentials";
  }

  if (
    /model_not_found|model unavailable|unknown model/.test(code) ||
    /model not found|model unavailable|unknown model/.test(message)
  ) {
    return "model_unavailable";
  }

  if (
    status === 429 ||
    /rate_limit_exceeded|too_many_requests/.test(code)
  ) {
    return "rate_limit";
  }

  if (
    status === 408 ||
    status === 409 ||
    status >= 500 ||
    /timeout|timed out|fetch failed|network error/.test(message)
  ) {
    return "provider_unavailable";
  }

  if (status === 400 || status === 422) {
    return "invalid_request";
  }

  return "unknown";
}

function retryAfterSeconds(error: any): number | undefined {
  const headers = error?.headers;

  const raw =
    headers?.get?.("retry-after") ??
    headers?.["retry-after"];

  if (raw === undefined || raw === null) {
    return undefined;
  }

  const seconds = Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds);
  }

  const date = Date.parse(String(raw));

  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function createFailure(
  provider: ProviderName,
  error: any
): ProviderFailure {
  return {
    provider,
    status: Number(error?.status ?? error?.statusCode) || undefined,
    message: String(error?.message ?? "Unknown provider error"),
    category: classifyError(error),
    retryAfter: retryAfterSeconds(error),
  };
}

async function callProvider(
  provider: ProviderName,
  prompt: string,
  keyIndex: number
): Promise<ProviderResult> {
  if (provider === "gemini") {
    const client = geminiClients[keyIndex];

    if (!client) {
      throw new Error("Gemini is not configured");
    }

    const response = await client.models.generateContent({
      model: MODELS.gemini,
      contents: prompt,
    });

    const text = response.text?.trim();

    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    return { provider, text };
  }

  const client =
    provider === "groq"
      ? groqClients[keyIndex]
      : openrouterClients[keyIndex];

  if (!client) {
    throw new Error(`${provider} is not configured`);
  }

  const model = MODELS[provider];

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`${provider} returned an empty response`);
  }

  return {
    provider,
    text: content.trim(),
  };
}

const PROVIDER_ORDER: ProviderName[] = [
    "gemini",
    "openrouter",
    "groq",
    
  
  
  
];

function shouldFailover(category: ProviderFailure["category"]) {
  return [
    "rate_limit",
    "quota_exhausted",
    "insufficient_credits",
    "invalid_credentials",
    "model_unavailable",
    "provider_unavailable",
  ].includes(category);
}

function getProviderKeyCount(provider: ProviderName): number {
  switch (provider) {
    case "gemini":
      return geminiClients.length;

    case "groq":
      return groqClients.length;

    case "openrouter":
      return openrouterClients.length;
  }
}

export async function generateWithFallback(
  prompt: string
): Promise<ProviderResult> {
  const failures: ProviderFailure[] = [];

  for (const provider of PROVIDER_ORDER) {
    const keyCount = getProviderKeyCount(provider);

    if (keyCount === 0) {
      continue;
    }

    // Try each configured key for this provider.
    for (let keyIndex = 0; keyIndex < keyCount; keyIndex++) {
      try {
        const result = await callProvider(
          provider,
          prompt,
          keyIndex
        );

        console.info(
          `[AI] Successfully generated using ${provider}`
        );

        return result;
      } catch (error: any) {
        const failure = createFailure(provider, error);

        failures.push(failure);

        console.error("[AI] Provider failed", {
          provider,
          keyIndex,
          status: failure.status,
          category: failure.category,
          retryAfter: failure.retryAfter,
        });

        // Rotate to another key for rate-limit errors only.
        if (failure.category === "rate_limit") {
          if (keyIndex + 1 < keyCount) {
            console.info(
              `[AI] ${provider} rate limited. Trying next API key.`
            );

            continue;
          }

          // All keys for this provider were rate limited.
          break;
        }

        // Preserve the existing behavior for other errors.
        if (!shouldFailover(failure.category)) {
          throw new Error("AI_GENERATION_FAILED");
        }

        // Do not retry the same provider with another key
        // for non-rate-limit errors.
        break;
      }
    }
  }

  console.error("[AI] All configured providers failed", {
    failures: failures.map(
      ({ provider, category, status }) => ({
        provider,
        category,
        status,
      })
    ),
  });

  throw new Error("ALL_AI_PROVIDERS_FAILED");
}