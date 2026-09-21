import { NextRequest, NextResponse } from "next/server";
import { listProjects, saveProject } from "@/lib/projects";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, slug, summary, tags, type, order, featured, content } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  try {
    const project = await saveProject(
      null,
      {
        title,
        slug,
        summary: summary || "",
        tags: Array.isArray(tags) ? tags : [],
        type: type || "Project",
        order: typeof order === "number" ? order : 999,
        featured: !!featured,
        date: new Date().toISOString().slice(0, 10),
      },
      content || ""
    );
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
