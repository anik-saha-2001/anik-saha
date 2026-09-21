---
title: "BriefSmart.ai — Backend & AI Pipeline"
slug: "briefsmart-ai-backend"
summary: "Polyglot backend: a TypeScript/Express system of record paired with a Python/Celery LLM synthesis pipeline joined by a message broker."
tags: ["Node.js", "Express", "Python", "Celery", "LiteLLM"]
type: "Backend"
order: 5
featured: false
date: "2026-09-17"
---

# BriefSmart.ai — Backend (Node API + Python AI Pipeline)

**Repo:** `Backend/briefsmart-ai-backend` — a polyglot monorepo: `node-api/` + `python-api/`
**Pairs with:** [`frontend/briefsmart-ai.md`](../frontend/briefsmart-ai.md)

---

## 1. The problem

Turn the raw exhaust of a sales process — call transcripts, client documents, an
account manager's own notes, onboarding form answers — into a **structured
7-section onboarding brief** the delivery team can start from.

Two very different jobs, so two very different services:

| | `node-api` | `python-api` |
|---|---|---|
| Job | System of record + HTTP API | AI pipeline |
| Speed | Milliseconds, synchronous | Minutes, asynchronous |
| Stack | TypeScript, Express, Sequelize | Python 3.12, Celery, LiteLLM |
| Owns | Postgres, S3, auth, tenants | LLM calls, document parsing, versioning |

They are joined by a message broker, not by an HTTP call. An LLM synthesis pass
that takes minutes cannot be a request the browser waits on.

---

## 2. Architecture

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                              BRIEFSMART                                   │
  └──────────────────────────────────────────────────────────────────────────┘

   React SPA
      │  /api/v1/*   (JSON + multipart)
      ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  node-api   (TypeScript · Express · Sequelize · Umzug)        │
  │                                                               │
  │  src/routes/index.ts ── mounts 6 domain routers               │
  │    /api/v1/forms     /api/v1/files     /api/v1/deals          │
  │    /api/v1/clients   /api/v1/briefs    /api/v1/notifications  │
  │                                                               │
  │  src/__core__/<domain>/                                       │
  │     <domain>.routes.ts   <domain>.controller.ts               │
  │     <domain>.model.ts                                         │
  │       brief · client · deal · file · form · notification · user│
  │                                                               │
  │  src/config/  database.ts  mongo.ts  rabbitmq.ts  env.ts      │
  │  src/messaging/  publisher.ts   consumers.ts                  │
  └───────┬───────────────────────┬───────────────────────┬───────┘
          │                       │                       │
    ┌─────▼──────┐        ┌───────▼────────┐      ┌───────▼────────┐
    │ PostgreSQL │        │      S3        │      │   RabbitMQ     │
    │ 11 tables  │        │ uploaded files │      │ topic exchange │
    │ + Umzug    │        └───────┬────────┘      └───┬────────┬───┘
    │  migrations│                │                   │        │
    └────────────┘                │        file.uploaded│        │brief.generated
                                  │                   │        │embeddings.ready
                                  │                   ▼        │
  ┌───────────────────────────────┼──────────────────────────┐ │
  │  python-api  (Celery · LiteLLM · unstructured · pypdf)    │ │
  │                               │                          │ │
  │   main.py  run_workflow(deal_id, tenant_id)               │ │
  │      │                        │                          │ │
  │      ├─ Agent 2  transcript_agent.py  ◀── reads S3 file   │ │
  │      │     parse PDF/DOCX/TXT → raw text                  │ │
  │      │                                                    │ │
  │      ├─ Agent 3  insight_agent.py                         │ │
  │      │     LLM → InsightSchema (Pydantic-validated)       │ │
  │      │                                                    │ │
  │      ├─ services/rag.py       retrieval over deal corpus  │ │
  │      │                                                    │ │
  │      ├─ Agent 5  brief_agent.py                           │ │
  │      │     fresh generation OR enhancement of v(n-1)      │ │
  │      │     services/brief_versioning.py — snapshot + version│
  │      │                                                    │ │
  │      └─ publish ─────────────────────────────────────────┼─┘
  │                                                          │
  │   MongoDB (motor)  — AI logs, snapshots, intermediate docs│
  └───────────────────────────────────────────────────────────┘
```

### Why RabbitMQ and not a direct call

The exchange is a **topic exchange** with durable queues. Three properties matter:

1. **Decoupling of runtime** — Node returns `202` immediately; Python takes
   minutes. Neither blocks the other.
2. **Survivability** — a Python worker crash mid-brief does not lose the job;
   the message is redelivered. `channel.nack(msg, false, false)` on a parse
   failure dead-letters it rather than looping forever.
3. **Fan-out** — `brief.generated` and `embeddings.ready` are independent
   signals with independent consumers.

Node's consumers (`src/messaging/consumers.ts`):

```
  QUEUE                     ROUTING KEY          ON RECEIPT
  ─────────────────────────────────────────────────────────────────────────
  node.brief.generated      brief.generated      INSERT briefs row
                                                 (dealId, tenantId, content,
                                                  version, status=completed,
                                                  generatedBy="ai")
  node.embeddings.ready     embeddings.ready     UPDATE deal_readiness
                                                 SET embeddings_ready = true
```

`deal_readiness` is a small but load-bearing table: it is how the UI knows a deal
has everything it needs before offering "generate brief", instead of the user
finding out by getting a thin brief.

---

## 3. The AI pipeline in detail

```
   INPUT                     AGENT                          OUTPUT
   ─────                     ─────                          ──────

   S3 files                  ┌──────────────────┐
   (transcript /             │ Agent 2          │           raw_text
    document / note) ───────▶│ transcript_agent │──────────▶ (+ char count,
                             │ unstructured,    │            file hash)
                             │ pypdf, python-docx│
                             └──────────────────┘
                                      │
                             ┌────────▼─────────┐
                             │ Agent 3          │           InsightSchema:
   raw_text[:15000] ────────▶│ insight_agent    │──────────▶  goals[]
                             │ LiteLLM →        │             pain_points[]
                             │ GPT-4o / Claude  │             commitments[]
                             │ strict JSON only │             timelines[]
                             └──────────────────┘             risks[]
                                      │                       budget_signals[]
                             ┌────────▼─────────┐
   insights                  │ Agent 5          │           7-section brief
   + source_text     ───────▶│ brief_agent      │──────────▶ (markdown + JSON)
   + source_files[]          │                  │            version n
   + existing_brief? ───────▶│ FRESH or ENHANCE │            snapshot frozen
   + changed_files?  ───────▶│                  │            BEFORE generation
                             └──────────────────┘
```

### The insight prompt is the product

`insight_agent.py` does not ask for "a summary". It asks a specific persona for
six specific, grounded lists, and the prompt is explicit about the failure modes:

> *Be specific and direct. Do not paraphrase vaguely — reflect the actual language
> and intent from the source. Every item must be grounded in something explicitly
> said or clearly implied. **Do not invent, assume, or pad with generic filler.***

Each field carries a worked example that demonstrates the required specificity —
e.g. `commitments` is defined as *"what the AGENCY committed to, not what the
client wants"*, with `"Dedicated senior React/Node developer assigned from Day 1"`
as the model answer. That distinction between want and promise is exactly what a
generic summariser collapses, and exactly what a delivery team needs.

Output is validated against a Pydantic `InsightSchema`, so a malformed LLM
response fails at the boundary rather than propagating into a brief.

### Versioning and enhancement

`services/brief_versioning.py` implements the loop that makes the product usable
rather than one-shot:

```
   upload more files
          │
          ▼
   get_latest_brief(deal_id)   ──▶  exists?
          │                          │
     no   │                          │  yes
          ▼                          ▼
   FRESH generation           ENHANCEMENT mode
   version = 1                version = get_next_version()
          │                    diff: new_files / removed_files / modified_files
          │                    (files carry hashes — modification is detected,
          │                     not assumed)
          └──────────┬─────────┘
                     ▼
        FREEZE SNAPSHOT before generating
        {name, hash, path} for every source file
                     │
                     ▼
        briefs/<deal_id>/brief_v<n>_<timestamp>.md
```

The snapshot is frozen *before* generation, not after, so a brief always records
the exact inputs it was built from even if the run then fails. That is what makes
"why does v2 say something different from v1" answerable.

### Tenant isolation is enforced in the pipeline, not just the API

```python
if not deal_files:
    stream_msg(f"ERROR: No files mapped to deal {deal_id}. "
               f"Aborting to prevent data leakage.")
    return
```

`deal_files_map.json` maps deal → filenames, written by Node. If a deal has no
mapping, the pipeline **aborts rather than falling back to scanning `input/`** —
because the fallback would mean one tenant's transcript feeding another tenant's
brief. Refusing to run is the correct behaviour when the alternative is a
cross-tenant leak.

### Progress streaming

`stream_msg()` prints JSON lines to stdout, which Node reads via
`child_process` and forwards to the browser as **Server-Sent Events**. The
comment on it is a warning to future maintainers: it *must* stay `print()` to
stdout, because a logger change would silently break the SSE feed the UI depends
on.

---

## 4. Data model (Postgres, 11 tables)

```
   tenants ─┬─▶ users
            ├─▶ clients ──▶ deals ─┬──▶ files            (S3 key, category,
            │                      │                       hash, metadata)
            │                      ├──▶ form_submissions
            │                      ├──▶ briefs           (JSONB content, version,
            │                      │                      status, generatedBy)
            │                      ├──▶ deal_readiness   (embeddings_ready, …)
            │                      └──▶ notifications
            ├─▶ form_templates
            └─▶ workspaces
```

Migrations run through **Umzug**:

```
  20260310000000-initial-schema
  20260310000001-add-notes-and-file-metadata
  20260310000002-add-deleted-at-to-all-tables      ← soft delete, everywhere
  20260310000003-add-updated-at-to-missing-tables
```

Soft-delete applied uniformly across every table rather than per-table on demand
— an inconsistent delete policy is a source of bugs that only appear in reporting.

---

## 5. What `anik-appycodes` contributed

**7 commits, spanning both services** — and specifically the parts that made the
system runnable end to end.

### Database foundation

`31a5ef3` and `c5ba94e` — authored **all four Umzug migrations** and the
migration runner (`scripts/migrate.ts`), plus `scripts/seed.ts`,
`scripts/diagnose-db.ts` and `scripts/integration-test.ts`. Wrote
`schema/db/init.sql` (the 11-table schema above).

The soft-delete (`deleted_at`) and `updated_at` migrations are his, applied
uniformly across every table.

### Unblocked the build

`31a5ef3` also made two pragmatic calls that let the team keep moving: temporarily
disabling RabbitMQ messaging and commenting out the `pgvector` extension setup,
both of which were blocking local startup for developers who did not yet have the
infrastructure. Blocking everyone on infrastructure nobody has yet is the failure
mode; isolating it behind a flag is the fix.

### Brief and notification modules

`c5ba94e` — implemented the **brief** and **notification** domain modules end to
end (`brief.controller.ts`, `brief.routes.ts`, `notification.controller.ts`,
`notification.model.ts`, `notification.routes.ts`) and the deal enhancements they
depend on: notes on a deal, and `/deals/stats` for the pipeline dashboard.

This is the read side of the AI pipeline — the endpoints the frontend calls to
fetch a generated brief, patch one of its sections, and surface a
"brief generated" notification.

### File ingestion

`2a81449` — multiple-file upload with type validation and a corrected storage
path layout.

`cf6a476` — added the **`note` file category** and the API for retrieving a
file's content for display. This is the change that lets an account manager's own
written context enter the pipeline as a first-class input, exactly like a
transcript, rather than being invisible to the LLM. It required changes on both
sides of the wire: the Node file module, and the Python `insight_agent` /
`brief_agent` and `models/insights.py` that consume it.

### Route wiring and config

`src/routes/index.ts` (the six-router mount), `src/index.ts` (bootstrap),
`src/config/env.ts` (environment validation), `src/db.model.ts` (model
associations) — the assembly layer that turns the domain modules into a running
service.
