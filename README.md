
# DabbaLedger — Tiffin Subscription & Pro-Rated Billing

A small full-stack app for a home-style tiffin owner: manage customers by phone
number, subscribe them to a plan, pause/resume delivery around travel or
festivals, and generate a correct pro-rated bill at month-end.

## Tech stack

- **Backend:** Node.js, Express
- **Database:** SQLite (via `better-sqlite3`) — real relational schema, zero external setup
- **Auth:** JWT (`jsonwebtoken`) + bcrypt password hashing
- **Frontend:** plain HTML/CSS/JS (no build step, served as static files by Express)

## Setup & run

```bash
# 1. Install dependencies
npm install

# 2. Copy the env file and (optionally) change the JWT secret
cp .env.example .env

# 3. Start the app
npm start
```

The app runs at **http://localhost:3000**.

On first run, `db.js` creates `tiffin.sqlite` and seeds it with:
- a demo owner login: **owner@tiffin.com / owner123**
- 3 sample plans, 3 sample customers, and a couple of pauses (so billing has something to show immediately)

Open `http://localhost:3000` for the landing page, or go straight to
`http://localhost:3000/login.html` to sign in and reach the dashboard.

## How to debug / reset

- Server logs print to the terminal running `npm start`.
- To wipe all data and reseed: stop the server, delete `tiffin.sqlite`,
  `tiffin.sqlite-shm` and `tiffin.sqlite-wal`, then `npm start` again.
- `GET /health` returns `{ ok: true }` if the server is up.
- If port 3000 is already taken, set `PORT=xxxx` in `.env`.

## API endpoints

All routes except `/api/auth/*` require an `Authorization: Bearer <token>` header
(token returned by login/register).

### Auth
| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | Creates an owner account, returns a JWT |
| POST | `/api/auth/login` | `{ email, password }` | Returns a JWT |

### Customers
| Method | Endpoint | Query / Body | Notes |
|---|---|---|---|
| GET | `/api/customers` | `?search=&status=&page=&limit=&sort=name\|phone\|created_at&order=asc\|desc` | Search by name/phone, filter by status, paginated + sorted |
| GET | `/api/customers/:id` | — | Full detail incl. subscriptions & pause history |
| GET | `/api/customers/lookup/:phone` | — | Look up one customer by exact phone number |
| POST | `/api/customers` | `{ name, phone, address }` | Create a customer (phone must be unique) |

### Plans
| Method | Endpoint | Body |
|---|---|---|
| GET | `/api/plans` | — |
| POST | `/api/plans` | `{ name, price_per_month, description }` |

### Subscriptions
| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/api/subscriptions` | `{ customer_id, plan_id, start_date }` | Subscribe a customer to a plan |
| POST | `/api/subscriptions/:id/pause` | `{ start_date, end_date?, reason? }` | `end_date` omitted = paused indefinitely until resumed |
| POST | `/api/subscriptions/:id/resume` | — | Closes any open pause and reactivates |
| POST | `/api/subscriptions/:id/cancel` | — | Ends the subscription |
| GET | `/api/subscriptions` | `?status=&page=&limit=&sort=start_date\|status&order=` | Paginated, sorted, filterable list |

### Billing
| Method | Endpoint | Query | Notes |
|---|---|---|---|
| GET | `/api/billing/subscription/:id` | `?month=YYYY-MM` | Pro-rated bill for one subscription |
| GET | `/api/billing` | `?month=YYYY-MM&page=&limit=&sort=customer_name\|amount\|deliveredDays&order=` | Month-end bill for every customer, paginated + sorted, with total revenue |

## Billing rule (how the pro-ration works)

Tiffin is delivered on weekdays (Mon–Fri) only.

```
per-day rate   = plan price / number of weekdays in the month
delivered days = weekdays in the month that fall within the subscription's
                  active window AND are NOT inside any pause range
bill amount    = per-day rate × delivered days
```

A pause with no `end_date` is treated as still in effect (open-ended) until a
`resume` call closes it. This is implemented in `utils/billing.js`.

## Pages

- `/` — landing page
- `/login.html` — owner login / registration
- `/dashboard.html` — customer list (search, sort, paginate), add customer,
  subscribe / pause / resume, pause history
- `/billing.html` — month-end billing report (search by month, sort, paginate, total revenue)
