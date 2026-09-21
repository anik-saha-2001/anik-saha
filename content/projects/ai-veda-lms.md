---
title: "AI Veda — Bilingual Video LMS"
slug: "ai-veda-lms"
summary: "Full-stack Next.js LMS delivering bilingual AI-literacy courses to Kerala government schools — auth, video pipeline, and a 19-table schema built from scratch."
tags: ["Next.js", "PostgreSQL", "Auth", "Video Pipeline", "Cloudflare R2"]
type: "Full-stack"
order: 1
featured: true
date: "2026-09-17"
---

# AI Veda — Bilingual Video LMS for Kerala Government Schools

**Repo:** `Frontend/ai-lms` (package `ai-veda-lms`) · **In-flight integration:** `Frontend/ai-course-lms`
**Type:** Full-stack Next.js application (App Router) — UI *and* API *and* video pipeline in one deployable
**Status:** Active build. Live target 15 Sep 2026, sign-off 20 Sep 2026.

---

## 1. The problem

The Government of Kerala, in partnership with NEXIS, needs to deliver AI-literacy
courses to government school students across three class bands. The constraints
shape everything:

| Constraint | Consequence for the design |
|---|---|
| Students watch on **their own phones**, often on weak mobile data | Adaptive-bitrate HLS with a 240p "survival rung", mobile-first UI |
| Everything must exist in **English and Malayalam** | Translation tables on every content entity, not a `lang` column on one |
| **No self-signup, no student email** ever | Username + password for all four roles; password resets travel up a human chain |
| Schools are institutions, not just records | A school is *itself a login* that manages its own teachers and students |
| Video egress at national scale is the cost risk | Cloudflare R2 (zero egress) chosen after a measured bake-off |

Three courses keyed to class level, sharing eight lessons between two of them:

| Course | Classes | Sessions |
|---|---|---:|
| Explorer | 5–7 | 6 |
| Builder | 8–10 | 8 |
| Achiever | 11–12 | 10 *(Builder's 8 + 2 advanced)* |

Because Builder and Achiever share eight sessions, there are **16 unique lessons,
not 24** — each needing a video, worksheet and handout in two languages, so 96
content files rather than 144. That single modelling decision (lessons are
many-to-many with courses, via `course_lessons`) halves the production budget.

---

## 2. Stack

```
Next.js 14 (App Router) · TypeScript 5.5 · React 18
PostgreSQL (Supabase-hosted, pooled `pg` — RLS deliberately NOT used)
Cloudflare R2 (@aws-sdk/client-s3, S3-compatible)  ffmpeg (HLS ladder)
Zod (validation)   Sentry (@sentry/nextjs, errors only)
```

There is no separate backend service. Route handlers under `app/api/` are the API,
`lib/db/repo.ts` is the data layer, and `lib/video/` is the encoding pipeline —
all inside one Next.js deployment.

---

## 3. System architecture

```
                          ┌──────────────────────────────────────────┐
                          │            Student phone                 │
                          │  Next.js pages (SSR) + HLS video player  │
                          └───────────────┬──────────────────────────┘
                                          │ HTTPS
      ┌───────────────────────────────────┼────────────────────────────────────┐
      │                        NEXT.JS APPLICATION                             │
      │                                   │                                    │
      │   ┌───────────────────────────────▼─────────────────────────────────┐  │
      │   │  middleware.ts  (EDGE runtime — no DB access)                   │  │
      │   │  · verifies session cookie SIGNATURE + expiry only              │  │
      │   │  · deny-by-default route table → role → redirect or continue    │  │
      │   └───────────────────────────────┬─────────────────────────────────┘  │
      │                                   │                                    │
      │   ┌───────────────┬───────────────┴────────────┬────────────────────┐  │
      │   │  PAGES        │  API ROUTE HANDLERS        │  ADMIN STUDIO      │  │
      │   │  /login       │  /api/auth/*               │  /admin/studio     │  │
      │   │  /learning    │  /api/courses/*            │  authoring UI      │  │
      │   │  /learn/[t]/  │  /api/lessons/*            │  upload + poll     │  │
      │   │     [session] │  /api/videos/:id           │                    │  │
      │   │  /teacher     │  /api/documents/*          │                    │  │
      │   │  /admin       │  /api/seed                 │                    │  │
      │   └───────┬───────┴──────────┬─────────────────┴─────────┬──────────┘  │
      │           │                  │                           │             │
      │   ┌───────▼──────────────────▼───────┐        ┌──────────▼──────────┐  │
      │   │  lib/auth/  (NODE runtime)       │        │  lib/video/         │  │
      │   │  guard.ts   requireRole/requireP │        │  pipeline.ts        │  │
      │   │  current.ts re-checks `sessions` │        │  ffmpeg.ts  jobs.ts │  │
      │   │  session.ts token.ts password.ts │        │  r2.ts              │  │
      │   └───────┬──────────────────────────┘        └──────────┬──────────┘  │
      │           │                                              │             │
      │   ┌───────▼──────────────────────────────────────────────▼──────────┐  │
      │   │  lib/db/repo.ts  — typed CRUD, the only place SQL is written     │  │
      │   │  lib/db/pg.ts    — pooled Postgres connection                    │  │
      │   └───────┬──────────────────────────────────────────────┬──────────┘  │
      └───────────┼──────────────────────────────────────────────┼─────────────┘
                  │                                              │
        ┌─────────▼──────────┐                        ┌──────────▼──────────┐
        │  PostgreSQL        │                        │  Cloudflare R2      │
        │  19 tables + 1 view│                        │  HLS segments +     │
        │  8 SQL migrations  │                        │  playlists, PDFs    │
        └────────────────────┘                        │  ZERO egress cost   │
                                                      └─────────────────────┘
```

### Why authorisation is in the application, not the database

The app connects as a **pooled Postgres user**, not through PostgREST. Supabase
Row Level Security therefore never fires and must not be relied on. Every access
rule lives in route handlers and middleware. `docs/SCHEMA.md` states this
explicitly so nobody later assumes a policy is protecting a table when nothing is.

---

## 4. Authentication and authorisation flow

The single subtlety worth understanding: **the Edge cannot see the database.**
That splits enforcement into two layers with different jobs.

```
  Browser                Edge middleware            Node page/route         Postgres
     │                          │                          │                    │
     │  GET /admin  ───────────▶│                          │                    │
     │  Cookie: sg_session      │                          │                    │
     │                          │ verifySession(token)     │                    │
     │                          │  · HMAC signature OK?    │                    │
     │                          │  · not expired?          │                    │
     │                          │  (NO DB — Edge runtime)  │                    │
     │                          │                          │                    │
     │                    ┌─────┴─────┐                    │                    │
     │              invalid│           │valid              │                    │
     │        ┌───────────▼──┐   ┌────▼──────────────┐     │                    │
     │◀───────│ 302 /login   │   │ RULES table:      │     │                    │
     │        │ clear cookie │   │ /admin→super_admin│     │                    │
     │        │ ?next=/admin │   └────┬──────────────┘     │                    │
     │        └──────────────┘        │                    │                    │
     │                         wrong role → 302 homeFor()  │                    │
     │                                │                    │                    │
     │                          right role ────────────────▶                    │
     │                                │       requirePage("super_admin")        │
     │                                │        └─ getCurrentUser() ────────────▶│
     │                                │                    │  SELECT … sessions │
     │                                │                    │◀───────────────────│
     │                                │              revoked? → redirect /login │
     │◀───────────────────────────────┴────────────────────┤                    │
     │                       rendered page                 │                    │
```

**Middleware stops the wrong role reaching a screen. It is not what stops a
revoked session reading data** — `getCurrentUser()` is, because only it can ask
the `sessions` table. A signed-out cookie that someone copied still carries a
valid signature until expiry, and would otherwise render a page shell.

API routes use the mirror-image guard, deny-by-default:

```ts
const g = await requireRole("super_admin");
if ("response" in g) return g.response;   // 401 or 403, already formed
// g.user is available and authorised
```

`403, not 404`: the caller is authenticated, so hiding the route's existence buys
nothing and a clear error saves a support call.

### Role capability grid

| Capability | Super admin | School | Teacher | Student |
|---|:--:|:--:|:--:|:--:|
| Create courses, upload video & PDFs | ✓ | — | — | — |
| Add schools | ✓ | — | — | — |
| Add teachers | ✓ | ✓ | — | — |
| Import students from Excel | ✓ | ✓ | ✓ | — |
| Reset a student password | ✓ | ✓ | ✓ | — |
| Reset a teacher password | ✓ | ✓ | — | — |
| Watch lessons / earn certificate | ✓ | ✓ | ✓ | ✓ |

Password resets travel **one step up the chain** — student → teacher → school →
super admin → email link. Every reset is written to an audit table.

---

## 5. The video pipeline

This is the part that carries the real engineering risk: bandwidth in rural
Kerala, and egress cost at state scale.

```
 ADMIN (Content Studio)                         SERVER                        R2 / DISK
 ──────────────────────                        ────────                      ───────────
  select lesson
  choose source .mp4
        │
        │ POST /api/lessons/:id/video   (multipart)
        ├──────────────────────────────────▶ save to temp
        │                                     insert encode_jobs row
        │◀──────────── 202 { videoId } ──────┤
        │                                     │  detached — request already returned
        │                                     ▼
        │                              ┌──────────────────────────────┐
        │                              │ lib/video/ffmpeg.ts          │
        │                              │  HLS ladder, 4 s segments:   │
        │                              │   1080p → 720p → 480p        │
        │                              │        → 360p → 240p         │
        │                              │  (rungs above the source     │
        │                              │   resolution are skipped)    │
        │                              └────────────┬─────────────────┘
        │  GET /api/videos/:id                      │
        ├─── poll {stage, progress} ───▶            ▼
        │◀── "encoding 480p · 62%"      ┌──────────────────────────────┐
        │                               │ lib/video/r2.ts              │
        │                               │  PUT segments  (immutable    │
        │                               │     Cache-Control, 1 yr)     │
        │                               │  PUT playlists (short TTL)   │──▶ R2 bucket
        │                               └────────────┬─────────────────┘        │
        │                                            ▼                          │
        │◀── {status:"ready", master_url} ── UPDATE videos SET storage_key       │
                                                                                 │
 STUDENT phone ◀──────── master.m3u8 + segments, zero egress cost ───────────────┘
                         hls.js picks a rung from measured bandwidth
```

**The 240p survival rung** was added deliberately after device testing: on a
congested rural 3G link, a ladder that bottoms out at 360p stalls, whereas ~0.6
Mbps keeps playing. A stuttering lesson is a lesson not watched.

**Storage keys, not absolute URLs, are stored in Postgres.** The DB records
`hls/vid_abc/master.m3u8`; the public base URL is composed at read time. Moving
buckets, adding a custom domain, or switching to signed URLs then costs one env
var instead of a data migration.

### The provider bake-off — `ai-course-lms`

The choice of R2 was not assumed. `Frontend/ai-course-lms` is a standalone
proof-of-concept that races **four hosting strategies behind one identical
player**, so the numbers are directly comparable on real devices:

| # | Option | Who manages encode/store/deliver | Main cost driver |
|---|---|---|---|
| 1 | Cloudflare Stream | Fully managed, end to end | $5/1000 min stored + $1/1000 min delivered |
| 2 | MUX | Fully managed, best player + analytics | Per-minute encode + store + stream (highest) |
| 3 | S3 + CloudFront | You upload, CDN serves | CloudFront egress ≈ $0.085–0.11/GB |
| 4 | **R2 + own ffmpeg HLS** | **You encode, R2 serves** | **Storage only, $0.015/GB-mo — zero egress** |
| 5 | YouTube embed | — (free quality benchmark) | Free, but no access control |

```
   ┌──────────────────────────────────────────────────────────────┐
   │  ONE lesson .mp4  →  /upload.html  →  tick target providers  │
   └───────┬──────────┬───────────┬─────────────┬─────────────────┘
           │          │           │             │
     Cloudflare     MUX      ffmpeg HLS     ffmpeg HLS
      Stream API   API       → S3+CF        → R2
           │          │           │             │
           └──────────┴─────┬─────┴─────────────┘
                            ▼
              ┌───────────────────────────────┐
              │  SAME hls.js player + HUD     │
              │  Overall score 0-100 =        │
              │   100 − startup delay penalty │
              │       − freeze penalty (max)  │
              │       − under-resolution      │
              │       − excess switching      │
              │  + bandwidth throttle 0.6-16  │
              │    Mbps (paces hls.js so ABR  │
              │    genuinely reacts)          │
              │  + live buffer/throughput     │
              │    chart, rebuffers shaded    │
              └───────────────────────────────┘
```

The HUD leads with a single **Overall score** weighted the way standard QoE
models weight it (freezes hurt most), so the comparison survives being read by
someone who is not a video engineer. The throttle works by pacing hls.js segment
delivery rather than faking a number, so ABR adaptation is real.

**The integration currently in progress** folds this POC's encode ladder, R2
publisher and hls.js player into `ai-lms` proper: the ladder and R2 upload have
landed in `lib/video/`; the player stage in `components/VideoStage.tsx` is the
remaining piece.

---

## 6. Data model

19 tables and 1 view, applied through 8 ordered SQL migrations:

```
 0001_drop_legacy   0002_auth   0003_org   0004_content
 0005_assets        0006_progress   0007_certificates   0008_encode_jobs
```

```
                        ┌──────────┐
                        │ schools  │◀────── a school IS a login
                        └────┬─────┘
                             │ has
                        ┌────▼─────┐         ┌──────────────┐
   users ───belongs to──▶ classes  ├────────▶│ course_levels│
     │  │                └────┬─────┘  level └──────┬───────┘
     │  │  student is in      │                     │ maps to
     │  └─────────────────────┘                     ▼
     │                  ┌─────────────┐      ┌────────────┐
     ├─ class_teachers ─▶             │      │  courses   │
     │                  └─────────────┘      └─────┬──────┘
     │                                             │
     │                                    course_lessons  ◀── M:N — the reason
     │                                             │           16 lessons cover
     │                                       ┌─────▼──────┐    3 courses
     ├── progress ──────────────────────────▶│  lessons   │
     │   (watched_seconds, marked_complete)  └─────┬──────┘
     │                                             │
     ├── certificates ◀── issued on completion     ├── videos    (storage_key)
     │                                             ├── documents (worksheet, handout)
     ├── sessions   (server-side, revocable)       └── lesson_translations (en|ml)
     └── audit_log  (every password reset)              courses ── course_translations
```

### Two convention decisions worth stating

**Timestamps are `timestamptz`, not ISO text.** Text timestamps were tolerable
while the app only listed courses. They stop being tolerable the moment a teacher
asks *"who hasn't watched anything in a week"* — that is date arithmetic, and text
columns cannot do it without casting every row. Free to change now, a migration later.

**Booleans are real `boolean`.** `enabled INTEGER DEFAULT 1` was a SQLite habit
carried into Postgres. Same reasoning.

**Ids are prefixed random text** — `usr_`, `sch_`, `crs_`, `lsn_`, `vid_`:
readable in logs, safe in URLs, no sequence leak.

**Deletes** cascade only where the child is meaningless alone. People and progress
use `RESTRICT`.

---

## 7. Progress tracking — deliberately two numbers

There are no quizzes (a recorded product decision, `D-02`, and the existing quiz
code was deleted rather than left dormant). Progress is instead tracked two ways:

```
   watched_seconds   ← how much of the video actually played
   marked_complete   ← whether the student ticked it off
```

Teachers see **both**, so a lesson ticked two minutes in is visibly distinguishable
from one watched through. One number would have collapsed that distinction and
made the teacher dashboard quietly dishonest.

---

## 8. Screens

| Route | Screen | Notes |
|---|---|---|
| `/login` | Sign in | Username + password, language toggle |
| `/learning` | My Learning | Enrolled + available courses, progress, Resume |
| `/learn/[trackId]` | Resume redirect | Jumps to the current session |
| `/learn/[trackId]/[sessionId]` | **Session player** | Video stage, curriculum sidebar, EN/ML toggle, downloads |
| `/certificate/[trackId]` | Certificate | Bilingual NEXIS × Kerala completion certificate |
| `/teacher` | Teacher | Class stats, per-phase coverage |
| `/admin` | Admin | Platform usage, content library |
| `/admin/studio` | **Content Studio** | Authoring: course → chapter → lesson, upload, live encode progress |

---

## 9. The known blocking defect, stated plainly

The project brief records it without softening, because it sets the estimate:

> There are two copies of the curriculum. A hard-coded file (`lib/data.ts`) drives
> every student screen; the database drives only the admin console. **An admin can
> upload and publish a video today and no student will ever see it.**

The fix — pointing the learner pages at `getCourseTree()` instead of `lib/data.ts`
— is the first real milestone. Documenting it as *the* blocker rather than a
backlog item is what keeps it from being rediscovered in testing week.

---

## 10. What `anik-appycodes` contributed

**28 commits — the largest contributor on the repo (28 of 36).** The work is the
entire back half of the application: the brief that scoped it, the schema, the
data layer, and the whole authentication system.

### Defining the build (Day 0)

Authored the three planning documents the team works from:
`docs/AI-VEDA-BUILD-BRIEF.md` (two-page version for client sign-off),
`docs/BRIEF-DETAIL.md` (full team reference with a 17-item decision register
`D-01`…`D-17`), and `docs/TASKS.md` (**125 tasks across 13 build days and 5 test
days**). Every commit in the repo references a task id, so the plan and the code
stay joined up.

This included being direct about the state of the code — the "two copies of the
curriculum" blocker above is his write-up, surfaced *before* the estimate rather
than after.

### Schema and migrations (`P1-01` … `P1-09`)

- Wrote `docs/SCHEMA.md`, the 19-table target schema spec, reviewed before a single
  migration was written.
- Authored all 8 migrations (`0001_drop_legacy` → `0008_encode_jobs`) and the
  migration runner (`scripts/migrate.mjs` with `--dry-run` and `--status`), plus
  verification tooling: `db-verify.mjs`, `db-smoke.mjs`.
- Made the `timestamptz` and real-`boolean` conversion calls, and the
  **store storage keys, not absolute URLs** change (`P1-01` follow-up) that
  decoupled the database from the CDN hostname.
- Established that **Supabase is a Postgres host and nothing else** — RLS is not
  in play, authorisation is application-side. Written into the schema doc so the
  assumption cannot be silently made later.

### Data layer rewrite (`P1-11`, `P1-13`)

Rewrote `lib/db/repo.ts` end to end against the new schema — the typed CRUD layer
that is the only place SQL is written. This was flagged as a blocker and cleared.

### Authentication core (`P2-01` … `P2-05`, `P2-08`, `P2-09`, `P2-22`)

Built the whole auth system, the largest single subsystem in the repo:

- `lib/auth/password.ts` — hashing and verification
- `lib/auth/token.ts` — signed session tokens, Edge-verifiable
- `lib/auth/session.ts` — server-side `sessions` rows, revocable
- `lib/auth/current.ts` — the one place that re-checks a session against the DB
- `lib/auth/guard.ts` — `requireUser` / `requireRole` / `requirePage`, deny-by-default
- `middleware.ts` — Edge route protection with the role rule table
- `app/api/auth/{login,logout,me,seed-demo}` — the endpoints
- `scripts/create-users.ts`, `verify-auth.mjs`, `verify-password.ts` — operational tooling

The **two-layer design is his** — cheap signature-only checks on the Edge for
routing, authoritative DB session checks in Node for data — along with the
reasoning comments in the files that explain why each layer cannot do the other's
job. The self-review pass that followed (`c0acfda`) caught two real problems in
his own code: audit rows being deleted on user removal (audit trails must survive
their subject), and the root route not dispatching by role.

### Content and correctness

- Replaced the placeholder 16-session curriculum with the real 6/8/10-session
  courses (`P1-12`), and cleaned up the "6 phases" text left behind on
  unenrolled course cards.
- Removed the quiz feature wholesale (`P1-10`) once `D-02` was decided — deleted,
  not commented out.
- Wired Sentry across client/server/edge (`P6-01`), errors only, working without
  a DSN configured so local development is unaffected.
- Wrote `CONTRIBUTING.md` and `DEPLOY.md`, and the `npm run verify` gate
  (`tsc --noEmit && next build && db:smoke && verify:password`).
- Contributed to the video pipeline's R2 publisher and orchestration
  (`lib/video/r2.ts`, `lib/video/pipeline.ts`).
