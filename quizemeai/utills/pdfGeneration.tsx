// Save as: lib/pdf.ts   (install first: npm install pdf-lib)
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export type Sections = { notes: string; questions: string; answers: string };

/* ---------- 1. Split the AI text into notes / questions / answers ---------- */

export function splitSections(text: string): Sections {
  const out: Sections = { notes: "", questions: "", answers: "" };
  let current: keyof Sections | null = null;

  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^\s*#{1,6}\s*(.+?)\s*$/);
    if (h) {
      const title = h[1].toLowerCase();
      // only headings that START with these words switch section
      if (/^answer/.test(title)) { current = "answers"; continue; }
      if (/^(quiz|questions?)/.test(title)) { current = "questions"; continue; }
      if (/^(study )?notes?/.test(title)) { current = "notes"; continue; }
    }
    if (/^\s*-{3,}\s*$/.test(line)) continue; // skip "---" separators
    if (current) out[current] += line + "\n";
  }

  out.notes = out.notes.trim();
  out.questions = out.questions.trim();
  out.answers = out.answers.trim();

  // Fallback: no recognizable headings -> keep everything as notes
  if (!out.notes && !out.questions && !out.answers) out.notes = text.trim();
  return out;
}

/* ---------- 2. Turn text into a PDF ---------- */

const W = 595.28; // A4
const H = 841.89;
const M = 50; // margin

const strip = (s: string) =>
  s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/`/g, "");

async function textToPdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Standard fonts only support Latin characters; replace the rest with "?"
  const supported = new Set(font.getCharacterSet());
  const clean = (s: string) =>
    Array.from(s.replace(/\t/g, "  "))
      .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");

  let page = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  const draw = (text: string, f: PDFFont, size: number, indent = 0) => {
    const maxW = W - 2 * M - indent;
    let line = "";
    const flush = () => {
      if (y - size < M) newPage();
      page.drawText(line, { x: M + indent, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size * 1.35;
      line = "";
    };
    for (const word of text.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        flush();
        line = word;
      } else {
        line = test;
      }
    }
    if (line) flush();
  };

  // Title
  draw(clean(title), bold, 20);
  y -= 10;

  // Body
  for (const raw of body.split("\n")) {
    if (!raw.trim()) { y -= 8; continue; }

    const lead = raw.match(/^\s*/)![0].length;
    let t = raw.trim();

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      y -= 4;
      draw(clean(strip(h[2])), bold, h[1].length <= 2 ? 15 : 13);
      y -= 2;
      continue;
    }

    const b = t.match(/^[-*•]\s+(.*)$/);
    if (b) t = `• ${b[1]}`;

    draw(clean(strip(t)), font, 11, Math.min(lead, 8) * 6);
  }

  // Page numbers
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: W / 2 - 15, y: 25, size: 9, font, color: rgb(0.5, 0.5, 0.5),
    });
  });

  return pdf.save();
}

/* ---------- 3. Main function: text in, three PDFs out ---------- */

export async function generatePdfs(text: string) {
  const s = splitSections(text);
  return {
    notes: s.notes ? await textToPdf("Study Notes", s.notes) : null,
    questions: s.questions ? await textToPdf("Quiz", s.questions) : null,
    answers: s.answers ? await textToPdf("Answer Key", s.answers) : null,
  };
}