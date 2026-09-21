import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";

// Without this, Next statically optimizes the route (GET reads no request
// data) and a statically-optimized Route Handler only serves GET at runtime
// — PUT would 405. Force it dynamic so both methods work.
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { name, role, tagline, bio, location, email, socials, skills } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const settings = {
    name,
    role: role || "",
    tagline: tagline || "",
    bio: bio || "",
    location: location || "",
    email: email || "",
    socials: typeof socials === "object" && socials ? socials : {},
    skills: Array.isArray(skills) ? skills : [],
  };

  try {
    await saveSettings(settings);
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
