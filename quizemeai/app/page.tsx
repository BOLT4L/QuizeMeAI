// Save as: app/page.tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import AdSlot from "@/components/AdSlot";

const TOOLS = [
  {
    title: "Make a quiz",
    text: "Questions and an answer key from your file.",
    href: "/generate?mode=quiz",
  },
  {
    title: "Make notes",
    text: "Short, organized study notes from your file.",
    href: "/generate?mode=notes",
  },
  {
    title: "Quiz and notes",
    text: "Get both in one go, plus a ZIP download.",
    href: "/generate?mode=both",
  },
];
type GeneratedFile = {
  name: string;
  data: string;
  type: string;
};

const MAX_SIZE = 1 * 1024 * 1024; // 1 MB in bytes

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<GeneratedFile[]>([]);
  const [mode, setMode] = useState("");
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("5");
  // One place for the size check (used by the picker AND drag-and-drop)
  function handleFile(f: File | null) {
    if (f && f.size > MAX_SIZE) {
      setError("File is too large. Please choose a file smaller than 1 MB.");
      return;
    }
    setError(null);
    setResult([]);
    setFile(f);
  }

  async function generateTest() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      formData.append("type", type);
      formData.append("quantity", quantity);
      const res = await fetch("/api/", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-xl font-bold text-indigo-700">
            QuizMeAI
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <a href="#tools" className="hover:text-indigo-700">
              Tools
            </a>
            <a href="#faq" className="hover:text-indigo-700">
              FAQ
            </a>
          </nav>
        </div>
      </header>

      {/* AD 1: top banner */}
      <div className="px-4 pt-4">
        <AdSlot name="top-banner" w={728} h={90} />
      </div>

      <div className="mx-auto flex max-w-6xl justify-center gap-6 px-4">
        {/* AD 2: left sidebar */}
        <div className="sticky top-4 h-fit w-40 shrink-0 pt-8 max-xl:hidden">
          <AdSlot
            name="left-sidebar"
            w={160}
            h={600}
            fixed
            minViewport={1280}
          />
        </div>

        <main className="w-full max-w-3xl py-10">
          {/* Hero */}
          <section className="text-center">
            <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Turn any file into notes and a quiz
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-gray-600">
              Upload a PDF, PowerPoint, Word or text file. Get study notes and a
              quiz in minutes. Free.
            </p>
          </section>

          {/* Upload box */}
          <section className="mt-8">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`rounded-2xl border-2 border-dashed bg-white p-10 text-center transition ${
                drag ? "border-indigo-500 bg-indigo-50" : "border-gray-300"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0] ?? null);
                  e.target.value = ""; // allow picking the same file again
                }}
              />

              {!file ? (
                <>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-xl bg-indigo-600 px-8 py-4 text-lg font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                  >
                    Select file
                  </button>
                  <p className="mt-4 text-sm text-gray-500">
                    or drop a file here
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    PDF, PPTX, DOCX, TXT, MD. Up to 1 MB.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900 overflow-auto max-w-[100%]">
                    {file.name}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 ">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <div>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as string)}
                    >
                      <option value="both">Both</option>
                      <option value="quiz">Question only</option>
                      <option value="notes">Note only</option>
                    </select>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as string)}
                    >
                      <option value="all">All types</option>
                      <option value="choice">Multiple choice</option>
                      <option value="truefalse">True or false</option>
                      <option value="short">Short answer</option>
                      <option value="fillblank">Fill in the blank</option>
                      <option value="mathching">Matching</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={generateTest}
                      disabled={loading}
                      className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800 disabled:opacity-60"
                    >
                      {loading ? "Generating..." : "Continue"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFile(null)}
                      disabled={loading}
                      className="rounded-xl border border-gray-300 px-6 py-3 font-semibold hover:bg-gray-100 disabled:opacity-60"
                    >
                      Choose another file
                    </button>
                  </div>
                </>
              )}
            </div>
            {error && (
              <p className="mt-3 text-center text-sm text-red-600">{error}</p>
            )}
            {result.length > 0 && (
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-4 text-lg font-bold text-gray-900">
                  Your results
                </h2>

                <div className="space-y-3">
                  {result.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">
                          {file.name}
                        </p>
                        <p className="text-sm text-gray-500">PDF document</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const binary = atob(file.data);
                          const bytes = new Uint8Array(binary.length);

                          for (let i = 0; i < binary.length; i++) {
                            bytes[i] = binary.charCodeAt(i);
                          }

                          const blob = new Blob([bytes], {
                            type: file.type,
                          });

                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");

                          link.href = url;
                          link.download = file.name;
                          document.body.appendChild(link);
                          link.click();
                          link.remove();

                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Download PDF
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          <a href="https://t.me/bbubbu11" className="text-center  m-5 p-5"><h1 className="bg-green-500">Contact Us</h1></a>
          {/* AD 3 */}
          <AdSlot name="below-upload" w={728} h={90} className="mt-10" />

          {/* Tools */}
          <section id="tools" className="mt-10 scroll-mt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {TOOLS.map((t) => (
                <Link
                  key={t.title}
                  href={t.href}
                  className="rounded-xl border border-gray-200 bg-white p-5 hover:border-indigo-400 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  <h2 className="font-bold text-gray-900">{t.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{t.text}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* AD 4 */}
          <AdSlot name="mid-rectangle" w={336} h={280} className="my-10" />

          {/* Simple steps */}
          <section>
            <h2 className="text-center text-xl font-bold text-gray-900">
              How it works
            </h2>
            <ol className="mt-5 grid gap-4 text-center sm:grid-cols-3">
              <li className="rounded-xl bg-white p-5">
                <p className="font-bold text-indigo-700">Upload</p>
                <p className="mt-1 text-sm text-gray-600">Add your file.</p>
              </li>
              <li className="rounded-xl bg-white p-5">
                <p className="font-bold text-indigo-700">Choose</p>
                <p className="mt-1 text-sm text-gray-600">
                  Pick the number of questions, difficulty and types.
                </p>
              </li>
              <li className="rounded-xl bg-white p-5">
                <p className="font-bold text-indigo-700">Download</p>
                <p className="mt-1 text-sm text-gray-600">
                  Get your quiz, answers and notes.
                </p>
              </li>
            </ol>
          </section>

          {/* AD 5 */}
          <AdSlot name="pre-faq-banner" w={728} h={90} className="my-10" />

          {/* FAQ */}
          <section id="faq" className="scroll-mt-6">
            <h2 className="text-xl font-bold text-gray-900">Questions</h2>
            <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
              <details className="p-4">
                <summary className="cursor-pointer font-semibold">
                  Which files work?
                </summary>
                <p className="mt-2 text-sm text-gray-600">
                  PDF, PowerPoint, Word, TXT and Markdown. Scanned pages are not
                  supported yet.
                </p>
              </details>
              <details className="p-4">
                <summary className="cursor-pointer font-semibold">
                  What happens to my file?
                </summary>
                <p className="mt-2 text-sm text-gray-600">
                  It is deleted right after we read the text. Your results are
                  removed after 1 hour. We use free AI services that may use
                  prompts to improve their models, so don’t upload confidential
                  files.
                </p>
              </details>
              <details className="p-4">
                <summary className="cursor-pointer font-semibold">
                  Is there a limit?
                </summary>
                <p className="mt-2 text-sm text-gray-600">
                  Yes. To keep it free, each person can generate 5 times per
                  day. If you reach the limit, we’ll tell you when to try again.
                </p>
              </details>
            </div>
          </section>
        </main>

        {/* AD 6: right sidebar */}
        <div className="sticky top-4 h-fit w-40 shrink-0 pt-8 max-xl:hidden">
          <AdSlot
            name="right-sidebar"
            w={160}
            h={600}
            fixed
            minViewport={1280}
          />
        </div>
      </div>

      {/* AD 7: footer banner */}
      <div className="px-4 pb-6">
        <AdSlot name="footer-banner" w={728} h={90} />
      </div>

      <footer className="border-t border-gray-200 bg-white pb-20 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-gray-500">
          <p>© 2026 QuizMeAI</p>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-indigo-700">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-indigo-700">
              Terms
            </Link>
            <Link href="https://t.me/bbubbu11" className="hover:text-indigo-700">
              Contact
            </Link>
          </nav>
        </div>
      </footer>

      {/* AD 8: mobile bottom bar */}
      {anchorOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-300 bg-white p-2 md:hidden">
          <button
            type="button"
            onClick={() => setAnchorOpen(false)}
            aria-label="Close advertisement"
            className="absolute -top-7 right-2 rounded-t border border-b-0 border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-500"
          >
            Close
          </button>
          <AdSlot name="mobile-anchor" w={320} h={50} fixed maxViewport={768} />
        </div>
      )}
    </div>
  );
}
