# Reasoning

## Understanding the brief

The storyline has one core twist: **customers shouldn't be charged for days
they didn't get a tiffin.** Everything else (subscribe, look up by phone,
active/paused list) is scaffolding around that one billing rule, so I
started by nailing down the rule itself before touching UI:

- Tiffin is delivered on **weekdays only** (a home tiffin service doesn't
  usually deliver on weekends) — so "days actually delivered" = weekdays in
  the month, minus any weekday inside a pause range, minus any day outside
  the subscription's active window (e.g. if they started mid-month).
- `bill = (plan price / total weekdays in month) × delivered weekdays`.
  This keeps the math simple and defensible: a customer who wasn't paused at
  all pays exactly the full plan price (because delivered days = total
  weekdays), and a customer paused the whole month pays ₹0.

## Data model decisions

- **`pauses` as a separate table from `subscriptions.status`** rather than
  just a status flag, because pauses have a *date range* (an owner needs to
  log "paused Sept 10–12 for travel", not just "paused right now"). The
  `status` column on `subscriptions` is a fast-path cache for list views;
  the pauses table is the source of truth for billing.
- **Open-ended pauses** (`end_date IS NULL`) are supported because in real
  life an owner often doesn't know the return date when a customer leaves —
  "resume" later closes the pause by setting `end_date` to the day before
  resumption.
- Customers are unique by **phone number**, matching how the brief frames
  lookup ("customers are looked up by phone").
- Kept **one active/paused subscription per customer** at a time (enforced
  on the subscribe endpoint) — a tiffin customer realistically has one plan
  running, and this avoids ambiguous billing across overlapping subscriptions.

## Why SQLite over MySQL/Postgres

I normally reach for MySQL/Postgres, but for a timed build with everything
running inside a fresh Codespace, `better-sqlite3` gives a real relational
schema (foreign keys, proper types) with **zero setup** — no service to
start, no connection string to debug. That let the 2.5-hour budget go
toward the billing logic and UI instead of environment plumbing.

## Why a plain HTML/JS frontend instead of React

Same reasoning: no build step, no bundler config to fight if something goes
wrong mid-round. `fetch` + small vanilla-JS files were enough for the
required screens (customer list, subscribe/pause/resume, billing report),
and it kept the whole stack to one `npm install`.

## Testing & fixing issues

Tested primarily by hitting the API directly with `curl` before wiring up
the UI, so bugs were caught at the source of truth (the billing math) rather
than being masked by the frontend:

- Verified `weekdaysInMonth` against a real calendar for September 2026 (22
  weekdays) and cross-checked by hand.
- Seeded one customer with a **closed pause** (Sept 10–12) and one with an
  **open-ended pause** (from Sept 15, no end date) to make sure both cases
  reduce delivered-day count correctly — confirmed via `GET /api/billing`
  that the open-ended customer's delivered days stopped increasing after
  the pause start date.
- Found and fixed an early bug where a pause starting *after* today was
  still flipping `subscriptions.status` to `paused` immediately — fixed by
  only updating the status column when the pause's `start_date` is today or
  earlier, so future-dated pauses don't misrepresent "who's active today."
- Checked the boundary where a subscription starts mid-month (should only
  bill from the start date, not the whole month) by seeding a subscription
  starting Sept 5 and confirming weekdays before Sept 5 aren't counted.
- Manually walked through the dashboard: add customer → subscribe → pause →
  confirm it shows "Paused" and drops out of delivered-day count → resume →
  confirm it's billed again from the resume date onward.

## What I'd add next

Covered on the landing page's "what we'd build next" section: WhatsApp bill
delivery, a daily delivery log for short-notice misses (distinct from a
planned customer pause), and multi-kitchen support.
