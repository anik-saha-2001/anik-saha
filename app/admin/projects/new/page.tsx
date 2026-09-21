import ProjectForm from "@/components/admin/ProjectForm";

export default function NewProjectPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-moon-100">New project</h1>
      <ProjectForm mode="new" />
    </div>
  );
}
