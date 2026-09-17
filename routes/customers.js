const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const SORTABLE = ['name', 'phone', 'created_at'];

// GET /api/customers?search=&status=&page=1&limit=10&sort=name&order=asc
router.get('/', (req, res) => {
  const { search = '', status = '', page = 1, limit = 10 } = req.query;
  let { sort = 'name', order = 'asc' } = req.query;
  if (!SORTABLE.includes(sort)) sort = 'name';
  order = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  // Latest subscription status per customer, derived live (a pause with no
  // end_date, or one covering today, means "paused" even if the status
  // column wasn't updated yet).
  const today = new Date().toISOString().slice(0, 10);

  let where = `WHERE (c.name LIKE @q OR c.phone LIKE @q)`;
  const params = { q: `%${search}%` };

  const baseQuery = `
    SELECT c.id, c.name, c.phone, c.address, c.created_at,
      s.id AS subscription_id, s.status AS raw_status, s.start_date, p.name AS plan_name, p.price_per_month,
      EXISTS (
        SELECT 1 FROM pauses pa
        WHERE pa.subscription_id = s.id
          AND pa.start_date <= @today
          AND (pa.end_date IS NULL OR pa.end_date >= @today)
      ) AS is_paused_today
    FROM customers c
    LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status != 'cancelled'
    LEFT JOIN plans p ON p.id = s.plan_id
    ${where}
  `;

  params.today = today;

  let rows = db.prepare(baseQuery).all(params);

  // Collapse to one row per customer (most recent subscription) + effective status
  const byCustomer = new Map();
  for (const r of rows) {
    const effectiveStatus = r.subscription_id
      ? r.is_paused_today
        ? 'paused'
        : r.raw_status
      : 'no_subscription';
    if (!byCustomer.has(r.id) || (r.subscription_id && !byCustomer.get(r.id).subscription_id)) {
      byCustomer.set(r.id, { ...r, effective_status: effectiveStatus });
    }
  }
  let list = [...byCustomer.values()];

  if (status) {
    list = list.filter((c) => c.effective_status === status);
  }

  list.sort((a, b) => {
    const va = a[sort] ?? '';
    const vb = b[sort] ?? '';
    if (va < vb) return order === 'ASC' ? -1 : 1;
    if (va > vb) return order === 'ASC' ? 1 : -1;
    return 0;
  });

  const total = list.length;
  const paged = list.slice(offset, offset + limitNum);

  res.json({
    data: paged.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      status: c.effective_status,
      subscription_id: c.subscription_id,
      plan_name: c.plan_name,
      price_per_month: c.price_per_month,
    })),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    sort: { sort, order },
  });
});

// GET /api/customers/:id  (full detail incl. subscriptions + pauses)
router.get('/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const subscriptions = db
    .prepare(
      `SELECT s.*, p.name AS plan_name, p.price_per_month
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.customer_id = ? ORDER BY s.start_date DESC`
    )
    .all(customer.id);

  for (const sub of subscriptions) {
    sub.pauses = db
      .prepare('SELECT * FROM pauses WHERE subscription_id = ? ORDER BY start_date DESC')
      .all(sub.id);
  }

  res.json({ ...customer, subscriptions });
});

// POST /api/customers  (create new customer, looked up by phone)
router.post('/', (req, res) => {
  const { name, phone, address } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

  const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
  if (existing) return res.status(409).json({ error: 'A customer with this phone already exists' });

  const info = db
    .prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)')
    .run(name, phone, address || null);

  res.status(201).json({ id: info.lastInsertRowid, name, phone, address });
});

// GET /api/customers/lookup/:phone  (owner looks up customer by phone)
router.get('/lookup/:phone', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(req.params.phone);
  if (!customer) return res.status(404).json({ error: 'No customer with this phone number' });
  res.json(customer);
});

module.exports = router;
