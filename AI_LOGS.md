 # AI Implementation Log

 ## Purpose

 This file records the AI-assisted implementation work completed for the
 DabbaLedger tiffin subscription and billing application. It is a concise
 engineering log, not a verbatim chat export. The authoritative implementation
 is the code in this repository.

 ## Original Requirement

 Build a home-style tiffin service where:

 - Customers subscribe to a monthly weekday lunch plan.
 - Owners can pause and resume delivery for travel, festivals, or other breaks.
 - Customers are billed only for weekdays on which delivery was due.
 - Customers can be found by phone number.
 - Owners can see active and paused customers.

 Additional graded twists:

 1. **T1, integrate:** `POST /clock` creates delivery notifications for today's
    eligible customers; notifications are available through `/outbox`.
 2. **T6, lifecycle:** Transfer a subscription to a new customer mid-cycle;
    preserve the plan and split billing by the served date boundary.
 3. **T4, messy data:** Import customer rows with duplicate phones, mixed date
    formats, and invalid values; return an `{ imported, deduped, rejected }`
    report.

 ## Implementation Summary

 ### Core billing

 Billing is implemented in `utils/billing.js`:

 ```text
 per-day rate = monthly plan price / weekdays in the month
 delivered days = weekdays inside the subscription window and outside pauses
 bill amount = per-day rate * delivered days
 ```

 Weekends are never delivery days. Pause ranges are inclusive. An open-ended
 pause (`end_date = NULL`) remains active until a resume operation closes it.
 Subscription start and end dates are also included in the delivered-day
 calculation, so mid-month subscriptions and cancellations are prorated.

 ### T1: delivery notification outbox

 Implemented in `routes/clock.js` and wired in `server.js`:

 - `POST /clock` accepts `{ "date": "YYYY-MM-DD" }`.
 - `GET /outbox` returns queued notification events.
 - Authenticated aliases are also available at `POST /api/clock` and
   `GET /api/outbox`.
 - Weekend dates return no notifications.
 - A notification is queued only when the subscription covers the date, is not
   cancelled, and the date is not inside a pause.
 - Events are persisted in the SQLite `outbox` table as `delivery_due` records.

 Each event includes the delivery date, customer, phone, address, subscription,
 plan, and a notification message for the downstream Notification Service.

 ### T6: mid-cycle transfer

 Implemented as:

 ```text
 POST /api/subscriptions/:id/transfer
 {
   "new_customer_id": 12,
   "transfer_date": "2026-09-17"
 }
 ```

 The original subscription ends on the day before the transfer and the new
 subscription starts on the transfer date with the same plan and remaining end
 date. Applicable pause coverage is copied to the successor subscription. The
 existing billing algorithm then naturally produces one bill for the original
 customer before the handoff and one bill for the new customer after it.

 The operation validates that the source is not cancelled, the transfer date is
 inside the cycle, the new customer exists, and the new customer has no other
 active or paused subscription.

 ### T4: messy customer import

 Implemented at:

 ```text
 POST /api/import/customers
 {
   "customers": [
     {
       "name": "Asha",
       "phone": "98765 43210",
       "address": "Example Street",
       "plan_id": 1,
       "start_date": "17/09/2026"
     }
   ]
 }
 ```

 The importer:

 - Strips non-digit characters from phone numbers and requires ten digits.
 - Accepts `YYYY-MM-DD`, `DD/MM/YYYY`, and `DD-MM-YYYY` dates.
 - Treats duplicate phones within the file or already in the database as
   `deduped`.
 - Rejects missing names, invalid phones, invalid dates, and unknown plans.
 - Creates a customer and subscription for each accepted row.
 - Returns row numbers and reasons in `imported`, `deduped`, and `rejected`.
 - Uses an SQLite transaction so a database failure rolls back the import.

 ## Frontend and Runtime Fixes

 The frontend is served from `public/` with plain HTML and JavaScript.

 During validation, pages were also opened directly from the file system. The
 following browser compatibility fixes were made:

 - Stylesheet links use `css/style.css` instead of `/css/style.css`.
 - Script links use `js/...` instead of `/js/...`.
 - Internal page navigation uses relative paths such as `login.html` and
   `dashboard.html`.
 - The dashboard exposes controls for daily clock notifications and customer
   imports.

 For login, dashboard data, billing, and all API-backed operations, the app
 must be opened through Express, for example:

 ```powershell
 $env:PORT=3001
 npm start
 ```

 Then visit `http://localhost:3001`. Opening a page with `file://` can display
 the static markup, but browser security prevents it from reliably reaching the
 Express `/api` endpoints.

 ## Validation Record

 The following checks were run during implementation:

 | Check | Result |
 |---|---|
 | `node --check server.js` | Passed |
 | `node --check routes/clock.js` | Passed |
 | `node --check routes/imports.js` | Passed |
 | `node --check routes/subscriptions.js` | Passed |
 | `node --check public/js/dashboard.js` | Passed |
 | `GET /health` | Returned `{ "ok": true }` |
 | `POST /clock` on Thursday `2026-09-17` | Queued active, unpaused customers |
 | `POST /clock` on Saturday `2026-09-19` | Returned zero notifications |
 | Import with normalized, duplicate, and invalid rows | Returned all three report categories |
 | Mid-cycle transfer on `2026-09-17` | Produced separate pre-transfer and post-transfer bills |
 | HTML stylesheet/script path scan | All pages use relative asset paths |
 | `git diff --check` | Passed |

 One local development run found port 3000 already occupied. The application
 supports the documented `PORT` override, and validation was completed on port
 3001 without changing the default configuration.

 ## Important Debugging Fixes

 1. The project uses Node's built-in `node:sqlite`, not `better-sqlite3`.
    Node's database object does not provide a `db.transaction()` helper, so the
    import and transfer flows use explicit `BEGIN`, `COMMIT`, and `ROLLBACK`
    statements.
 2. Directly opened HTML pages could not resolve root-relative CSS, JavaScript,
    or navigation paths. All frontend-local assets and page links now use
    relative paths.
 3. A future-dated pause must not immediately mark a subscription as paused in
    the current customer list. The existing pause route updates the cached
    status only when the pause has begun; billing still uses the date range as
    its source of truth.

 ## Delivery History

 Relevant commits on `main`:

 - `a64aaac` — Switch from `better-sqlite3` to built-in `node:sqlite`.
 - `f00f028` — Add delivery notifications, transfer, and import twists.
 - `eeb2979` — Fix stylesheet links for direct page loading.
 - `73a8ac5` — Fix dashboard navigation links.
 - `07152ce` — Fix relative JavaScript links.

 The completed changes were pushed to the configured `origin/main` branch.
