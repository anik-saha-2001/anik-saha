import Link from "next/link";
import { listProjects } from "@/lib/projects";
import ProjectsList from "@/components/admin/ProjectsList";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const projects = await listProjects();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-moon-100">Projects</h1>
        <Link
          href="/admin/projects/new"
          className="rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 font-mono text-sm text-accent-glow transition hover:bg-accent/20"
        >
          + new project
        </Link>
      </div>
      <ProjectsList projects={projects} />
    </div>
  );
}
