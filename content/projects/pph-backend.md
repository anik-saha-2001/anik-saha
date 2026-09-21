---
title: "Player Profile Hub — Backend API"
slug: "pph-backend"
summary: "Express 5 + Prisma REST API for a football scouting platform — Mux video webhooks, hot counters, Stripe billing, and a public crawler-safe surface."
tags: ["Node.js", "Express", "Prisma", "Stripe", "Mux", "Redis"]
type: "Backend"
order: 3
featured: true
date: "2026-09-17"
---

# Player Profile Hub (PPH) — Backend API

**Repo:** `Backend/pph-backend`
**Type:** Express 5 + TypeScript + Prisma REST API — a football player discovery platform with video highlights, tiering, subscriptions and scouting networks

---

## 1. The problem

Young footballers have no credible, shareable, verified profile. Scouts and clubs
have no reliable way to find them. Existing routes are word-of-mouth, agents, and
video sent over WhatsApp.

Player Profile Hub is the platform for that: a player builds a verified profile
with video highlights, earns a **tier** through genuine engagement, is discoverable
by scouts and clubs, and can be contacted through the platform. Video minutes and
premium features are monetised through Stripe.

The engineering problems that fall out of that:

- Video ingest is asynchronous and provider-owned (Mux), so **webhooks are the
  source of truth** and a missed webhook is a stuck upload.
- Counters (views, followers, highlights) are hot and would hammer the database
  if written per-event.
- Payment state lives at Stripe; the local database is a cache that can drift.
- The mobile app and the web app are separate clients that must share one session.
- A public, crawler-facing surface must exist without leaking anything private.

---

## 2. Stack

```
Node.js 20 · TypeScript 6 · Express 5
PostgreSQL 16 + Prisma 7 (@prisma/adapter-pg)
Redis + BullMQ + ioredis        node-cron (6 scheduled reconcilers)
JWT + bcrypt (auth)             Zod (validation at every route boundary)
Mux (@mux/mux-node)             Stripe 22
AWS S3 + presigned URLs         AWS SES / SendGrid          Supabase
Didit (identity verification)   Sentry
helmet · cors · express-rate-limit · morgan · winston (+ daily rotate)
qrcode · nanoid · slugify · multer
Docker + docker-compose
```

---

## 3. Architecture — a strictly enforced layering

`ARCHITECTURE.md` is declared the source of truth for structure, and every module
follows the same seven-file shape. This is a codebase with **24 domain modules**;
without an enforced shape it becomes 24 different codebases.

```
  src/
    _modules/<domain>/          ← feature code, one folder per domain
       <domain>.route.ts        route defs + Zod validate() middleware
       <domain>.controller.ts   HTTP in/out. Calls services. Nothing else.
       <domain>.schema.ts       Zod schemas + z.infer<> types
       <domain>.service.ts      business logic. Calls repo/, lib/, utils/
       <domain>.dto.ts          service input payload + output DTO types
       <domain>.helper.ts       domain-aware helpers (only if needed)
       index.ts                 exports router + service namespace
    repo/                       shared DB access. PRISMA CALLS ONLY.
    lib/                        third-party wrappers: mux · stripe · email ·
                                supabase · didit
    utils/  http/  middlewares/  config/  types/
    jobs/                       cron.ts + 6 reconciliation tasks
    routes/index.ts             central route registry
    app.ts   server.ts          graceful shutdown, pool disconnect
```

### The data-flow contract

```
   HTTP Request
        │
        ▼
   route.ts        validate({ body, params, query })   ← Zod applied HERE, once
        │
        ▼
   controller.ts   TypedRequest<Body, Params, Query>   ← types from z.infer<>
        │          assembles the service payload
        │          IDs from params passed SEPARATELY — never merged into payload
        ▼
   service.ts      identifier args (id, slug) separate from payload
        │          in:  XPayload (from .dto.ts)
        │          out: inferred, or XDTO when fields are computed/derived
        ▼
   repo/<model>.repo.ts   in:  primitives or Prisma where/data types
        │                 out: full Prisma model type
        ▼
   PostgreSQL via Prisma
```

Keeping ids out of the payload object is the rule that prevents the classic
mass-assignment bug: a client cannot smuggle `{ id: <someone else's> }` into a
body and have it reach an update.

### The 24 modules

```
  auth  user  player  video  highlight  feed  follow  like  view
  message  contact  notification  subscription  purchase  tier  tier-event
  network  session  token  upload  verification  webhook  admin  public  internal
```

---

## 4. Route mounting order is load-bearing

```ts
router.use("/webhooks", webhookRouter);          // ← MUST be first

router.use(express.json({ limit: "1mb" }));      // ← everything below gets JSON
router.use("/public",  publicRouter);            // unauthenticated, SEO-safe
router.use("/auth", "/users", "/players", "/videos", "/highlights", …);
router.use("/internal", internalRouter);         // 404s in production
```

The Mux and Stripe webhook endpoints use `express.raw()` to read the **raw body
Buffer** for signature verification. If any global `express.json()` runs first,
the raw body is consumed and signature verification fails **100% of the time** —
a failure that looks like "the webhook secret is wrong". The comment in
`routes/index.ts` says so explicitly, because the fix is non-obvious and the
symptom is misleading.

---

## 5. Video ingest — webhook-driven, with a reconciler behind it

```
  CLIENT                    API                     MUX                    DB
    │  POST /uploads         │                       │                      │
    ├───────────────────────▶│ create direct upload  │                      │
    │                        ├──────────────────────▶│                      │
    │◀─── signed upload URL ─┤◀──────────────────────┤   Video row          │
    │                        │                       │   status=PENDING ───▶│
    │  PUT bytes ────────────────────────────────────▶                      │
    │                        │                       │ encode…              │
    │                        │◀── POST /webhooks/mux ┤                      │
    │                        │    express.raw()      │                      │
    │                        │    verify signature   │                      │
    │                        │    over the RAW body  │                      │
    │                        │    → status=READY ───────────────────────────▶│
    │                        │                       │                      │
    │  GET /videos/:id  ─────▶  READY, playbackId    │                      │
    │                        │                       │                      │
    │        ┌───────────────┴───────────────────────────────────────────┐  │
    │        │ IF the webhook's DB write failed:                         │  │
    │        │   cron */5 min  reconcileStuckAssets()                    │  │
    │        │   → ask Mux for the truth, repair the row                 │  │
    │        └───────────────────────────────────────────────────────────┘  │
```

A webhook that arrives while the database is briefly unavailable is silently
lost — Mux considers it delivered. `reconcileStuckAssets` is the answer:
**every webhook has a reconciler**, because a webhook alone is at-most-once from
the database's point of view.

Raw videos are ephemeral (`cleanupExpiredVideos` runs every minute, deleting
Videos past their 24-hour window); **Highlights** are the durable, curated artefact.

---

## 6. Scheduled reconciliation — the whole cron surface

```
  every minute    cleanupExpiredVideos          delete Videos past their 24h window
  every minute    flushViewCounts               Redis buffer → Postgres, in batches
  every 5 min     reconcileStuckAssets          repair rows whose webhook write failed
  scheduled       reconcilePendingPurchases     Stripe truth → local Purchase rows
  scheduled       processGracePeriodExpirations subscription lapsed → lock content
  monthly (2am 1st) reconcilePlayerCounters     recompute follower/highlight/view counts
```

The shape is consistent and deliberate: **every async or external-state
dependency has a periodic job that treats the external system as the truth and
repairs local state.** Each `cron.schedule` wraps its task in try/catch and logs —
one failing job never takes the scheduler down.

### Why view counts are buffered

`viewsCount` on a hot player profile would otherwise be a write per page view.
Views land in Redis and are flushed to Postgres once a minute in batches; the
monthly `reconcilePlayerCounters` corrects any drift from lost buffers.

---

## 7. Tiering and the level engine

```
   Tier:  STANDARD → SILVER → GOLD → BLACK_ELITE → PLATINUM
   Player.level  (default 60)
   Player counters: followerCount · highlightCount · viewsCount
                    │
                    ▼
       recomputePlayerTier(playerId, tx?)     ← accepts a transaction, so a tier
       recomputePlayerLevel(playerId, tx?)      change is atomic with the event
                    │                            that caused it
                    ▼
       TierConfig / TierAnimationConfig  ← thresholds and celebration animations
                    │                       are CONFIG rows, not constants
                    ▼
       TierUpgradeEvent  +  TierUpgradeEventSeen
                    │
                    ▼
       the app shows the upgrade animation exactly once per user
```

Thresholds live in `TierConfig` rows rather than in code, so the growth team can
retune progression without a deploy. `TierUpgradeEventSeen` is what stops the
celebration replaying on every app open — the event is durable, the *seen* marker
is per-user.

---

## 8. Subscriptions, purchases and the grace period

```
   SubscriptionPlan:  FREE  →  300s of video (5 min)
                      PAID  →  900s (5 base + 10 from plan)
   + top-up blocks purchasable in bulk, several in ONE checkout session

   Stripe Checkout ──▶ webhook /webhooks/stripe (raw body, signature verified)
          │                        │
          │                        ▼
          │              Subscription / Purchase rows
          │                        │
          ▼                        ▼
   reconcilePendingPurchases   processGracePeriodExpirations
   (Stripe is the truth)              │
                                      ▼
                   subscription lapses → GRACE PERIOD
                                      │
                                      ▼
                   player CHOOSES which highlights to retain;
                   the rest get gracePeriodLocked = true
                   (hidden, not deleted — resubscribing restores them)
```

Locking rather than deleting is the important call: a lapsed subscription that
destroyed a player's highlight reel would make resubscribing pointless and the
support burden permanent.

---

## 9. Auth, sessions and the mobile→web handoff

```
   /auth/register  /login  /refresh  /logout
   /auth/verify-email  /verify-otp  /forgot-password  /reset-password  /resend
   /auth/switch-master  /switch-profile  /master/verify-otp
   /auth/session-handoff        ← one-time HANDOFF token
```

```
   MOBILE APP (signed in)                    WEB BROWSER
        │                                          │
        │ POST /auth/session-handoff               │
        ├──────────────────────▶ Token{type:HANDOFF}
        │                        single-use, short TTL
        │◀── deep link / QR ────┤                  │
        │                                          │
        └──── user opens the link ────────────────▶│
                                                   │ POST consume-handoff
                                                   │ (optionalAuthenticate)
                                                   ├────▶ Session created
                                                   │◀──── web is signed in
```

The token is single-use and short-lived, and consuming it is deliberately
`optionalAuthenticate` — the browser has no session yet, which is the entire
point. This is what makes "scan the QR on your profile to open it on a laptop"
work without asking the player to type a password on a second device.

`Identity` + `AuthProvider` support multiple sign-in methods per user;
`switch-profile` handles a user who owns more than one player profile
(a parent managing two children, a club managing several).

---

## 10. The public surface

`/api/v1/public` is mounted **before** the authenticated routers and is
read-only. It serves crawler-facing player profiles (`publicSlug`, unique) for
SEO. `Player` carries explicit `isPublic` and `isDiscoverable` flags, separate
from each other: a profile can be viewable by someone with the link while not
appearing in discovery.

---

## 11. Data model highlights

```
  User ─┬─ Identity[]        (multiple auth providers)
        ├─ Session[]         (revocable)
        ├─ Token[]           (EMAIL_VERIFY · PASSWORD_RESET · HANDOFF · …)
        ├─ Player[] ─┬─ Video[]      (ephemeral, 24h)
        │            ├─ Highlight[]  (durable, curated, gracePeriodLocked)
        │            └─ TierUpgradeEvent[] ── TierUpgradeEventSeen
        ├─ Subscription · Purchase
        ├─ Follow · Like · Share · View   (polymorphic: actorType + actorId)
        ├─ Message · Contact
        └─ Notification ── NotificationDelivery  (per-channel delivery state)

  Network  (PartnerCategory — clubs, academies, agencies)
```

`Like` / `View` / `Follow` are **polymorphic by actor**: `actorType` + `actorId`
rather than `userId`, so a club, a scout and a player can all be the actor
without three parallel tables.

`NotificationDelivery` separated from `Notification` means one notification can
have independent per-channel state (push delivered, email bounced) instead of a
single status that has to lie about one of them.

---

## 12. What `anik-appycodes` contributed

**167 commits — the second-largest contributor, and the owner of the auth,
messaging, contact and payment-integration surfaces.**

Files touched, by area: `_modules/auth` (73), `_modules/player` (56), `repo/` (48),
`_modules/user` (47), `_modules/message` (40), `_modules/follow` (38),
`_modules/contact` (34), `_modules/subscription` (15), plus Prisma schema,
Swagger schemas and email templates.

### Auth module — owned end to end

- `3474c51 / f2d827a refactor: modularize auth service logic` — broke a monolithic
  auth service into the module shape `ARCHITECTURE.md` mandates, and updated the
  controller endpoints to match.
- `903dcb2 feat: auth module refactoring and schema validation updates` — Zod
  schemas at every auth route boundary.
- `8825546 fix: correct input validation logic in auth controller to prevent
  unauthorized access` — a real authorisation bug, not a style fix.
- `4421b25 / 22d4b74` — refresh-token and expired-session error handling; the
  controller was throwing instead of returning a clean 401, so the client could
  not distinguish "refresh me" from "something broke".
- `6cf5aac refactor: move authentication middleware to specific user routes for
  granular access control` — replaced a blanket router-level `authenticate` with
  per-route application, so a route that should be public is public by intent
  rather than by exception.

### Mobile→web session handoff — the whole feature

`d857d48`, `c45ae41`, `a6c06f5`, `b5b94c4`, `0e3fb80`, `cc0eabe`, `a6be13f`.

Added `HANDOFF` to the `TokenType` enum, built the one-time-token initiate and
consume flow, the session-management and schema changes around it, made the
consume route `optionalAuthenticate` (the browser has no session yet — that is
the point), and fixed the public QR URL. This is what makes a player's QR code
open their profile as *them* on a laptop.

### Messaging — and a security fix in it

- `c6afdf9 feat: implement message notification` — the notification side of
  messaging.
- `cb3ef8a refactor: secure message creation by deriving sender context from auth
  session instead of client input` — **the important one.** The API had been
  trusting a client-supplied sender; a caller could send a message *as* someone
  else. Now the sender is derived server-side from the authenticated session.
- `b844ac6 feat: take SenderType instead of string value` — replaced a free
  string with the typed enum, so an invalid sender type is a compile error.

### Contact module

`b2348d9 feat: remove user dependency from contact module to support
unauthenticated submissions` — a contact form that requires an account is a
contact form nobody fills in. Plus `100f26d` / `b67113b`: the contact email
notification and its template.

### Likes made polymorphic

`c8735a1 refactor: update like system to support multi-actor types by replacing
userId with actorType and actorId` — a schema and service change that let clubs,
scouts and players all be actors on the same table instead of forking it three ways.

### Payments and subscriptions

- `2d6fa06 feat: enable bulk purchase of multiple top-up blocks in a single
  checkout session` — one Stripe session for several blocks instead of one per
  block.
- `12ffb2e feat: implement billing history and grace-period highlight retention
  selection` — the grace-period feature above: when a subscription lapses, the
  player chooses what to keep rather than losing it.
- `b80b11c` — Stripe checkout configured to persist billing addresses, and the
  subscription-ID retrieval updated for Stripe API version compatibility (a
  silent breakage waiting for the next version bump).
- `20e035b feat(subscription): add flag-gated live payment smoke test` and
  `501106d chore(env): warn at boot when live payment test flag is on in
  production` — the same pattern applied here as on Impact Express: verify the
  *live* payment path safely, and make it impossible to leave the switch on by
  accident.

### Verification, users and discovery

- `19663d9` — migrated email-verification logic out of the user service into the
  dedicated `verification` module, where it belongs.
- `fec6b0a` — automated verification in simulated environments, so non-production
  testing does not require a real identity check.
- `c9cad32 feat: exclude viewer-related profiles from player suggestions using
  dynamic ID filtering` — suggestions were showing you people you already follow,
  and yourself.
- `343e9cf` — self-follow validation in the follow service.
- `9c7d47d feat(follow): add player level in response of both following and
  followers data`, `158ca4c` (accountType in the user DTO), `5e38c7b`
  (`getUserById` endpoint).

### Infrastructure and correctness

- `90717d2 fix(env): reduce default DB pool size for production environment` —
  a pool sized for a laptop exhausts a managed Postgres instance's connection
  limit.
- `b5b94c4 feat: update recomputePlayerTier and recomputePlayerLevel to accept
  transaction parameter` — so a tier recomputation is atomic with the event that
  triggered it, rather than a second write that can fail on its own.
- `76b3541 / c61ea5d` — upload service moved from Blob to Buffer, fixing a
  Node-side handling bug, plus feed service formatting.
- `ba806cb` — email service configuration and environment-variable validation.
