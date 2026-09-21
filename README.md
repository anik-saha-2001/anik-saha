# Anik Saha — Portfolio

A Next.js portfolio, dark/starry theme inspired by dimden.dev. Content is
editable from a password-protected `/admin` panel — projects, site copy/bio,
and your CV (PDF + optional `.tex` source) — all stored in **Supabase**
(Postgres + Storage, free tier), so the whole thing deploys cleanly to
**Vercel's free Hobby plan** with no server to manage.

## Why Supabase, in one sentence

Vercel's serverless functions have a read-only filesystem, so this app can't
just write edited content to local files the way a traditional Node server
could — Supabase is the free, persistent place those writes actually land.

## One-time setup (do this before your first deploy)

### 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier).
2. Once it's ready, open **Project Settings → API**. You'll need two values:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role key** (under "Project API keys", NOT the "anon public"
     one) → this is `SUPABASE_SERVICE_ROLE_KEY`

   The service role key bypasses Row Level Security and can read/write
   everything — that's intentional (see [Security](#security) below), but it
   means: **never** put it in anything prefixed `NEXT_PUBLIC_`, never commit
   it, never send it to the browser. It only ever lives in server-side env
   vars.

### 2. Create the tables and storage bucket

Open **SQL Editor** in your Supabase dashboard → New query → paste the
entire contents of [`supabase/schema.sql`](./supabase/schema.sql) → Run.
That creates:
- a `projects` table
- a `site_settings` table (one row)
- a public-read `cv` storage bucket

It's idempotent — safe to run again if you're ever unsure whether it applied.

### 3. Install deps and configure your local `.env`

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
ADMIN_PASSWORD=pick-something-only-you-know
ADMIN_SESSION_SECRET=<output of: openssl rand -hex 32>
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service_role key from step 1>
```

### 4. Seed your existing content into Supabase

All 8 of your case studies (in `content/projects/*.md`), your site bio
(`content/site.json`), and your CV (`seed/cv/`) are already in this repo,
converted and ready. Push them into Supabase once:

```bash
npm run seed
```

You should see a `✓` line per project, one for settings, and one each for
`latest.pdf` / `latest.tex`. From this point on, **Supabase is the live
source of truth** — the `content/` and `seed/` folders are just the original
seed material for reference/re-seeding, not something the running app reads.

### 5. Run it locally to confirm

```bash
npm run dev
```

Visit `http://localhost:3000` (should show your projects) and
`http://localhost:3000/admin` (sign in with `ADMIN_PASSWORD`).

## Deploying to Vercel (free)

1. Push this repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo → it'll
   auto-detect Next.js, no config needed.
3. Before deploying, add these four **Environment Variables** in the Vercel
   project settings (same values as your `.env`):
   `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy. That's it — no database add-on, no extra Vercel product needed;
   Supabase is entirely separate and free on its own tier.

If you ever add a new project or change the CV from a fresh environment,
you don't need to redeploy — `/admin` writes straight to Supabase and the
live site reflects it immediately (the relevant pages are server-rendered
per request, not statically cached).

## Free tier limits worth knowing

- **Supabase free tier**: 500MB database, 1GB file storage, 5GB
  bandwidth/month — enormous headroom for a portfolio (your CV is a few
  hundred KB; project text is a few KB each).
- **The one real gotcha**: a free Supabase project **pauses after 7 days
  with no API activity**. Since every page load of your site queries
  Supabase, normal traffic keeps it awake — but if the site goes completely
  unvisited for a week, it'll pause and need a manual "Restore" click in the
  Supabase dashboard (data is never lost, just paused). If that's a concern,
  a free uptime pinger (e.g. UptimeRobot hitting your homepage every few
  days) keeps it alive indefinitely.
- **Vercel Hobby plan**: free, no credit card, generous bandwidth/build
  limits for a personal site. Its serverless functions have a read-only
  filesystem — which is exactly why content lives in Supabase instead.

## Security

- **Admin auth**: a single password (`ADMIN_PASSWORD`) plus an
  HMAC-SHA256-signed, httpOnly session cookie (`lib/auth.ts`), verified in
  `middleware.ts` for every `/admin` page and every `/api/admin/*` request.
  No third-party auth dependency — built on Web Crypto, works identically in
  Node and Edge runtimes.
- **Supabase access is locked down at the database level, not just in app
  code**: both tables have Row Level Security enabled with **zero policies**
  (see `supabase/schema.sql`). That means even if your `SUPABASE_URL` were
  public (it already is — it's not a secret) and someone had the anon key,
  they could read or write *nothing*. Only the `service_role` key — used
  exclusively server-side by this app — can touch the data at all. That key
  is the one secret that actually matters; everything else in `.env` is
  either a password you chose or non-sensitive config.
- **CV storage bucket** is public-*read* (so visitors can download it with
  no auth) but has no write policies — uploading/replacing a file requires
  the service_role key, i.e. only through `/admin`.
- Verified end-to-end before delivery: production build, then live smoke
  tests against a running instance — login/logout, project create/edit/
  rename/delete, settings read/write, CV upload with file-type validation,
  and confirming `/admin` and its API genuinely 401/redirect when signed
  out.

## Project structure

```
app/                     routes (App Router)
  page.tsx                home (hero, about, projects)
  projects/[slug]/         individual case-study pages
  cv/                      public CV page (streams from Supabase Storage)
  admin/                   password-gated admin UI
  api/admin/               admin API routes (also password-gated)
components/               UI components (Nav, ProjectCard, Markdown, Starfield…)
components/admin/         admin-only components (forms, topbar)
content/projects/*.md     seed data for your case studies (frontmatter + markdown)
content/site.json         seed data for name, tagline, bio, socials, skills
seed/cv/                  seed CV files (latest.pdf / latest.tex)
supabase/schema.sql       run once in the Supabase SQL Editor
scripts/seed.mjs          pushes content/ + seed/ into Supabase (npm run seed)
lib/                      data access — projects.ts, settings.ts, cv.ts (all Supabase), auth.ts, supabase.ts
middleware.ts             protects /admin and /api/admin/*
```

## Editing content after deploy

Just use `/admin` — create/edit/delete projects (full markdown editor),
update your bio/socials/skills, upload a new CV PDF. Everything writes
straight to Supabase and appears on the live site immediately.

## Fonts

The theme ships with solid system-font fallbacks — no external font request
at build or runtime, so nothing can break if a font CDN is unreachable. If
you want the more distinctive `Inter` / `JetBrains Mono` look, add this
inside `<head>` in `app/layout.tsx`:

```tsx
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

`globals.css` already references both font names first, with the system
fallbacks after — so this is purely additive.
