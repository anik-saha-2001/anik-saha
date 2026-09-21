import { supabaseAdmin } from "@/lib/supabase";

export type SiteSettings = {
  name: string;
  role: string;
  tagline: string;
  bio: string;
  location: string;
  email: string;
  socials: Record<string, string>;
  skills: string[];
};

const DEFAULTS: SiteSettings = {
  name: "Your Name",
  role: "Backend Developer",
  tagline: "",
  bio: "",
  location: "",
  email: "",
  socials: {},
  skills: [],
};

type SettingsRow = {
  name: string;
  role: string;
  tagline: string;
  bio: string;
  location: string;
  email: string;
  socials: Record<string, string> | null;
  skills: string[] | null;
};

function rowToSettings(row: SettingsRow): SiteSettings {
  return {
    name: row.name,
    role: row.role,
    tagline: row.tagline,
    bio: row.bio,
    location: row.location,
    email: row.email,
    socials: row.socials ?? {},
    skills: row.skills ?? [],
  };
}

export async function getSettings(): Promise<SiteSettings> {
  // Wrapped fully in try/catch — supabaseAdmin() itself throws
  // synchronously if env vars are missing, which happens before any
  // network call, so a plain `if (error)` check after an await wouldn't
  // catch it. This function backs the root layout's generateMetadata(),
  // which runs during build-time static generation for a few pages — if
  // this throws, the whole build fails. Always degrade to defaults instead.
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Failed to load site settings:", error.message);
      return DEFAULTS;
    }
    return data ? rowToSettings(data as SettingsRow) : DEFAULTS;
  } catch (err) {
    console.error("Failed to load site settings:", (err as Error).message);
    return DEFAULTS;
  }
}

export async function saveSettings(settings: SiteSettings): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("site_settings")
    .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(`Failed to save settings: ${error.message}`);
}
