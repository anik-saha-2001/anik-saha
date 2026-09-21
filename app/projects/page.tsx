import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ProjectCard from "@/components/ProjectCard";
import { listProjects } from "@/lib/projects";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [settings, projects] = await Promise.all([getSettings(), listProjects()]);

  return (
    <>
      <Nav name={settings.name} />
      <main className="mx-auto max-w-4xl px-5 py-16">
        <h1 className="mb-8 font-mono text-sm uppercase tracking-widest text-accent-glow/70">
          ☾ all projects
        </h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      </main>
      <Footer name={settings.name} />
    </>
  );
}
