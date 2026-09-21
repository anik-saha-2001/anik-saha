import { NextRequest, NextResponse } from "next/server";
import { deleteProject, getProject, saveProject } from "@/lib/projects";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const project = await getProject(params.slug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const existing = await getProject(params.slug);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, slug, summary, tags, type, order, featured, content } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  try {
    const project = await saveProject(
      params.slug,
      {
        title,
        slug: slug || params.slug,
        summary: summary ?? existing.summary,
        tags: Array.isArray(tags) ? tags : existing.tags,
        type: type || existing.type,
        order: typeof order === "number" ? order : existing.order,
        featured: !!featured,
        date: existing.date,
      },
      content ?? existing.content
    );
    return NextResponse.json({ project });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const existing = await getProject(params.slug);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteProject(params.slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
