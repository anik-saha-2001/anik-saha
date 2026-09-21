/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Content, settings and the CV all live in Supabase now (see
  // lib/supabase.ts and supabase/schema.sql) — this app has no persistence
  // requirements of its own, so it deploys cleanly to Vercel's serverless
  // runtime.
};

export default nextConfig;
