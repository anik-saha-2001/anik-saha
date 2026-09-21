import Link from "next/link";
import type { Project } from "@/lib/projects";

export default function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group relative block rounded-xl border border-night-700/70 bg-night-900/60 p-5 transition hover:-translate-y-0.5 hover:border-accent-dim hover:shadow-glow"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-mono text-[15px] text-moon-100 group-hover:text-accent-glow">
          {project.title}
        </h3>
        <span className="shrink-0 rounded-full border border-night-600 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-moon-300/60">
          {project.type}
        </span>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-moon-300/80">
        {project.summary}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {project.tags.slice(0, 5).map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-night-800 px-2 py-0.5 font-mono text-[11px] text-accent-glow/80"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
