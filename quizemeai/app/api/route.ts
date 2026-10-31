
  import { NextResponse } from "next/server";
  import { extractText, getDocumentProxy } from "unpdf";
  import JSZip from "jszip";
  import { generatePdfs } from "@/utills/pdfGeneration";
  import { generateWithFallback } from "@/lib/ai/generate";
  import { userLimiter, globalLimiter, getIdentifier } from "@/lib/ai/ratelimit";
  const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
  const MAX_CHARS = 60000;
  const MAX_QUESTIONS = 100;


const PROMPTS: Record<string, string> = {
  quiz: `
Generate a quiz from the provided material.

OUTPUT FORMAT (follow exactly):

# QUESTIONS

[All questions go here]

# ANSWERS

[Answer key goes here]

Do not put answers inside the QUESTIONS section.
Do not omit either heading.
`,

  notes: `
Write short, well-organized study notes from the provided material.

OUTPUT FORMAT (follow exactly):

# NOTES

[Study notes go here]

Use descriptive headings and bullet points.
Do not generate questions or an answer key.
`,

  both: `
Generate study notes and a quiz from the provided material.

OUTPUT FORMAT (follow exactly):

# NOTES

[Organized study notes go here]

# QUESTIONS

[Quiz questions go here]

# ANSWERS

[Answer key goes here]

Keep all three sections separate.
Do not put answers inside the QUESTIONS section.
`,
};

// One prompt per question type
const TYPE_PROMPTS: Record<string, string> = {
  choice: `
MULTIPLE-CHOICE QUESTIONS:
- Give exactly 4 options labeled A, B, C, and D.
- Exactly one option must be correct.
- Make incorrect options plausible.
- Include the correct option in the answer key.
`,

  truefalse: `
TRUE/FALSE QUESTIONS:
- Write clear statements that are either true or false.
- Include the correct answer in the answer key.
- Add a one-sentence explanation for each answer.
`,

  short: `
SHORT-ANSWER QUESTIONS:
- Each question must be answerable in one to three sentences.
- Include a model answer for each question in the answer key.
`,

  fillblank: `
FILL-IN-THE-BLANK QUESTIONS:
- Write sentences based on the provided material.
- Replace one important key term with (______).
- Include the missing term in the answer key.
`,

  matching: `
MATCHING QUESTIONS:
- Create two columns: TERMS and DEFINITIONS.
- Include 4 to 5 items in each column.
- Shuffle the definitions.
- Provide the correct matching pairs in the answer key.
- Count one matching set as one question.
`,

  all: `
Generate a quiz using ALL FIVE question types.

IMPORTANT: Group questions by type. Never mix different types in the same section.

Use the following exact section order and headings:

## Multiple-Choice Questions
- Four options labeled A to D.
- Exactly one correct answer per question.
- Plausible incorrect options.

## True/False Questions
- Clear true or false statements.
- Include explanations in the answer key.

## Short-Answer Questions
- Answerable in one to three sentences.
- Include model answers in the answer key.

## Fill-in-the-Blank Questions
- Replace one key term with (______).
- Include missing terms in the answer key.

## Matching Questions
- Two columns: terms and definitions.
- 4 to 5 items per column.
- Shuffle definitions.
- Include correct pairs in the answer key.
- Count one matching set as one question.

Additional requirements:
- Keep each question type in its own section.
- Use the exact headings provided above.
- Number questions sequentially across all sections.
- Maintain the requested total question count as closely as possible.
- Put ALL answers in the separate ANSWERS section.
- Do not put answers immediately after questions.

OUTPUT FORMAT:

# QUESTIONS

[The five question-type sections go here]

# ANSWERS

[Organize answers under the corresponding question-type headings]
`,
};

  function buildPrompt(mode: string, types: string[], count: number): string {
    const base = PROMPTS[mode] ?? PROMPTS.both;
    if (mode === "notes") return base;

    const n = Math.min(Math.max(count || 10, 1), MAX_QUESTIONS);

    // "all" uses its own prompt
    if (types.includes("all")) {
      return `${base}\n\nWrite ${n} questions in total.\n${TYPE_PROMPTS.all}`;
    }

    const chosen = types.filter((t) => t in TYPE_PROMPTS && t !== "all");
    console.log(chosen)
    const finalTypes = chosen.length ? chosen : ["choice"];

    const typeText =
      finalTypes.length === 1
        ? `Write ${n} questions. Use only this question type:\n${TYPE_PROMPTS[finalTypes[0]]}`
        : `Write ${n} questions in total, mixing these question types in a varied order and splitting them roughly evenly:\n` +
          finalTypes.map((t) => `- ${TYPE_PROMPTS[t]}`).join("\n");

    return `${base}\n\n${typeText}`;
  }
  // ---------- file -> plain text ----------

  async function pdfToText(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  async function docxToText(buffer: Buffer): Promise<string> {
    const m: any = await import("mammoth");
    const mammoth = m.default ?? m;
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  function decodeXml(s: string): string {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  async function pptxToText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);

    const slideNames = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)\.xml/)![1]) -
          Number(b.match(/slide(\d+)\.xml/)![1]),
      );

    const slides: string[] = [];
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.files[slideNames[i]].async("string");
      const lines = xml
        .replace(/<\/a:p>/g, "\n")
        .match(/<a:t[^>]*>[^<]*<\/a:t>|\n/g)
        ?.map((t) => (t === "\n" ? "\n" : decodeXml(t.replace(/<[^>]+>/g, ""))))
        .join("")
        .trim();
      if (lines) slides.push(`Slide ${i + 1}:\n${lines}`);
    }
    return slides.join("\n\n");
  }

  async function fileToText(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();

    const buffer = Buffer.from(await file.arrayBuffer());
    if (name.endsWith(".pdf")) return pdfToText(buffer);
    if (name.endsWith(".docx")) return docxToText(buffer);
    if (name.endsWith(".pptx")) return pptxToText(buffer);

    throw new Error("UNSUPPORTED");
  }

  // ---------- route ----------

export async function POST(req: Request) {
  try {
    // --- identify user ---
    const identifier = getIdentifier(req);
    if (!identifier) {
      return NextResponse.json({ error: "Invalid Telegram data" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "both");
    const type = String(formData.get("type") || "all");
    const quantity = String(formData.get("quantity") ?? 5);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be smaller than 1 MB" }, { status: 400 });
    }

    // 1. Convert the file to text
    let text: string;
    try {
      text = (await fileToText(file)).trim();
    } catch (e) {
      if (e instanceof Error && e.message === "UNSUPPORTED") {
        return NextResponse.json(
          { error: "Unsupported file type. Use PDF, PPTX, DOCX, TXT or MD." },
          { status: 400 },
        );
      }
      console.error(e);
      return NextResponse.json({ error: "Could not read this file." }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json(
        { error: "No readable text found. Scanned pages are not supported yet." },
        { status: 400 },
      );
    }

    // 2. RATE LIMIT (right before the expensive AI call)
    const [user, global] = await Promise.all([
      userLimiter.limit(identifier),
      globalLimiter.limit("global"),
    ]);

    if (!global.success) {
      return NextResponse.json(
        { error: "The service is busy right now. Please try again later." },
        { status: 503 },
      );
    }

    if (!user.success) {
      const retryAfter = Math.max(1, Math.ceil((user.reset - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: "You can generate up to 3 times per hour.",
          retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // 3. Generate
    const instruction = buildPrompt(mode, [type], Number(quantity));
    const prompt = `${instruction}

Material:
${text.slice(0, MAX_CHARS)}`;

    const response = await generateWithFallback(prompt);
    console.info(`[QuizemeAI] Provider used: ${response.provider}`);

    const results = await generatePdfs(response.text);

    const files = Object.entries(results)
      .filter((entry) => entry[1] !== null)
      .map(([key, bytes]) => ({
        name: `${key}.pdf`,
        data: Buffer.from(bytes!).toString("base64"),
        type: "application/pdf",
      }));

    return NextResponse.json(
      { result: files, remaining: user.remaining },
      { headers: { "X-RateLimit-Remaining": String(user.remaining) } },
    );
  } catch (err: any) {
    console.error("Generation error:", err?.status, err?.message);
    return NextResponse.json(
      { error: "Something went wrong while generating. Please try again." },
      { status: 500 },
    );
  }
}