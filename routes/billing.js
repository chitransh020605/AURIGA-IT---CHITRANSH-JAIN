const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { computeBill } = require('../utils/billing');

const router = express.Router();
router.use(requireAuth);

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function parseYearMonth(monthParam) {
  if (!monthParam) return currentYearMonth();
  const [y, m] = monthParam.split('-').map(Number);
  if (!y || !m) return currentYearMonth();
  return { year: y, month: m };
}

// GET /api/billing/subscription/:id?month=YYYY-MM
router.get('/subscription/:id', (req, res) => {
  const sub = db
    .prepare(
      `SELECT s.*, p.name AS plan_name, p.price_per_month, c.name AS customer_name, c.phone
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`
    )
    .get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const { year, month } = parseYearMonth(req.query.month);
  const pauses = db.prepare('SELECT * FROM pauses WHERE subscription_id = ?').all(sub.id);

  const bill = computeBill(sub, sub.price_per_month, pauses, year, month);

  res.json({
    customer_name: sub.customer_name,
    phone: sub.phone,
    plan_name: sub.plan_name,
    subscription_id: sub.id,
    ...bill,
  });
});

// GET /api/billing?month=YYYY-MM&page=&limit=&sort=amount|customer_name&order=
// Owner's month-end bill for every (non-cancelled-before-month) customer
router.get('/', (req, res) => {
  const { year, month } = parseYearMonth(req.query.month);
  const { page = 1, limit = 10 } = req.query;
  let { sort = 'customer_name', order = 'asc' } = req.query;
  const SORTABLE = ['customer_name', 'amount', 'deliveredDays'];
  if (!SORTABLE.includes(sort)) sort = 'customer_name';
  order = order.toLowerCase() === 'desc' ? -1 : 1;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const subs = db
    .prepare(
      `SELECT s.*, p.name AS plan_name, p.price_per_month, c.name AS customer_name, c.phone
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       JOIN customers c ON c.id = s.customer_id`
    )
    .all();

  const bills = subs.map((sub) => {
    const pauses = db.prepare('SELECT * FROM pauses WHERE subscription_id = ?').all(sub.id);
    const bill = computeBill(sub, sub.price_per_month, pauses, year, month);
    return {
      subscription_id: sub.id,
      customer_name: sub.customer_name,
      phone: sub.phone,
      plan_name: sub.plan_name,
      status: sub.status,
      ...bill,
    };
  });

  bills.sort((a, b) => {
    if (a[sort] < b[sort]) return -1 * order;
    if (a[sort] > b[sort]) return 1 * order;
    return 0;
  });

  const total = bills.length;
  const offset = (pageNum - 1) * limitNum;
  const paged = bills.slice(offset, offset + limitNum);

  const totalRevenue = Math.round(bills.reduce((sum, b) => sum + b.amount, 0) * 100) / 100;

  res.json({
    month: `${year}-${String(month).padStart(2, '0')}`,
    data: paged,
    totalRevenue,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  });
});

module.exports = router;
