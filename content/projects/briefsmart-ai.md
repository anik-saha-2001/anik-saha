---
title: "BriefSmart.ai — AI Onboarding Briefs"
slug: "briefsmart-ai"
summary: "AI pipeline that turns sales-call transcripts and documents into a structured, editable 7-section client onboarding brief."
tags: ["React", "TypeScript", "AI Pipeline", "TanStack Query"]
type: "Full-stack"
order: 4
featured: true
date: "2026-09-17"
---

# BriefSmart.ai — Frontend

**Repo:** `Frontend/briefsmart.ai`
**Type:** Single-page React application (Vite)
**Pairs with:** [`backend/briefsmart-ai-backend.md`](../backend/briefsmart-ai-backend.md)

---

## 1. The problem

A digital agency wins a deal on a sales call. Everything that matters — the
client's actual goals, the numbers they quoted, what the agency promised, the
deadlines that gate everything else — exists as a call recording, a transcript,
a scattering of documents and somebody's memory. The delivery team then starts
work from a two-line Slack handover.

BriefSmart closes that gap. It ingests the raw artefacts of a sale, runs them
through an AI pipeline, and produces a **structured 7-section onboarding brief**
that the delivery team can actually start from — reviewable and editable by a
human before it is handed over.

The frontend is where the account manager lives: create the deal, collect the
inputs, watch the brief generate, edit it, hand it over.

---

## 2. Stack

```
Vite 5 · React 18 · TypeScript · React Router 6
shadcn/ui (Radix primitives) + Tailwind CSS + tailwindcss-animate
TanStack Query 5 (server state)      react-hook-form + Zod (forms)
react-markdown + remark-gfm (brief rendering)   Recharts (KPI visuals)
sonner + Radix Toast (notifications)            Vitest + Testing Library
```

Originated as a Lovable/gpt-engineer scaffold, then taken over and wired to a
real backend.

---

## 3. Application structure

```
src/
  App.tsx                  Route table (9 routes) + QueryClient + Tooltip/Toast providers
  components/
    AppLayout.tsx          Shell: sidebar + content
    AppSidebar.tsx         Primary navigation
    StatusBadge.tsx        Deal status chip — one component, five states
    brief/
      BriefSectionEditor.tsx   ← the editable section of a generated brief
      ChallengesVisual.tsx     ─┐
      GoalsKPIChart.tsx         │  per-section visualisations, chosen by
      ScopeChecklist.tsx        ├─ a section→component mapping so a brief
      StakeholderTable.tsx      │  renders richer than plain markdown
      TimelineVisual.tsx       ─┘
    ui/                    ~50 shadcn primitives
  pages/
    Index.tsx              Deal pipeline dashboard + stats
    DealDetail.tsx         One deal: files, form submissions, notes, generate
    BriefViewer.tsx        The 7-section brief, section-by-section editing
    FormBuilder.tsx        Build an onboarding form template
    ClientForm.tsx         The public-facing form a client fills in
    Clients.tsx / ClientDetail.tsx
    Notifications.tsx      Brief-generated / form-submitted feed
    Settings.tsx
  lib/api.ts               The single typed API client — every call in one file
  types/index.ts           Deal, OnboardingBrief, BriefSection, Notification, …
```

---

## 4. The deal lifecycle

The whole product is one state machine, and the UI is a view onto it:

```
    new ──────▶ collecting ──────▶ processing ──────▶ brief_ready ──────▶ handed_over
     │              │                   │                  │                   │
  deal created   files +            AI pipeline        7-section brief     delivery team
  from a won     onboarding-form     running            editable by AM      picks it up
  sale           responses           (async)            + regenerate
                 arriving
```

`DealStatus` is a union type in `src/types/index.ts`, so every screen that
renders a status is exhaustively checked at compile time — adding a sixth state
breaks the build in every place that has to care.

---

## 5. End-to-end flow

```
 ACCOUNT MANAGER                FRONTEND                    NODE API              PYTHON AI
 ──────────────                 ────────                    ────────              ─────────
  create deal
      │  POST /deals
      ├────────────────────────────────────────────────────────▶ deals row
      │                                                          status = new
      │
  build onboarding form
      │  GET /forms/templates
      ├───────────────────────────────────────────────────────▶
      │  send form link to client ─────────────┐
      │                                        ▼
      │                              CLIENT fills /form/:formId
      │                                        │ POST /forms/submit
      │                                        └───────────▶ form_submissions
      │                                                       status = collecting
  upload transcript / docs / notes
      │  multipart POST /files/upload
      │  { file[], tenantId, dealId,
      │    category: transcript|document|note }
      ├────────────────────────────────────────────────────────▶ S3 + files row
      │                                                          │
      │                                                          │ AMQP
      │                                                          ├──────────────▶ Agent 2
      │                                                          │       extract raw text
      │                                                          │               │
      │                                                          │             Agent 3
      │                                                          │       extract insights
      │                                                          │      goals / pain points /
      │                                                          │      commitments / timelines /
      │                                                          │      risks / budget signals
      │                                                          │               │
      │                                                          │             Agent 5
      │                                                          │      synthesise 7-section brief
      │                                                          │               │
      │                                                          │◀── brief.generated ──┘
      │                                                       briefs row, version n
      │  GET /briefs/deal/:dealId                             status = brief_ready
      │◀───────────────────────────────────────────────────────┤
      │
  review in /brief/:dealId
      │  edit a section
      │  PATCH /briefs/:briefId/sections/:sectionId
      ├────────────────────────────────────────────────────────▶ section content replaced
      │
      │  add more files → pipeline re-runs → brief version n+1
      │                                     (previous version preserved)
      ▼
   hand over
```

---

## 6. The brief renderer

A generated brief is not dumped as markdown. `BriefViewer` walks
`brief.content.sections[]` and, for each section, looks up a **visual component**
by section id:

```
   BriefSection { id, title, content, locked }
            │
            ▼
   ┌──────────────────────────────────────────────────────────┐
   │  section id → visual component map                       │
   │    goals        → GoalsKPIChart        (Recharts)        │
   │    challenges   → ChallengesVisual                       │
   │    scope        → ScopeChecklist                         │
   │    stakeholders → StakeholderTable                       │
   │    timeline     → TimelineVisual                         │
   │    (default)    → react-markdown + remark-gfm            │
   └──────────────────────────────────────────────────────────┘
            │
            ▼
   BriefSectionEditor — inline edit, PATCH on save, `locked` blocks editing
```

`locked` on a section is what survives regeneration: a section a human has
signed off is not silently overwritten by the next AI pass.

---

## 7. The API client

Every network call in the app goes through `src/lib/api.ts` — one file, one
error convention, no `fetch` scattered through components:

```ts
API_BASE_URL = import.meta.env.VITE_API_URL + "/api/v1"

api.deals         getStats · list · get · create · addNote
api.clients       list · get · create
api.briefs        getLatest(dealId) · updateSection(briefId, sectionId, content)
api.files         upload(files[], tenantId, dealId, category) · getContent(id) · delete(id)
api.forms         listTemplates · getTemplate · submit
api.notifications list · markAsRead
```

Two transports, deliberately separate: `fetchAPI` sets `Content-Type:
application/json`; `fetchFormData` sets **nothing** and lets the browser generate
the multipart boundary — setting it by hand is the classic upload bug.

Errors are normalised once: a non-`ok` response is parsed for `{ error }` and
re-thrown as a real `Error`, so every TanStack Query `onError` sees a consistent
shape.

---

## 8. Multi-tenancy

`tenantId` is threaded through every write (it is a required field on file
upload, and present on `Deal`). The product is built for an agency-per-tenant
model from the first commit rather than retrofitted — cheap now, a rewrite later.

---

## 9. What `anik-appycodes` contributed

**8 commits, and the single largest share of the repo's authored code** (the
remainder is Lovable scaffold and a collaborator's UI work). The theme is
consistent: this is the person who took a generated prototype and made it a real
application talking to a real backend.

### Wired the frontend to the API — the pivotal change

`9896f28 feat: Integrate API for deal management…` is the commit that turned the
prototype into a product. It introduced `src/lib/api.ts` — the entire typed API
client above — and replaced `src/data/mockData.ts` reads across the dashboard,
deal detail, notifications and settings screens with live calls.

Touched in that pass: `pages/Index.tsx`, `pages/DealDetail.tsx`,
`pages/Notifications.tsx`, `pages/Settings.tsx`, `types/index.ts`.

### File upload pipeline

`55388f0` — implemented multipart upload for transcripts and documents:
multi-file selection, the `category` discriminator
(`transcript | document | note`) that tells the Python pipeline how to treat each
input, and the `fetchFormData` transport that avoids the manual-boundary bug.
The same commit refactored client data access in the deal views so a deal reads
its client through a relation rather than a duplicated blob.

### File-based internal notes

`cdfe5b9` — reworked internal notes from free text into **file-backed records**,
so a note is a first-class input to the AI pipeline exactly like a transcript is,
with the content retrievable for display (`api.files.getContent`). This is what
lets an AM's own written context feed the brief rather than being invisible to it.

### Brief editor and section visuals

Built `components/brief/BriefSectionEditor.tsx` — inline per-section editing with
the `PATCH /briefs/:id/sections/:sectionId` write path and the `locked` guard.
Also made the judgement call to disable `GoalsKPIChart` in the section-visual map
(`0bf1fba`) when the chart was misrepresenting sparse LLM output — a visual that
lies is worse than plain text.

### Forms and client capture

Work on `pages/FormBuilder.tsx`, `pages/ClientForm.tsx` and `pages/Clients.tsx` —
the template-builder side (agency defines the onboarding questions) and the
client-facing submit side.

### Build and configuration

`vite.config.ts` (build target), `tailwind.config.ts`, `tsconfig.node.json`,
dependency management — the unglamorous half of making a Lovable export
deployable and maintainable outside Lovable.
