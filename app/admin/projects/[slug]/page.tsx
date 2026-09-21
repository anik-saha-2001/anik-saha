import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import ProjectForm from "@/components/admin/ProjectForm";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);
  if (!project) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-moon-100">
        Edit — {project.title}
      </h1>
      <ProjectForm mode="edit" initial={project} />
    </div>
  );
}
