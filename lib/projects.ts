import { supabaseAdmin } from "@/lib/supabase";

export type ProjectFrontmatter = {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  type: string;
  order: number;
  featured: boolean;
  date: string;
};

export type Project = ProjectFrontmatter & {
  content: string;
};

type ProjectRow = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  type: string;
  order_num: number;
  featured: boolean;
  date: string;
  content: string;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80) || "project"
  );
}

function rowToProject(row: ProjectRow): Project {
  return {
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    tags: row.tags ?? [],
    type: row.type,
    order: row.order_num,
    featured: row.featured,
    date: row.date,
    content: row.content,
  };
}

export async function listProjects(): Promise<Project[]> {
  // Fully wrapped in try/catch — see the comment in getSettings() for why
  // this needs to survive both a missing-env-var throw (synchronous, from
  // supabaseAdmin() itself) and a query-level error (async, from Supabase).
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("projects")
      .select("*")
      .order("order_num", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      console.error("Failed to list projects:", error.message);
      return [];
    }
    return (data ?? []).map(rowToProject);
  } catch (err) {
    console.error("Failed to list projects:", (err as Error).message);
    return [];
  }
}

export async function getProject(slug: string): Promise<Project | null> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("projects")
      .select("*")
      .eq("slug", slugify(slug))
      .maybeSingle();

    if (error) {
      console.error("Failed to load project:", error.message);
      return null;
    }
    return data ? rowToProject(data as ProjectRow) : null;
  } catch (err) {
    console.error("Failed to load project:", (err as Error).message);
    return null;
  }
}

export async function saveProject(
  originalSlug: string | null,
  fm: Partial<ProjectFrontmatter> & { title: string },
  content: string
): Promise<Project> {
  const sb = supabaseAdmin();
  const slug = slugify(fm.slug || fm.title);

  const row: ProjectRow = {
    slug,
    title: fm.title,
    summary: fm.summary ?? "",
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    type: fm.type || "Project",
    order_num: typeof fm.order === "number" ? fm.order : 999,
    featured: !!fm.featured,
    date: fm.date || new Date().toISOString().slice(0, 10),
    content: content.trim(),
  };

  const { error: upsertError } = await sb
    .from("projects")
    .upsert(row, { onConflict: "slug" });
  if (upsertError) throw new Error(`Failed to save project: ${upsertError.message}`);

  // If the slug changed, this is a rename — remove the old row. Done AFTER
  // the new row is safely written, so a failure here never loses content.
  if (originalSlug && slugify(originalSlug) !== slug) {
    const { error: deleteError } = await sb
      .from("projects")
      .delete()
      .eq("slug", slugify(originalSlug));
    if (deleteError) {
      throw new Error(
        `Saved the new slug but failed to remove the old one (${originalSlug}): ${deleteError.message}`
      );
    }
  }

  return rowToProject(row);
}

export async function deleteProject(slug: string): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("projects").delete().eq("slug", slugify(slug));
  if (error) throw new Error(`Failed to delete project: ${error.message}`);
}

export { slugify };
