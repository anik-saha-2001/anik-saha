---
title: "SmileGuard — Dental Subscription Platform"
slug: "smileguard-backend"
summary: "Express/Sequelize backend for subscription dental care — family plans, prorata billing, Razorpay, and 75 migrations across 24 modules."
tags: ["Node.js", "Express", "Sequelize", "PostgreSQL", "Razorpay"]
type: "Backend"
order: 2
featured: true
date: "2026-09-17"
---

# SmileGuard — Dental Clinic Management & Subscription Platform (Backend)

**Repo:** `Backend/smileguard-backend`
**Type:** Express 5 + TypeScript + Sequelize REST API serving **three clients** — a patient mobile app, a clinic mobile app, and a public web surface
**Scale:** 24 domain modules · 75 migrations · 35 k6 performance tests · 7 cron jobs

---

## 1. The problem

A dental network selling **subscription dental care**, not one-off appointments.
A customer subscribes, that subscription covers a family of members, each member
gets an allocation of appointments per cycle, and appointments are consumed
against that allocation at partner clinics.

That single model generates almost every hard requirement in the system:

| Because… | …the system needs |
|---|---|
| A subscription covers a *family* | Members with relationships, per-member quotas, family-size limits |
| Plans can be upgraded mid-cycle | **Prorata credit** for unused appointments |
| Money is real and Indian | Razorpay orders, webhooks, GST, invoices, commission |
| Appointments are physical events | Check-in by phone or QR, expiry, reminders |
| Clinics are independent businesses | A separate clinic app, its own auth, dashboards, commissions |
| It is health data | Scans, treatments, activity history, account-deletion rights |
| Two mobile apps ship independently | Server-driven minimum/latest version gating |

---

## 2. Stack

```
Node.js · TypeScript · Express 5
PostgreSQL + Sequelize 6 + sequelize-typescript + sequelize-cli (75 migrations)
Razorpay (payments + webhooks)      Zoho (CRM/books sync)
Firebase Admin / FCM (push)         MSG91 (SMS + transactional email)
AWS S3 + presigned URLs             ScanKit (AI dental scan analysis)
JWT + bcrypt (progressive rehashing) node-cron (7 jobs)
swagger-jsdoc + swagger-ui-express  Sentry · winston · express-rate-limit
pdfkit + to-words (invoices)        qrcode
k6 (35 performance tests)           husky + prettier
```

---

## 3. Architecture

```
  PATIENT APP          CLINIC APP              WEB / PUBLIC        RAZORPAY
       │                    │                        │                 │
       │ JWT + X-App-Version│ clinic JWT             │                 │ webhook
       ▼                    ▼                        ▼                 ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │  src/index.ts                                                          │
  │   cors ▸ rawBodyMiddleware (webhook signatures) ▸ json ▸ logger        │
  │   ▸ swagger ▸ /api ▸ Sentry error handler ▸ global JSON error handler  │
  │                                                                        │
  │  routes/index.routes.ts                                                │
  │    customerAuth = [ authenticate , captureAppVersion ]                 │
  │                                                                        │
  │    /otp             ── unauthenticated                                 │
  │    /clinic-app      ── CLINIC APP (own login, refresh, forgot/verify)  │
  │    /config          ── model config, app versions (public)             │
  │    /webhooks        ── /razorpay  (raw body, signature verified)       │
  │    /web             ── public web: registration, orders                │
  │                                                                        │
  │    /customer  /clinic  /member  /appointment  /subscriptions           │
  │    /customer-subscriptions  /activity  /notification  /orders          │
  │    /doctor  /scankit          ← all behind customerAuth                │
  └───────┬────────────────────────────────────────────┬───────────────────┘
          │                                            │
  ┌───────▼──────────────────────────┐        ┌────────▼─────────────────┐
  │  src/_core/<domain>/             │        │  src/services/           │
  │   .routes .controller .service   │        │   prorata.service        │
  │   .repo   .db.model  .schema     │        │   invoice.service (pdfkit)│
  │                                  │        │   scankit.service        │
  │  activity · admin · appointment  │        │   zoho.service           │
  │  auth · city · clinic ·          │        │   fcm.service (push)     │
  │  clinic_availability ·           │        │   msg91.service (SMS+mail)│
  │  clinic_services · commission ·  │        │   file.service (S3)      │
  │  customer · customer_subscriptions│       └──────────────────────────┘
  │  customer_preferred_clinic ·     │
  │  dashboard · doctor · media ·    │        ┌──────────────────────────┐
  │  member · meta_data ·            │        │  src/cron/scheduler.ts   │
  │  model_config · notification ·   │        │   appointment-expire     │
  │  order · otp · payment · role ·  │        │   appointment-reminder   │
  │  scan · subscription ·           │        │   membership-expire      │
  │  subscription_plan · treatment · │        │   membership-expiry-remind│
  │  user · webhook · web-order ·    │        │   order-expire           │
  │  web-register                    │        │   user-delete (7-day)    │
  └──────────────────────────────────┘        │   zoho-sync              │
                                              └──────────────────────────┘
```

---

## 4. The subscription and appointment model

```
   Customer ──▶ CustomerSubscription ──▶ SubscriptionPlan
       │              │                      · price / discountedPrice
       │              │                      · maxFamilyMembers
       │              │                      · totalAppointmentsPerCycle
       │              │                      · cycle length
       │              ▼
       └──▶ Member[]  (relationship: self | spouse | child | parent …)
               │        appointmentsLeft   ← the per-member quota
               │
               ▼
          Appointment ──▶ Clinic ──▶ ClinicAvailability
               │            │           ClinicService
               │            └──▶ Commission
               ▼
          Treatment · Scan · Activity     ← the clinical record
```

`ModelConfig` holds the tunable business rules — `defaultAppointmentsLeft`,
`maxTotalFamilyMembers`, `isExtraFamilyMemberEnabled` — as **database rows, not
constants**. Product can change family-size policy without a deploy, and the
prorata calculator explicitly sources its cycle allocation from config,
*"never hardcoded"*.

### Prorata on upgrade

Upgrading from an individual plan to a family plan mid-cycle must credit what the
customer has not used:

```
                       appointmentsLeft
   prorataDeduction = ──────────────────── × currentSubscriptionBaseAmount
                      totalAppointmentsPerCycle

   applied against the new plan's total AFTER GST
   final payable is guaranteed > 0 (business rule)
```

Sourced from the self-member's remaining appointments, the active subscription's
base (or discounted) price, and `modelConfig.defaultAppointmentsLeft`. Written as
a pure, documented function with a typed input interface — the one piece of maths
in the system a customer will personally check.

---

## 5. Payment flow

```
  APP                    API                    RAZORPAY              DB
   │  POST /orders        │                        │                  │
   ├─────────────────────▶│ prorata calc           │                  │
   │                      │ + GST                  │   Order row      │
   │                      ├───────────────────────▶│   status=CREATED│
   │◀──── orderId, key ───┤◀──── razorpay order ───┤                  │
   │                      │                        │                  │
   │  checkout in-app ───────────────────────────▶ │                  │
   │                      │                        │                  │
   │                      │◀── POST /webhooks/     │                  │
   │                      │    razorpay            │                  │
   │                      │  rawBodyMiddleware →   │                  │
   │                      │  signature verified    │                  │
   │                      │  over the RAW body     │                  │
   │                      │                        │                  │
   │                      │ activate subscription ────────────────────▶│
   │                      │ allocate member quotas                    │
   │                      │ invoice PDF (pdfkit + to-words) ──▶ S3     │
   │                      │ notify (FCM + MSG91)                      │
   │                      │ zoho-sync cron ──▶ CRM                    │
   │                      │                        │                  │
   │            ┌─────────┴──────────────────────────────────┐        │
   │            │ order-expire cron: orders never paid are   │        │
   │            │ closed out rather than left CREATED forever│        │
   │            └────────────────────────────────────────────┘        │
```

`GET /config/razorpay-key` exposes only the **public** Razorpay key, so the app
does not ship a build-time constant that goes stale on key rotation.

---

## 6. Appointments — booking to clinical record

```
   book ──▶ availability check (ClinicAvailability + ClinicService)
     │        member has appointmentsLeft > 0?
     │        subscription active?  (returns null, not an error, if inactive)
     ▼
   PENDING ──── appointment-reminder cron ────▶ FCM push + SMS
     │
     ├─ arrives at clinic
     │     verify by PHONE   POST /clinic-app/appointments/verify-phone
     │     verify by QR      POST /clinic-app/appointments/verify-qr
     │            │
     │            ▼
     │     CHECK-IN  POST /clinic-app/appointments/:uuid/check-in
     │            │
     │            ▼
     │     Treatment created / updated by the clinic
     │            │
     │            ▼
     │     Scan uploaded ──▶ ScanKit ──▶ AI analysis
     │            │           (start session → upload angles →
     │            │            complete → per-disease findings,
     │            │            counts and colour coding)
     │            ▼
     │     Activity row — the patient-visible history
     │
     └─ never attended ──▶ appointment-expire cron closes it
```

---

## 7. Two mobile apps, one server: version gating

```
   GET /config/app-version
     → { patient: { android: {latest, minimumSupported},
                    ios:     {latest, minimumSupported} },
         clinic:  { android: {…}, ios: {…} } }

   Every authenticated customer request:
     customerAuth = [ authenticate , captureAppVersion ]
                                      └─ passively records the X-App-Version
                                         header against the customer
```

The capture middleware is **passive**: it never blocks a request, never fails one,
and runs after authentication so a version is always attributable to a real
customer. That gives real adoption data (who is actually on which build) rather
than store-reported download numbers, which is what makes raising
`minimumSupported` a decision instead of a gamble.

---

## 8. Data deletion — a 7-day grace period

```
   DELETE /customer/account
         │
         ▼
   users.delete_request = now()      ← flagged, not deleted
         │
         │   7 days — the user can sign back in and cancel
         ▼
   user-delete cron ──▶ actual cascade deletion
```

Immediate hard deletion is unrecoverable and, for health data, so is an
accidental one. The grace period is the difference between a support ticket and a
permanently lost clinical history.

---

## 9. Performance work — measured, not guessed

```
   performance/
     run-k6.js        orchestrator; one structured CSV report per run
     config/  helpers/  scenarios/  reports/
     tests/   35 k6 test files, one per endpoint

     01 otp_generate      13 create_order        26 verify_appointment_phone
     02 otp_verify        14 list_orders         27 verify_appointment_qr
     03 refresh_token     15 create_member       28 check_in
     04 clinic_login      16 create_appointment  29 create_treatment
     05 customer_profile  17 list_clinics        30 update_treatment
     …                    …                      31-35 activity, clinic
                                                 details, profile, read-all,
                                                 clinic patient
```

`PERF_TEST_MODE` is a first-class environment mode: it isolates test data, and
external integrations (Zoho, SMS) check it so a load test does not send ten
thousand real messages or pollute the CRM.

Fixes that came *out* of the measurements, not before them:

```
  · findAndCountAll split into two manual queries
      — Sequelize's combined count+rows breaks with certain includes and
        column naming; the counts were wrong AND slow
  · subqueries disabled on dashboard pagination
  · composite indexes added where the query plan asked for them:
      appointments (member, date, time) — PARTIAL
      activities (clinic_id, date)
      clinic patients (several)
      clinics (email)
  · clinic patients listing rewritten as raw SQL pagination
  · database connection pooling configured
```

---

## 10. What `anik-appycodes` contributed

**535 commits — the primary author and effective owner of this codebase.** The
next contributor has 71. Practically every subsystem described above is his:
migrations (183 file-touches), routes (162), appointments (125), clinic (112),
seeders (106), config (81), members (79), customers (70), payment (64),
performance tests (61), activity (59), treatment (53), OTP (50), subscriptions
(49), orders (45), model config (42), services (41), auth (40), scans (37).

The summary below is grouped by theme rather than listing 535 commits.

### The schema and the domain

All **75 Sequelize migrations**, from `create-users-table` through the index and
config additions of the most recent releases, plus the seeders. That is the entire
data model: users, customers, members, clinics, availability, services,
subscriptions, plans, customer subscriptions, appointments, appointment types,
payments, treatments, scans, activities, notifications, orders, commissions,
metadata and model config.

### Payments and subscriptions

- Razorpay integration end to end: order creation, webhook signature verification
  over the raw body, subscription activation, quota allocation.
- **`prorata.service.ts`** — the mid-cycle upgrade credit calculation, written as
  a documented pure function with the business rule stated in the file, sourcing
  its cycle allocation from `ModelConfig` rather than a constant.
- `invoice.service.ts` — PDF invoices via pdfkit with `to-words` amount-in-words
  (an Indian invoicing requirement), uploaded to S3.
- `ec8809c feat: add endpoint to retrieve public Razorpay configuration key` —
  so key rotation does not require an app release.
- `df2a2c2` — **order idempotency guards**, preventing duplicate orders from a
  double-tapped checkout button, plus connection pooling.
- `39223b7`, `4db0097`, `6c8c11f` — a genuine debugging arc on Razorpay 401s:
  added startup diagnostics, improved error logging to capture full raw objects
  and serialise non-`Error` types, found the cause, then **removed the diagnostic
  logging again** rather than leaving it in.

### Appointments and the clinic app

The whole appointment lifecycle — booking against availability and quota, phone
and QR verification, check-in, treatment creation and update, expiry and reminder
crons — and the clinic-facing surface: clinic login, refresh, forgot-password with
OTP verification, dashboards, patient lists, recent activity.

`4bbad3b refactor: return null instead of throwing error for inactive
subscriptions in appointment controller` — a small but characteristic call: an
inactive subscription is a *state*, not an exception, and throwing made the client
show an error dialog for a normal condition.

### Family model and configurable business rules

`484dd07` (`isExtraFamilyMemberEnabled`), `a457218` (`maxTotalFamilyMembers`),
`ee5b472` (minimum age validation for customers), member uniqueness constraints.
Moving family-size policy into `ModelConfig` rows is what lets the product change
its own rules without an engineering release.

### Security and account lifecycle

- `f065014 feat: … concurrent-safe progressive password rehashing` — bcrypt cost
  factors raised over time; users are silently rehashed on successful login,
  concurrency-safe so two simultaneous logins cannot corrupt the hash.
- `bf3e5f5 feat: implement 7-day account deletion grace period with automated
  cleanup cron job` — the deletion flow above.
- `f0196a7 fix: disable master OTP in production` — then `542f0d6` correcting the
  intended production behaviour along with the database SSL configuration. Master
  OTP in production is exactly the kind of development convenience that becomes
  an incident.
- `e887e32 fix(email): make MSG91 the only email channel in production` —
  eliminated a second, unmonitored email path.

### Performance — the k6 suite and what it found

`c99a8ef` introduced the k6 load-testing suite and `PERF_TEST_MODE`. Then 35
endpoint tests across several commits, `3daac7a` consolidating reporting into one
structured CSV per run, and `3eb9bb1` improving test reliability and data
isolation.

`94db600` is worth reading for the commit message alone — it adds eight endpoint
tests *and* fixes "metrics honesty and discovery", i.e. the load tests had been
reporting numbers that flattered the system.

The fixes that followed are all measurement-driven: the `findAndCountAll` split
(`7c1864e`), disabled dashboard subqueries plus activity indexes (`fadedc3`),
raw-SQL clinic-patient pagination with the missing indexes (`34d88da`), the
partial composite index on appointments (`be0d793`), the clinics email index
(`f065014`), and pagination added across appointments, customer subscriptions,
doctors and preferred clinics (`97b50a4`) with the API docs updated to match.

### App-version gating

`9a7aff5` (public app-version config endpoint), `07aaecd` (nested under
patient/clinic keys), `c16bd8b` (the passive capture middleware), and the ongoing
release-by-release version bumps — the operational half of shipping two mobile
apps against one server.

### Integrations

`scankit.service.ts` (AI dental scan analysis: session start → per-angle upload →
complete → disease findings with counts and colour coding), `zoho.service.ts`
(token caching with expiry, config validation, `PERF_TEST_MODE` awareness) and
the `zoho-sync` cron, `fcm.service.ts` (push), `msg91.service.ts` (SMS and
production email), `file.service.ts` (S3 presigned uploads).

### Operational hardening

`54db806` (dist fallback for the Sequelize config so migrations run in
production), `5c6104f` (moved Sequelize out of devDependencies — it is needed at
runtime), `a52f7e1` (skip husky install in production), Sentry wiring, the
standardised JSON error envelope, and the Swagger generation scripts
(`swagger:generate`, `swagger:extract-schemas`) that keep `/api-docs` honest.
