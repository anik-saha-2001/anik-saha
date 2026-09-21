"use client";

import { useEffect, useState } from "react";

type CvInfo = { hasPdf: boolean; hasTex: boolean; updatedAt: string | null };

export default function AdminCvPage() {
  const [info, setInfo] = useState<CvInfo | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [texFile, setTexFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/cv")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!pdfFile && !texFile) {
      setError("Choose a PDF and/or a .tex file first");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);

    const form = new FormData();
    if (pdfFile) form.append("pdf", pdfFile);
    if (texFile) form.append("tex", texFile);

    try {
      const res = await fetch("/api/admin/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      setInfo(data);
      setMessage("CV updated — visitors will see the new version immediately.");
      setPdfFile(null);
      setTexFile(null);
    } catch {
      setError("Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-xl font-semibold text-moon-100">CV</h1>
      <p className="mb-6 text-sm text-moon-300/70">
        Upload a PDF — that's what visitors see and download on{" "}
        <code className="rounded bg-night-800 px-1.5 py-0.5 text-xs">/cv</code>.
        The .tex source is optional, for anyone who wants the raw file.
      </p>

      {info && (
        <div className="mb-6 rounded-lg border border-night-700 bg-night-900/50 px-4 py-3 text-sm text-moon-300/70">
          <p>PDF on file: {info.hasPdf ? "yes" : "no"}</p>
          <p>.tex on file: {info.hasTex ? "yes" : "no"}</p>
          {info.updatedAt && (
            <p className="mt-1 text-xs text-moon-300/50">
              last updated {new Date(info.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleUpload} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-moon-300/50">
            CV — PDF
          </span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-moon-300/70 file:mr-3 file:rounded-lg file:border file:border-night-600 file:bg-night-800 file:px-3 file:py-1.5 file:text-moon-100"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-moon-300/50">
            CV — .tex source (optional)
          </span>
          <input
            type="file"
            accept=".tex"
            onChange={(e) => setTexFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-moon-300/70 file:mr-3 file:rounded-lg file:border file:border-night-600 file:bg-night-800 file:px-3 file:py-1.5 file:text-moon-100"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-emerald-400">{message}</p>}

        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 font-mono text-sm text-accent-glow transition hover:bg-accent/20 disabled:opacity-50"
        >
          {uploading ? "uploading…" : "upload"}
        </button>
      </form>
    </div>
  );
}
