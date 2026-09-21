---
title: "Impact Express — Shipping & Payments Server"
slug: "impact-express-server"
summary: "Express API aggregating four courier carriers into one price list, with signed quotes and Opayo 3-D Secure payments."
tags: ["Node.js", "Express", "MySQL", "Opayo", "3-D Secure"]
type: "Backend"
order: 7
featured: false
date: "2026-09-17"
---

# Impact Express — Shipping, Payments & Label Server

**Repo:** `Backend/impactexpress-server` (package `impact-express-node`)
**Type:** Express 4 REST API — multi-carrier rate aggregation, Opayo card payments with 3-D Secure, label generation, admin console API
**Pairs with:** [`frontend/impactapp-frontend.md`](../frontend/impactapp-frontend.md)

---

## 1. The problem

Sit between a customer who wants to send a parcel and four different courier APIs
that each price, book and label parcels differently — while taking the money for
it through a UK payment gateway that mandates Strong Customer Authentication.

The hard parts are not the happy path:

- Four carriers with four request shapes, four failure modes and four latencies,
  all of which must collapse into one comparable price list.
- A payment gateway whose 3-D Secure step hands the customer's browser to their
  bank and back, meaning **the payment flow is a full-page form POST, not an XHR**.
- Prices computed on the client are, by definition, attacker-controlled.
- Everything above must be auditable afterwards, because "the customer says they
  paid" is a support ticket that has to be answerable.

---

## 2. Stack

```
Node.js · Express 4 (CommonJS) · MySQL 2
express-async-errors + express-async-handler   (async throw → error middleware)
jsonwebtoken (admin auth)      yup (validation)
axios (carrier + gateway HTTP) aws-sdk (S3 invoice/label storage)
pdfkit + bwip-js + sharp       (labels: PDF, barcodes, image ops)
nodemailer + ejs               (transactional email templates)
winston + winston-daily-rotate-file   moment / moment-timezone
swagger-ui-express + yaml      (/api-docs)
```

---

## 3. Architecture

```
  CUSTOMER BROWSER                                    ADMIN CONSOLE
        │                                                   │
        │  JSON + form POST                                 │  JWT
        ▼                                                   ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                            server.js                                  │
  │  requestId ▸ cors ▸ trust proxy ▸ json ▸ cookieParser ▸ urlencoded   │
  │  loggingMiddleware ▸ apiLogger                                        │
  │                                                                       │
  │   /            general.route      health, postcode validation         │
  │   /api/v2      v2/label.route     label generation v2                 │
  │   /api         routes.js ───┬── /validate   postcode (Loqate)         │
  │                             ├── /shipping   providers, label/generate │
  │                             ├── /payment    MSK, transaction, 3DS cb  │
  │                             ├── /booking    details, attempt, price   │
  │                             ├── /query      enquiries                 │
  │                             ├── /auth       admin login               │
  │                             └── /admin      (verifyToken on ALL)      │
  │                                                                       │
  │   /api-docs    swagger-ui                                             │
  │   *            404 JSON                                               │
  │                                                                       │
  │   GLOBAL ERROR HANDLER (4-arity — Express detects error mw by arity)  │
  │     · payment endpoints are full-page POSTs → REDIRECT to the failure │
  │       page, never JSON (the customer's browser is sitting on this)    │
  │     · everything else → JSON                                          │
  └───────┬──────────────────┬──────────────────┬────────────────┬────────┘
          │                  │                  │                │
   ┌──────▼──────┐   ┌───────▼────────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │  services/  │   │   services/    │  │  services/  │  │   MySQL     │
   │  courier/   │   │  dispatchCloud/│  │  v2/        │  │  bookings   │
   │   dhl       │   │  fulfilment    │  │  label.svc  │  │  attempts   │
   │   ups       │   └────────────────┘  │  pdf.svc    │  │  admin_logs │
   │   evri      │                       └─────────────┘  │  payment_   │
   │   dhl_evri_ │   ┌────────────────┐                   │   logs      │
   │   warehouse │   │ invoice.service│──▶ S3 bucket      │  api_request│
   └──────┬──────┘   └────────────────┘                   │   _logs     │
          │                                               └─────────────┘
   ┌──────▼──────────────────────────┐    ┌──────────────────────────┐
   │  DHL · UPS · Evri APIs          │    │  Opayo (Elavon) gateway  │
   └─────────────────────────────────┘    └──────────────────────────┘
```

### `express-async-errors`

Already a declared dependency, it was simply never required. Without it, a throw
inside an `async` route handler becomes an unhandled rejection that **kills the
process**. Requiring it before any routes are built routes those throws to the
global error handler instead. One line; the difference between a 500 and an
outage.

---

## 4. Multi-carrier rate aggregation

```
  POST /api/shipping/providers
        │  { dimensions, weight, from, to, value, … }
        ▼
  shippingService
        ├──────────────▶ dhl.courier.js                ─┐
        ├──────────────▶ ups.courier.js                 │  each adapter:
        ├──────────────▶ evri.courier.js                ├─ own auth
        └──────────────▶ dhl_evri_warehouse.courier.js ─┘  own request shape
                                                           own error mapping
                              │
                              ▼
              normalise to ONE quote shape:
              { quoteId, price, providerCompany, providerType,
                deliveryType, deliveryWithin, … }
                              │
                              ▼
              SIGN each quote  (utils/quoteSignature.js)
                priceSig   = HMAC-SHA256(canonical fields, secret)
                priceSigAt = issue timestamp
                              │
                              ▼
              return quotes[]  ──▶ frontend stores the object VERBATIM
```

`dhl_evri_warehouse.courier.js` is the composite product — "IE International" —
priced from a **live DHL 189 rate plus an Evri warehouse charge**, so a blended
service is quoted from real component prices rather than a maintained table that
goes stale.

---

## 5. Payment and 3-D Secure

```
 BROWSER                    SERVER                     OPAYO                 BANK
    │                          │                          │                   │
    │ POST /payment/           │                          │                   │
    │      merchant-session-key│                          │                   │
    ├─────────────────────────▶│ Basic auth (integration  │                   │
    │                          │ key:password, base64)    │                   │
    │                          ├─────────────────────────▶│                   │
    │◀──── merchantSessionKey ─┤◀─────────────────────────┤                   │
    │                          │                          │                   │
    │ tokenise card IN BROWSER (PAN never touches this server)                │
    ├──────────────────────────────────────────────────────▶                  │
    │◀──────────────── cardIdentifier ─────────────────────┤                  │
    │                          │                          │                   │
    │ full-page form POST      │                          │                   │
    │ /payment/transaction     │                          │                   │
    │  + selectedShipping      │                          │                   │
    │    ProviderObject        │                          │                   │
    │    (carries priceSig)    │                          │                   │
    │  + SCA browser data      │                          │                   │
    │  + paymentTestToken?     │                          │                   │
    ├─────────────────────────▶│                          │                   │
    │                          │ ① verifyQuoteAmount()    │                   │
    │                          │   HMAC re-computed;      │                   │
    │                          │   mismatch → reject      │                   │
    │                          │ ② resolvePaymentTestMode │                   │
    │                          │   (both gates or normal) │                   │
    │                          │ ③ logPaymentEvent()      │                   │
    │                          ├─────────────────────────▶│                   │
    │                          │◀─── 3DS required ────────┤                   │
    │◀──── 3DS challenge ──────┤                          │                   │
    ├───────────────────────────────────────────────────────────────────────▶ │
    │◀────────────────── customer authenticates ──────────────────────────────┤
    │ POST /payment/notification (3DS callback)           │                   │
    ├─────────────────────────▶│ handle3DSCallback        │                   │
    │                          ├─────────────────────────▶│  complete         │
    │                          │◀──── authorised ─────────┤                   │
    │                          │                          │                   │
    │                          │ ④ persist booking        │                   │
    │                          │ ⑤ generate invoice PDF ──▶ S3                │
    │                          │ ⑥ customer email  +      │                   │
    │                          │   internal notification  │                   │
    │                          │   (separate templates)   │                   │
    │◀──── 302 /thank-you/:id ─┤                          │                   │
```

### Quote signing — server-side price validation with zero client involvement

The frontend computes the charged amount from the delivery option it holds in
Redux and submits it as a hidden field. On its own, **that amount is
attacker-controlled**.

Two options: re-quote at payment time, or sign the quote when it is issued. The
first was rejected — live courier prices fluctuate, and it would put the DHL/UPS
APIs in the critical path of every payment. So:

```js
canonicalise(quote, signedAt) =
  [ quoteId, Number(price).toFixed(2), providerCompany,
    providerType, deliveryType, signedAt ].join("|")

priceSig = HMAC-SHA256(canonical, QUOTE_SIGNING_SECRET)
```

- `price` is normalised to 2dp so float formatting can never change the digest.
- The signature travels **inside the quote object**, which the frontend stores
  and posts back verbatim — no frontend change was needed to deploy this.
- Max age defaults to 24 hours, deliberately generous: a customer may leave the
  checkout open for a long time, and rejecting them is worse than honouring a
  slightly stale price.
- **Safety valve:** if `QUOTE_SIGNING_SECRET` is unset, signing and verification
  both degrade to a no-op that *allows* the payment, logged loudly. A missing
  env var must never stop a real customer from paying.

### Payment test mode — not a bypass

```
  ACTIVATES only if BOTH hold:
    ① PAYMENT_TEST_MODE_ENABLED === "true"
    ② request carries paymentTestToken matching PAYMENT_TEST_MODE_TOKEN
       compared with crypto.timingSafeEqual (length-checked first)

  EFFECT: amount → PAYMENT_TEST_MODE_AMOUNT (default 1 penny).
          Everything else is the normal production path:
          live Opayo credentials, real tokenisation, real acquirer, real capture.
```

Money genuinely moves, so **there is no "book without paying" code path** — the
worst case if the token leaked is a booking bought for a penny, not a free
booking. The token field is added to the redaction list in `services/logService.js`
so it never lands in `api_request_logs` in plaintext. A boot-time warning fires if
the flag is left on in production.

---

## 6. Observability

Four log streams, each with a different question it answers:

```
  requestId middleware ──▶ every log line for one request is joinable

  api_request_logs   apiLogger.middleware   every inbound call, redacted
  payment_logs       logPaymentEvent()      MSK created, transaction, 3DS,
                                            authorised, failed — with the
                                            gateway's own response payload
  admin_logs         logService             who changed what in the console
  booking_attempts   bookingAttemptService  the abandoned-checkout funnel

  winston-daily-rotate-file ──▶ rotated files on disk
  /api/admin/{payment-logs, api-logs, booking-attempts, abandoned-bookings}
```

`payment_logs` capturing the gateway's raw response is what makes a disputed
transaction answerable months later.

---

## 7. Labels and fulfilment

```
  POST /api/shipping/label/generate      (v1)
  POST /api/v2/label/…                   (v2 — services/v2/label.service.js)
         │
         ├─ carrier label via the courier adapter, OR
         ├─ generic label rendered locally:
         │     pdfkit  (page + layout)
         │     bwip-js (barcode)
         │     sharp   (image compositing)
         │
         └─ non-production runs get a SAMPLE WATERMARK burned in
              — a test label that looks identical to a real one is
                a parcel that gets handed to a driver

  services/dispatchCloud/  ── fulfilment-house integration
  migrations/ 001 admin_logs_and_attempts · 002 booking_reference
              003 booking_invoice_url     · 004 booking_is_test
```

---

## 8. What `anik-appycodes` contributed

**26 commits.** The theme is unambiguous: this is the person who hardened the
payment path. Almost every commit is either a crash that took the server down, a
failure the customer could not see, or a way the price could be tampered with.

### Server-side price validation — `1d3de61`

Authored `utils/quoteSignature.js` in full: the HMAC scheme, the canonical field
list, the 2dp normalisation, the 24-hour max age, and the deliberate
allow-on-missing-secret safety valve. Closed the "customer edits the price in the
form POST" hole **without requiring a single frontend change**, because the
signature was designed to ride inside the object the client already stores.

### Payment test mode — `1d3de61`, `501106d`

Authored `utils/paymentTestMode.js`: the two independent gates, the
`timingSafeEqual` comparison, the redaction entry in `logService.js`, migration
`004_booking_is_test.sql`, and the boot-time warning when the flag is on in
production. Designed so it can never become a free-booking exploit.

### Crashes that took the process down

- `b87c85e fix: stop server crash on malformed payment payload` — an unvalidated
  payment POST could crash the server. On a payment endpoint, a crash is also
  every *other* in-flight customer's payment lost.
- `1e7ddda fix: stop backend crash on missing/invalid admin auth header` —
  `middlewares/authMiddleware.js`; a malformed `Authorization` header threw
  instead of returning 401.
- Required `express-async-errors` in `server.js` and wrote the 4-arity global
  error handler, including the rule that **payment endpoints redirect to the
  failure page rather than returning JSON** — because those are full-page form
  POSTs and the customer's browser is sitting on the response. Returning JSON
  there shows a customer raw error text.

### Payment edge cases — `efbca21`

Two specific, expensive failure modes: an **Opayo timeout** (gateway slow, request
abandoned, customer state unknown) and **transaction loss on database failure**
(payment authorised at the gateway but the booking write failed — money taken, no
booking). Both handled explicitly rather than left to the generic error path.

### Email and invoice persistence — `7fa9058`, `d7c1a39`, `d08a83c`

Separated the internal booking notification from the customer email (two
templates: `templates/email/index.ejs` and `internal-booking.ejs`) — they had been
one message serving two audiences badly. Ensured the invoice PDF is generated,
uploaded to S3 securely and **persisted before** the email that references it,
rather than after. Added migration `003_booking_invoice_url.sql`.

Includes a revert-and-redo cycle (`8b275b7` → `29685f8`): shipped, found wrong,
reverted rather than patched over, landed correctly.

### IE International — the composite carrier product — `782f1f6`, `6fd59fa`

Built `services/courier/dhl_evri_warehouse.courier.js`: priced the blended service
from a **live DHL 189 rate plus the Evri warehouse charge**, surfaced it in the
dev/test provider list, and fixed the updated-price call that had not accounted
for it.

### Label correctness — `20c0b31`, `a239f75`

`20c0b31` — the generic Evri label was silently dropping the street address line
because of a field-name mismatch between the booking record and the label
renderer. A label missing line 1 of the address is a lost parcel.
`a239f75` — added a non-production **sample watermark** to the generic label, so a
test label can never be mistaken for a real one at the point of handover.

### Postcode validation and a leaked key — `b1a78bd`

Replaced generic postcode errors with specific ones (the backend half of the
frontend change), **and stopped the server leaking the Loqate API key** in its
error responses — a validation error was echoing enough of the upstream request
to expose the credential.

### Payment logging

`services/logService.js` — the `payment_logs` stream capturing event type, status,
the gateway's raw response payload, HTTP status, `requestId` and IP for every
stage of the payment. This is the audit trail that makes a disputed transaction
answerable.
