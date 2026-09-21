---
title: "Impact Express — Checkout & Admin Console"
slug: "impact-express-frontend"
summary: "Multi-carrier parcel checkout with 3-D Secure payments, plus an internal admin console for bookings, logs and price overrides."
tags: ["React", "Redux Toolkit", "MUI", "3-D Secure"]
type: "Frontend"
order: 6
featured: false
date: "2026-09-17"
---

# Impact Express — Customer Checkout & Admin Console (Frontend)

**Repo:** `Frontend/impactapp-frontend` (package `impact-express`)
**Type:** React SPA — a multi-step parcel-shipping checkout plus an internal admin console
**Pairs with:** [`backend/impactexpress-server.md`](../backend/impactexpress-server.md)

---

## 1. The problem

Impact Express is a UK parcel courier. A customer needs to: describe a parcel,
get live prices from several carriers, pick one, enter collection and delivery
addresses, and pay by card — with 3-D Secure, because it is UK card-present-absent
e-commerce and SCA is not optional.

Every one of those steps is a place to lose the customer. The frontend's job is
to make a multi-carrier, multi-step, 3DS-interrupted flow feel like one continuous
transaction, and to never leave a customer staring at a screen that has silently
failed.

A second audience shares the codebase: **agency staff**, who need to see bookings,
chase abandoned ones, inspect payment and API logs, and adjust a quoted price.

---

## 2. Stack

```
React 18 (Create React App) · React Router 6
Redux Toolkit + react-redux         (checkout state, persisted)
MUI 5 + @mui/lab + x-date-pickers   (admin console, date pickers)
React-Bootstrap + Bootstrap 5 + Sass (customer-facing checkout)
Formik + Yup                        (every form)
axios                               (API, single configured instance)
postcode-validator, country-state-city  (UK/international address validation)
react-toastify, react-cookie, uuid, file-saver
```

Two UI systems co-exist on purpose: Bootstrap/Sass for the customer checkout
(matches the marketing site), MUI for the admin console (dense data tables and
dialogs are what MUI is good at).

---

## 3. Structure

```
src/
  App.js                          Route table
  app/store.js                    Redux store
    PersonalPackageSlice.js       parcel dimensions, addresses, chosen quote
    PaymentSlice.js               payment-stage state
  context/AuthContext.js
  provider/AuthProvider.js        admin JWT session
  configs/axios.js                base URL, interceptors
  components/
    ProgressStep/                 the 4-step checkout rail
    PackageDetailsPersonal/       step 1 — parcel + validation schemas
    DeliveryOptionsPersonal/      step 2 — live carrier quotes
    AddressDetailsPersonal/       step 3 — billing + shipping forms, 3 Yup schemas
    DeliverySummary/              step 4 — review + pay
    Modal/PaymentModal.jsx        3DS challenge host + failure surfacing
    Modal/UpdateConformationModal.jsx
    OrderInfo/                    booking view (customer + admin variants)
      ProviderDetails/            carrier, delivery type, delivery window
      AdminPackageDetails/        admin-only price override
    Admin/AdminLayout · AdminDataView · DetailDialog
    ProtectedRoutes/AdminLoggedRoutes · AdminNonLoggedRoutes
  pages/
    HomePage/    QueryPage/    ThankYouPage/
    Admin/  AdminLoginPage · BookingHistoryPage · AbandonedBookingsPage · LogsPage
  utils/
    generateSCA.js        3-D Secure browser fingerprint payload
    generateSKU.js        parcel SKU
    checkOverDimension.js oversize detection
    bookingTracker.js     abandoned-booking telemetry
    noPostalCodes.js      non-serviceable postcode list
    persistState.js       Redux → storage (survives the 3DS redirect)
    analytics.js  getIPAddress.js  getPlaces.js  globalToast.js
```

---

## 4. The checkout flow

```
  ┌──────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌─────────┐
  │ 1 Parcel │──▶│ 2 Delivery   │──▶│ 3 Addresses   │──▶│ 4 Summary    │──▶│ Payment │
  │  details │   │   options    │   │   bill + ship │   │   + confirm  │   │  + 3DS  │
  └────┬─────┘   └──────┬───────┘   └──────┬────────┘   └──────┬───────┘   └────┬────┘
       │                │                  │                    │                │
  dimensions,      POST /shipping/     postcode lookup      review the      Opayo MSK,
  weight, value    providers           (Loqate) +           signed quote    tokenise card,
  oversize check   → DHL, UPS, Evri,   Yup schemas per      object          3DS challenge
       │           IE International    form                      │                │
       ▼                │                  │                    │                ▼
  ┌────────────────────────────────────────────────────────────────────┐   ThankYouPage
  │  Redux (PersonalPackageSlice)  ── persistState ──▶ browser storage │   /booking/:id
  │  the quote object is stored VERBATIM, signature and all            │
  └────────────────────────────────────────────────────────────────────┘
```

### Why the quote object is stored verbatim

The backend signs each quote it issues (HMAC over price + carrier + delivery
type + timestamp) and embeds the signature *inside the quote object*. The
frontend's job is simply to hold that object unchanged and post it back at
payment time as `selectedShippingProviderObject`. That design means server-side
price validation needs **zero frontend involvement** — the client cannot tamper
with the amount, and the client also does not have to know it is being checked.

### Why state must survive a redirect

3-D Secure hands the browser to the issuing bank and brings it back. Anything
held only in React memory is gone. `utils/persistState.js` mirrors the Redux
checkout slice into browser storage so the customer returns to a complete
booking rather than an empty form — the single highest-value resilience feature
in the flow.

### 3-D Secure payload

`utils/generateSCA.js` builds the browser-fingerprint block the acquirer requires
(screen size, colour depth, timezone, language, java/JS enabled) and derives
`challengeWindowSize` from the actual viewport — `Small` / `Medium` / `Large` /
`ExtraLarge` / `FullScreen`. Getting that wrong renders the bank's challenge
iframe clipped on mobile, which reads to the customer as a broken payment.
`baseURL` is taken from `window.location.origin` so the 3DS return URL is correct
across local, staging and production without a build-time constant.

---

## 5. Abandoned-booking capture

```
   customer starts checkout
            │
      bookingTracker.js  ──▶  POST /booking/attempt   (fire-and-forget)
            │                       │
      progresses / drops out        ▼
            │                 booking_attempts table
            ▼                       │
      completes ──▶ POST /booking/details      admin /admin/abandoned
                    (a real booking)           ◀── everyone who did not finish
```

A funnel that ends at "customer left" is a funnel nobody can improve. Recording
the attempt separately from the booking is what makes the drop-off visible and
recoverable by a human.

---

## 6. The admin console

```
  /admin/login ──▶ AdminNonLoggedRoutes (redirects away if already signed in)
        │
        │  JWT → AuthContext / AuthProvider → axios Authorization header
        ▼
  AdminLoggedRoutes ──▶ AdminLayout
        ├── /admin              OrderInfo(isAdminPage) — one booking, editable
        ├── /admin/bookings     BookingHistoryPage    — searchable history
        ├── /admin/abandoned    AbandonedBookingsPage — recovery list
        └── /admin/logs         LogsPage              — payment + API logs
```

`OrderInfo` is a single component rendered in two modes (`isAdminPage`), so the
customer and staff views of a booking cannot drift apart. Admin-only affordances
— price override (`AdminPackageDetails/UpdatedPrice.jsx`), the confirmation modal
— hang off that flag rather than living in a forked component.

`useAdminResource.js` is a small hook that standardises the fetch/paginate/filter
pattern shared by all four admin tables.

---

## 7. What `anik-appycodes` contributed

**17 commits**, concentrated almost entirely on **payment reliability, failure
visibility, and admin tooling** — the parts of a checkout where a silent bug
costs real money.

### Made payment failures visible instead of silent

Three related commits fix the worst class of bug this app can have — a customer
who has paid nothing, believes they have, and sees no error:

- `743c221 fix: surface payment failures to the customer` — payment failures
  reaching the UI instead of dead-ending.
- `728a826 fix: show error popup when card tokenisation fails` — tokenisation
  is the step *before* the charge; failing it previously produced a form that
  simply did nothing when submitted. Now it says why.
  (`components/Modal/PaymentModal.jsx`)

### Postcode validation that tells the customer what is wrong

`374e45e` / `e653eee` — replaced a single generic "Postal code error" with
**specific, short messages** per failure mode (wrong format, not serviceable,
lookup unavailable). Deliberately shortened in the follow-up commit: an error
message that overflows its field on mobile is an error message nobody reads.
(`components/PackageDetailsPersonal/formHelper.js`)

### Payment test mode — end to end with the backend

`4116cc4 feat: forward payment test-mode token, flag test bookings in admin` —
the frontend half of the live-payment smoke test. The client forwards a
`paymentTestToken` so a **real card, real Opayo credentials, real 3DS and real
capture** can be exercised for a token amount, and the resulting booking is
visibly flagged as a test in the admin console so it never gets confused with
revenue. Touched `app/PersonalPackageSlice.js`, `pages/HomePage/HomePage.jsx`,
`pages/Admin/BookingHistoryPage.jsx`.

The important property: it is **not a payment bypass**. Money genuinely moves,
so there is no "book without paying" code path that could be discovered and
abused — the amount is the only thing that changes.

### Invoice access for staff

`59a730c` — added the invoice-view button to the admin Booking Details dialog
(`components/Admin/DetailDialog.jsx`), so support can pull a customer's invoice
during a call. Notable for the intermediate revert (`f70bfa8`) — it was shipped,
found wrong, reverted rather than patched over, then landed correctly.

### Checkout summary

Work on `components/DeliverySummary/DeliverySummary.jsx`, the final review step
where the signed quote, addresses and total are confirmed before the card is
touched.
