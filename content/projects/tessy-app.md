---
title: "Tessy — AI-Assisted SEO/GEO Delivery Platform"
slug: "tessy-app"
summary: "Next.js platform running a nine-stage SEO agency workflow with AI agents doing production work and humans holding approval gates."
tags: ["Next.js", "Server Actions", "AI Agents", "SEO"]
type: "Full-stack"
order: 8
featured: false
date: "2026-09-17"
---

# Tessy — AI-Assisted SEO/GEO Delivery Platform

**Repo:** `Frontend/tessy-app` · **Client:** POLARIS
**Type:** Full-stack Next.js 16 application — UI, Server Actions, agent framework, background jobs
**Phase:** Phase 1, built and deployed

---

## 1. The problem

An SEO agency's delivery process is nine repeated stages: onboard the client,
audit their site, build a strategy, get it approved, scope the work, get *that*
approved, execute tasks, review the output, release it to the client, then track
the impact. Most of it is judgement work that an agency does well and slowly.
Some of it is production work that an LLM does adequately and instantly.

Tessy is the platform that runs the whole nine-stage flow with **AI agents doing
the production and humans holding the gates**. Every generated artefact passes
through an account manager before a client ever sees it.

The second problem, and the one that shaped the architecture: the platform had to
be **built, deployed and demonstrable while the client's own credentials, prompts
and templates did not yet exist.**

---

## 2. The core design decision: credential-aware adapters

> Every external dependency is credential-aware: when its credentials are
> absent, it serves fixture data **and reports that it did**, rather than throwing.

```
   ┌────────────────────────────────────────────────────────────────┐
   │  src/lib/providers/config.ts   — credential detection           │
   └───────────────────────────────┬────────────────────────────────┘
                                   │
        ┌──────────────┬───────────┴───────────┬──────────────┐
        ▼              ▼                       ▼              ▼
   claude.ts     perplexity.ts             seo.ts      search-console.ts
   Anthropic     GEO prompt-panel     one interface,   service-account JWT
   SDK           runner               three vendor     + searchAnalytics
                                      adapters
        │              │                       │              │
        └──────────────┴───────────┬───────────┴──────────────┘
                                   │  no credential?
                                   ▼
                            fixtures.ts  (recorded-shape fallbacks)
                                   │
                                   ▼
                       every record carries  dataSource: "live" | "fixture"
                                   │
                                   ▼
                    Live/Fixture badge on /clients, /review-queue,
                    /tasks, /impact, and the audit + strategy triggers
```

When a real key lands, the only thing that changes is `dataSource` flipping from
`"fixture"` to `"live"`. **If anything else has to change, the adapter boundary
was drawn in the wrong place** — that is the stated test the design is held to.

Crucially the badge is per-*record*, not a global build-status banner. A
developer dashboard (`/system`) existed and was removed: Tessy is a client/AM-facing
product, and "is *this* run real?" is the only version of that question a user needs.

---

## 3. Stack

```
Next.js 16 (App Router, Server Actions, `proxy.ts` — middleware is deprecated in v16)
React 19.2 · TypeScript 5 · Tailwind CSS 4
Supabase (Postgres + Auth + RLS)  @supabase/ssr
@anthropic-ai/sdk (Claude — structured outputs, adaptive thinking)
Perplexity (GEO answer-engine panel)   Google Search Console (service-account JWT)
Vercel Cron → /api/cron  (refuses to run without CRON_SECRET)
```

---

## 4. The nine-stage flow → routes

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         TESSY PLATFORM FLOW                             │
  └─────────────────────────────────────────────────────────────────────────┘

   sign in                                                        /login
      │                                                    (no public sign-up;
      ▼                                                     Phase 1 issues no
  ┌────────────────────┐                                    client logins at all)
  │ 1 CLIENT ONBOARD   │  /clients/new → /clients → /clients/[id]
  │   wizard, gated    │  onboarding-wizard.tsx: per-step gating, inline errors,
  │   step by step     │  region picker, GSC property validation, AM assignment
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   runAuditNow()  ── SEO adapter ──▶ vendor API
  │ 2 AUTOMATED AUDIT  │   /clients/[id]/audit             ── GEO ──▶ Perplexity
  │   SEO + GEO        │   stored as one JSON snapshot per run
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   generateStrategyNow()  ── streamed as a background job
  │ 3 STRATEGY GEN     │   /clients/[id]/strategy   saved as a draft
  ├────────────────────┤
  │ 4 STRATEGY REVIEW  │   approveStrategy()  ◀── HUMAN GATE
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   generateScopeNow()  — resolves against the APPROVED
  │ 5 SCOPE GEN        │   strategy, not the newest draft
  ├────────────────────┤
  │ 6 SCOPE REVIEW     │   approveScope()  ◀── HUMAN GATE
  └─────────┬──────────┘        │
            │                   └─▶ the ONLY place scope items become real
            ▼                       `tasks` rows
  ┌────────────────────┐   /tasks (kanban) · /tasks/[id] · /tasks/charlie/run
  │ 7 TASK EXECUTION   │   Charlie (agent) runs 6 steps → deliverable, versioned
  │   agent or human   │   human-owned tasks: human-work-panel.tsx
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   /review-queue  (cross-client, live-first)
  │ 8 AM REVIEW        │   Approve · Request Revision · Reject   ◀── HUMAN GATE
  │   + critic         │   revision notes carry through to the revision
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   /release-document/[id]   print-ready HTML
  │ 9 CLIENT RELEASE   │   → optional publish to the client's WordPress
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   /impact   real rank + Search Console fields
  │ PERFORMANCE TRACK  │   background job: 2-week and 4-week collectors
  └─────────┬──────────┘
            ▼
  ┌────────────────────┐   /learning   field-level Before/After capture
  │ LEARNING CAPTURE   │   every AM edit becomes a training signal
  └────────────────────┘
```

---

## 5. The agent framework

Charlie is not hard-coded. Charlie is a **configuration of a generic runner**:

```
  src/lib/agents/
    types.ts      AgentDefinition contract  ← the reason Tommy and Donna are
                                              config entries, not new code
    runner.ts     executes ANY definition — zero agent-specific logic
    charlie.ts    Charlie expressed as a definition (6 workflow steps)
    registry.ts   Charlie: enabled.  Tommy, Donna: declared, disabled.
    prompts.ts    Tessy's default prompt library — live and in use, replaced
                  wholesale when POLARIS's own prompts arrive
```

```
        runCharlieWorkflow(taskId)
                 │
                 ├─▶ gather context  (client, audit, strategy, scope — in PARALLEL)
                 │
                 ├─▶ step 1..6  through runner.ts
                 │        each step: prompt → Claude (structured output) → validate
                 │
                 ├─▶ CRITIC ────────────────────────────────────────────┐
                 │     deterministic.ts   11 real checks (unblocked)    │
                 │     LLM pass           CHECKLIST_CRITERIA            │
                 │     flags failures — never auto-regenerates (Phase 1)│
                 │                                                       │
                 └─▶ persistDeliverable()  → `deliverables` row, versioned,
                     one row per run. Read back by the task detail page
                     and the release document.
```

Deliverables used to live only in browser state and vanish on refresh. Persisting
them as versioned rows is what makes the revision loop, the release document and
the learning dataset possible at all.

---

## 6. Roles, capabilities, and where they are enforced

```
  src/lib/domain/roles.ts    4 roles + a capability grid
             │
             ├──▶ supabase/migrations/0002_rls.sql   RLS written AGAINST the grid
             │
             └──▶ Server Actions   transitionTask() etc. check the capability
                                   using getSignedInRole() — read from the
                                   session server-side, NEVER from a
                                   client-supplied role field
```

Two enforcement points, one source of truth. A client that posts
`{ role: "admin" }` gets nowhere: the role used is the one Supabase says the
session has.

`src/proxy.ts` (not `middleware.ts` — deprecated in this Next.js version) handles
session refresh and route gating. Gating only activates once Supabase credentials
exist, and `/login` plus `/api/cron` stay reachable without a session.

---

## 7. Schema

```
  supabase/migrations/
    0001_schema.sql                 full Phase 1 schema
    0002_rls.sql                    RLS policies matching the capability grid
    0003_seed_task_library.sql      Tessy's default task playbook — live, not scaffolding
    0004_auth_profile_trigger.sql   auth.users → user_profiles, so signing in
                                    never leaves someone role-less
    0005_api_grants.sql             GRANTs to authenticated/service_role.
                                    Required IN ADDITION to RLS — this one bit
                                    everyone the first time the schema ran against
                                    real Postgres rather than being reviewed as SQL
    0006_task_library_defaults.sql  rounds the playbook out to every strategy pillar
    0007_publishing.sql             WordPress publications
    0008_publication_key_by_task.sql
```

`0005` is worth reading in full if you ever write RLS: policies alone do not grant
table access, and the failure mode is silent empty results, not an error.

---

## 8. Background jobs

```
   Vercel Cron ──▶ /api/cron  ── refuses to run without CRON_SECRET
                       │
                       ▼
              src/lib/jobs/registry.ts     handler registry + polling loop
                       │                    (storage-agnostic by design)
                       ├─ performance-pull.ts   the 2-week / 4-week collector
                       │
                       └─ supabase-store.ts     durable store, service role
```

Strategy and scope generation also run through this: generation is a background
job that streams **stages** ("gathering context", "drafting pillar 2 of 4") rather
than raw token output. A stream of tokens looks impressive and tells an account
manager nothing about how long they are waiting.

---

## 9. Deliberate Phase 1 shortcuts

Each is traced to the proposal so none of them reads as an oversight later:

| Shortcut | Why | Phase 2 |
|---|---|---|
| Audit stored as one JSON snapshot per run | §2.2 | Relational metric model — a migration, not a bolt-on |
| No backlinks, no Core Web Vitals | Charlie does not need them (§2.2) | Added |
| One answer engine, 8 prompts max | §2.2 | Larger panels, more engines |
| Critic flags failures, never auto-regenerates | §2.3 | Auto-regeneration |
| Revision loop has no attempt counter | §2.3 | Counters + auto-escalation |
| Edit logs captured, no diff viewer | §2.6 | Diff viewer + analytics |
| Release is print-ready HTML, not generated PDF | Chromium in a serverless function is disproportionate for one doc | Server-side renderer, same content model |
| No client portal | §2.5 | Read-only portal |
| Desktop only | §3.1 #11 | Tablet/mobile alongside the portal |

Blocked items cite an `OQ-nn` id from `docs/open-questions.md`, so a `BlockedNote`
in the UI is traceable to a specific unanswered question rather than a shrug.

---

## 10. What `anik-appycodes` contributed

**52 of the repository's 62 commits.** Tessy is substantially his build: the
agent framework, the persistence layer, the approval gates, the onboarding wizard,
the publishing integration, and the manual-test-driven correctness pass that
turned a set of screens into a working pipeline.

### Made the pipeline actually connect (the structural work)

Before this work, approving anything was **cosmetic** — no code path ever created
a task for a real client, so every stage past scope generation only had something
to show for hard-coded demo clients.

- `approveStrategy` / `approveScope` — the human gates, and the only place an
  approved scope's items become real `tasks` rows.
- `b404b2c Resolve scope against the approved strategy, not the newest one` +
  `df2be6e Read the approved strategy server-side` — a genuine correctness bug:
  scope was being planned against whichever strategy draft was newest, which is
  not necessarily the one a human signed off.
- `charlie.ts persistDeliverable` — deliverables written to `deliverables` as
  versioned rows instead of living in browser state and vanishing on refresh.
  `getLatestDeliverable` is the live-first read side.
- `0498521` — fixed the task-transition crash, persisted real impact data, wired
  up the learning page.

### The onboarding wizard

Rebuilt stage 1 from a form into a gated wizard, across nine commits:

- Per-step gating with Continue disabled until the step is complete, and an
  explanation of *why* it is blocked (`494d783`, `280d693`).
- Validation moved to inline per-field errors that do not fire before the user
  has reached the field (`1768ded`, `f51948f`) — pre-emptive red text on an
  untouched form is the fastest way to make a wizard feel hostile.
- Region selection from an anchored, keyboard-correct menu that closes on
  selection and returns focus to its trigger (`f22d2ef`, `42f5141`).
- `11c3836 Validate the Search Console property against its two real forms` —
  GSC properties are either a URL prefix or a `sc-domain:` property; accepting
  anything else guarantees a later silent API failure.
- `c6c049a Stop the competitors step from being emptied to a dead end`,
  `5fcf503 Stop repeatable inputs filling with look-alike blank rows`,
  `42f4cea Cap the GEO prompt panel by rows, not by filled rows`,
  `75f94fd Show the captured values on the onboarding review step`.

### Generation as a streamed background job

`6fccd77`, `74a0840`, `153207a`, `ac4e78d` — moved strategy and scope generation
onto the background-job infrastructure, saved as drafts, and reported progress as
**named stages rather than streamed tokens** (and removed the fake blinking
cursor). The stage list is what an account manager can actually read.

### Honesty about fixtures — a security-of-truth issue

`388d58b Fix strategy/scope generation silently falling back to sample output`
and `e605643 Surface real generation failures instead of silent sample fallback`.

This is the most consequential pair of fixes in the repo. The credential-aware
design is only safe if a fixture is *labelled* a fixture; a live run that fails
and quietly returns sample output would put invented SEO strategy in front of a
paying client under a "live" badge. These commits made failure loud.

`7463d4c Verify SEO/GEO provider adapters against real API docs, fix mapping bugs`
— checked the adapters against the vendors' actual documentation rather than
against the fixtures they were written alongside, and fixed the mapping errors
that had gone unnoticed precisely because fixtures always matched.

### The review and revision loop

- `9c22ed2 Carry the AM's revision notes through to the revision` — a revision
  request whose notes never reach the regeneration is just a delete.
- `4520449 Flag a human-owned task with no content before it is reviewed`.
- `1b109d6 Show a task's real lifecycle events, not the seeded ones`.
- `92c2661 Give a specialist somewhere to attach their own work` —
  `human-work-panel.tsx`, so a human-owned task is a first-class citizen next to
  an agent-owned one.
- `7bc5945 Let an AM edit a deliverable, and capture what they changed` — the
  edit is the product *and* the training data: this is what feeds
  `src/lib/edit-log/` and the `/learning` page.

### WordPress publishing (stage 9)

`0970a2c` — publish approved content to a client's WordPress site, then
`be958ec Rename Publishing to Connections, and always create drafts` (never
auto-publish live to a client's site — create a draft and let a human press the
button), `c0124b1 Key a publication by task, not by deliverable version`
(migration `0008`), `bc15c02` (panel reacts to task status), and
`135bb71 Stop the release document crashing on non-string fields`.

### Access control and correctness

- `a7feacc Enforce capabilities on stage 1-3 writes` — the capability grid
  actually applied to writes, plus loading states and unified buttons.
- `tasks.ts transitionTask` reads the role via `getSignedInRole()` from the
  session, never from client input.
- `8fd351c Fix server/client boundary crash, rework the lifecycle stepper`,
  `76b3541 Fix onboarding duplication/data-loss and make audit module-aware`,
  `2f83fd7 Fix bugs found in the Phase 1 manual test pass`,
  `eb20b4b` (the manual-test-bugs branch).

### Performance

`d412879 Parallelize Charlie's context lookups` and
`3aece2f Surface a loading state on client cards, parallelize onboarding lookup`
— sequential awaits over four independent Supabase reads, made concurrent.
`fbf9f10 Filter Charlie's task query server-side` — filtering in the database
rather than fetching everything and filtering in JS.

### Demo, docs and design system

- `1f690d3` one-click demo logins on a two-column sign-in page (`7a3ff79`),
  renamed accounts (`63c4739`), and `ed823b9` renaming
  `NEXT_PUBLIC_DEMO_PASSWORD` → `NEXT_DEMO_PASSWORD` — a demo password does not
  belong in the client bundle.
- `e4d5221` a demo seeding script covering four pipeline stages.
- `1e69904`, `b7bf194`, `bd665f6` — release-document buttons brought onto the
  shared button system, lifecycle action labels cleaned up, review-list markers
  aligned to their text baseline.
