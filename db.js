const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'tiffin.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---------- SCHEMA ----------
db.exec(`
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_per_month REAL NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  start_date TEXT NOT NULL,          -- YYYY-MM-DD
  end_date TEXT,                     -- NULL = still ongoing
  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | cancelled
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,          -- YYYY-MM-DD (inclusive)
  end_date TEXT,                     -- YYYY-MM-DD (inclusive), NULL = open pause (still paused)
  reason TEXT
);
`);

// ---------- SEED (only if empty) ----------
const ownerCount = db.prepare('SELECT COUNT(*) AS c FROM owners').get().c;
if (ownerCount === 0) {
  const hash = bcrypt.hashSync('owner123', 10);
  db.prepare('INSERT INTO owners (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Demo Owner', 'owner@tiffin.com', hash);

  const insertPlan = db.prepare('INSERT INTO plans (name, price_per_month, description) VALUES (?, ?, ?)');
  insertPlan.run('Standard Veg', 3000, 'One veg tiffin, weekdays only');
  insertPlan.run('Premium Veg', 4200, 'Veg tiffin with extra sabzi + sweet, weekdays only');
  insertPlan.run('Deluxe Non-Veg', 5000, 'Non-veg tiffin, weekdays only');

  const insertCustomer = db.prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)');
  const c1 = insertCustomer.run('Rahul Sharma', '9876543210', 'Malviya Nagar, Jaipur');
  const c2 = insertCustomer.run('Priya Verma', '9812345678', 'Vaishali Nagar, Jaipur');
  const c3 = insertCustomer.run('Aman Gupta', '9900112233', 'C-Scheme, Jaipur');

  const insertSub = db.prepare(
    'INSERT INTO subscriptions (customer_id, plan_id, start_date, status) VALUES (?, ?, ?, ?)'
  );
  const s1 = insertSub.run(c1.lastInsertRowid, 1, '2026-09-01', 'active');
  insertSub.run(c2.lastInsertRowid, 2, '2026-09-05', 'active');
  const s3 = insertSub.run(c3.lastInsertRowid, 1, '2026-09-01', 'paused');

  // Rahul went on a short trip
  db.prepare('INSERT INTO pauses (subscription_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)')
    .run(s1.lastInsertRowid, '2026-09-10', '2026-09-12', 'Travel');

  // Aman is currently paused (open-ended)
  db.prepare('INSERT INTO pauses (subscription_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)')
    .run(s3.lastInsertRowid, '2026-09-15', null, 'Festival at hometown');

  console.log('Seeded demo data. Owner login -> email: owner@tiffin.com  password: owner123');
}

module.exports = db;
