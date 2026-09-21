import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client, built with the SERVICE ROLE key — it bypasses Row
// Level Security entirely. NEVER import this from a "use client" component
// and NEVER send SUPABASE_SERVICE_ROLE_KEY to the browser. Every table this
// app uses has RLS enabled with zero policies (see supabase/schema.sql), so
// this key is the only thing on earth that can read or write them; the
// public anon key is never used by this app at all.

let cached: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to your .env file (see .env.example) and ` +
        `your Vercel project's Environment Variables.`
    );
  }
  return value;
}

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
