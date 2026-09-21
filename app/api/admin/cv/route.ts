import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCvInfo } from "@/lib/cv";

export const dynamic = "force-dynamic";

const BUCKET = "cv";
const MAX_SIZE = 15 * 1024 * 1024; // 15MB

export async function GET() {
  const info = await getCvInfo();
  return NextResponse.json(info);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const pdf = form.get("pdf");
  const tex = form.get("tex");

  if (!(pdf instanceof File) && !(tex instanceof File)) {
    return NextResponse.json(
      { error: "Attach a PDF and/or a .tex file" },
      { status: 400 }
    );
  }

  let sb;
  try {
    sb = supabaseAdmin();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (pdf instanceof File) {
    if (pdf.size > MAX_SIZE) {
      return NextResponse.json({ error: "PDF is too large (max 15MB)" }, { status: 400 });
    }
    if (pdf.type && pdf.type !== "application/pdf" && !pdf.name.endsWith(".pdf")) {
      return NextResponse.json({ error: "That file isn't a PDF" }, { status: 400 });
    }
    const buf = Buffer.from(await pdf.arrayBuffer());
    const { error } = await sb.storage.from(BUCKET).upload("latest.pdf", buf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) {
      return NextResponse.json(
        {
          error: `Upload failed: ${error.message}. Have you run supabase/schema.sql in your Supabase project yet?`,
        },
        { status: 500 }
      );
    }
  }

  if (tex instanceof File) {
    if (tex.size > MAX_SIZE) {
      return NextResponse.json({ error: ".tex file is too large (max 15MB)" }, { status: 400 });
    }
    const buf = Buffer.from(await tex.arrayBuffer());
    const { error } = await sb.storage.from(BUCKET).upload("latest.tex", buf, {
      contentType: "application/x-tex",
      upsert: true,
    });
    if (error) {
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }
  }

  const info = await getCvInfo();
  return NextResponse.json({ ok: true, ...info });
}
