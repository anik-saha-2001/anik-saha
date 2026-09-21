"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "@/lib/projects";

export default function ProjectsList({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(slug: string) {
    if (!confirm(`Delete "${slug}"? This can't be undone.`)) return;
    setDeleting(slug);
    try {
      const res = await fetch(`/api/admin/projects/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-moon-300/60">
        No projects yet. Create your first one.
      </p>
    );
  }

  return (
    <div className="divide-y divide-night-700/60 rounded-xl border border-night-700/70 bg-night-900/40">
      {projects.map((p) => (
        <div
          key={p.slug}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p className="font-mono text-sm text-moon-100">
              {p.title}{" "}
              {p.featured && (
                <span className="ml-1 text-[10px] text-accent-glow/70">
                  ★ featured
                </span>
              )}
            </p>
            <p className="text-xs text-moon-300/50">
              /projects/{p.slug} · {p.type} · order {p.order}
            </p>
          </div>
          <div className="flex gap-3 font-mono text-xs">
            <Link
              href={`/projects/${p.slug}`}
              target="_blank"
              className="text-moon-300/60 hover:text-accent-glow"
            >
              view
            </Link>
            <Link
              href={`/admin/projects/${p.slug}`}
              className="text-accent-glow/80 hover:text-accent-glow"
            >
              edit
            </Link>
            <button
              onClick={() => handleDelete(p.slug)}
              disabled={deleting === p.slug}
              className="text-red-400/80 hover:text-red-400 disabled:opacity-50"
            >
              {deleting === p.slug ? "deleting…" : "delete"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
