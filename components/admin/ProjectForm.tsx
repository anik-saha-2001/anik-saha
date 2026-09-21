"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "@/lib/projects";

type Props = {
  mode: "new" | "edit";
  initial?: Project;
};

export default function ProjectForm({ mode, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [type, setType] = useState(initial?.type ?? "Backend");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [order, setOrder] = useState(initial?.order ?? 99);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [content, setContent] = useState(initial?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      title,
      slug,
      summary,
      type,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      order: Number(order) || 99,
      featured,
      content,
    };

    try {
      const url =
        mode === "new"
          ? "/api/admin/projects"
          : `/api/admin/projects/${initial!.slug}`;
      const method = mode === "new" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      router.push("/admin/projects");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Slug (URL) — leave blank to auto-generate from title">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="auto from title"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Summary — shown on cards and at the top of the project page">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type">
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Backend / Frontend / Full-stack"
            className={inputClass}
          />
        </Field>
        <Field label="Order (lower = earlier)">
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Featured">
          <label className="flex h-[38px] items-center gap-2 text-sm text-moon-300/80">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            show in featured row
          </label>
        </Field>
      </div>

      <Field label="Tags — comma separated">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Node.js, PostgreSQL, Stripe"
          className={inputClass}
        />
      </Field>

      <Field label="Content (Markdown) — this is the full case study body">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={22}
          className={`${inputClass} font-mono text-[13px] leading-relaxed`}
        />
      </Field>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 font-mono text-sm text-accent-glow transition hover:bg-accent/20 disabled:opacity-50"
        >
          {saving ? "saving…" : mode === "new" ? "create project" : "save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/projects")}
          className="rounded-lg border border-night-600 px-4 py-2 font-mono text-sm text-moon-300/70 transition hover:text-moon-100"
        >
          cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-night-600 bg-night-900 px-3 py-2 text-sm text-moon-100 outline-none focus:border-accent-dim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-moon-300/50">
        {label}
      </span>
      {children}
    </label>
  );
}
