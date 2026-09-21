import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Markdown from "@/components/Markdown";
import { getProject } from "@/lib/projects";
import { getSettings } from "@/lib/settings";

// Content lives in Supabase and can change from /admin at any time, and we
// don't want the build to depend on Supabase already being seeded — so this
// route is fully server-rendered per request rather than statically
// generated at build time.
export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: { slug: string };
}) {
  const [settings, project] = await Promise.all([
    getSettings(),
    getProject(params.slug),
  ]);

  if (!project) notFound();

  return (
    <>
      <Nav name={settings.name} />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <Link
          href="/#projects"
          className="mb-8 inline-block font-mono text-xs text-moon-300/60 transition hover:text-accent-glow"
        >
          ← back
        </Link>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-night-600 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-moon-300/60">
            {project.type}
          </span>
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-night-800 px-2 py-0.5 font-mono text-[11px] text-accent-glow/80"
            >
              {tag}
            </span>
          ))}
        </div>

        <h1 className="mb-3 text-2xl font-semibold text-moon-100 sm:text-3xl">
          {project.title}
        </h1>
        <p className="mb-10 max-w-2xl text-[15px] leading-relaxed text-moon-300/80">
          {project.summary}
        </p>

        <div className="rounded-2xl border border-night-700/70 bg-night-900/40 p-6 sm:p-8">
          <Markdown>{project.content}</Markdown>
        </div>
      </main>
      <Footer name={settings.name} />
    </>
  );
}
