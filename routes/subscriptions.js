const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);

// POST /api/subscriptions  { customer_id, plan_id, start_date }
router.post('/', (req, res) => {
  const { customer_id, plan_id, start_date } = req.body;
  if (!customer_id || !plan_id) {
    return res.status(400).json({ error: 'customer_id and plan_id are required' });
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const plan = db.prepare('SELECT id FROM plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // A customer shouldn't have two simultaneously active/paused subscriptions
  const active = db
    .prepare("SELECT id FROM subscriptions WHERE customer_id = ? AND status != 'cancelled'")
    .get(customer_id);
  if (active) {
    return res.status(409).json({ error: 'Customer already has an active subscription' });
  }

  const info = db
    .prepare('INSERT INTO subscriptions (customer_id, plan_id, start_date, status) VALUES (?, ?, ?, ?)')
    .run(customer_id, plan_id, start_date || todayStr(), 'active');

  res.status(201).json({ id: info.lastInsertRowid, customer_id, plan_id, start_date: start_date || todayStr(), status: 'active' });
});

// POST /api/subscriptions/:id/pause  { start_date, end_date?, reason? }
// end_date omitted = open-ended pause (paused indefinitely until resumed)
router.post('/:id/pause', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });
  if (sub.status === 'cancelled') return res.status(400).json({ error: 'Subscription is cancelled' });

  const { start_date, end_date, reason } = req.body;
  const start = start_date || todayStr();

  if (end_date && end_date < start) {
    return res.status(400).json({ error: 'end_date cannot be before start_date' });
  }

  db.prepare('INSERT INTO pauses (subscription_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)')
    .run(sub.id, start, end_date || null, reason || null);

  // Mark paused only if the pause is effective as of today (or in the past)
  if (start <= todayStr()) {
    db.prepare("UPDATE subscriptions SET status = 'paused' WHERE id = ?").run(sub.id);
  }

  res.json({ message: 'Pause recorded', subscription_id: sub.id, start_date: start, end_date: end_date || null });
});

// POST /api/subscriptions/:id/resume
router.post('/:id/resume', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const today = todayStr();

  // Close any open-ended pause (end_date IS NULL) by setting end_date to yesterday
  const openPause = db
    .prepare('SELECT * FROM pauses WHERE subscription_id = ? AND end_date IS NULL')
    .get(sub.id);
  if (openPause) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    const closeDate = yesterday < openPause.start_date ? openPause.start_date : yesterday;
    db.prepare('UPDATE pauses SET end_date = ? WHERE id = ?').run(closeDate, openPause.id);
  }

  db.prepare("UPDATE subscriptions SET status = 'active' WHERE id = ?").run(sub.id);
  res.json({ message: 'Subscription resumed', subscription_id: sub.id, resumed_on: today });
});

// POST /api/subscriptions/:id/cancel
router.post('/:id/cancel', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const today = todayStr();
  db.prepare("UPDATE subscriptions SET status = 'cancelled', end_date = ? WHERE id = ?").run(today, sub.id);
  res.json({ message: 'Subscription cancelled', subscription_id: sub.id, end_date: today });
});

// POST /api/subscriptions/:id/transfer { new_customer_id, transfer_date }
router.post('/:id/transfer', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });
  if (sub.status === 'cancelled') return res.status(400).json({ error: 'Subscription is cancelled' });
  const { new_customer_id: newCustomerId, transfer_date: transferDate } = req.body;
  if (!newCustomerId || !transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
    return res.status(400).json({ error: 'new_customer_id and transfer_date (YYYY-MM-DD) are required' });
  }
  if (transferDate <= sub.start_date || (sub.end_date && transferDate > sub.end_date)) {
    return res.status(400).json({ error: 'transfer_date must be inside the subscription cycle' });
  }
  if (!db.prepare('SELECT id FROM customers WHERE id = ?').get(newCustomerId)) {
    return res.status(404).json({ error: 'New customer not found' });
  }
  if (db.prepare("SELECT id FROM subscriptions WHERE customer_id = ? AND status != 'cancelled'").get(newCustomerId)) {
    return res.status(409).json({ error: 'New customer already has an active subscription' });
  }
  const previousDay = new Date(`${transferDate}T00:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const oldEnd = previousDay.toISOString().slice(0, 10);
  db.exec('BEGIN');
  let result;
  try {
    db.prepare('UPDATE subscriptions SET end_date = ?, status = ? WHERE id = ?').run(oldEnd, 'cancelled', sub.id);
    result = db.prepare('INSERT INTO subscriptions (customer_id, plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)')
      .run(newCustomerId, sub.plan_id, transferDate, sub.end_date, sub.status === 'paused' ? 'paused' : 'active');
    const pauses = db.prepare(
      `SELECT start_date, end_date, reason FROM pauses
       WHERE subscription_id = ? AND (end_date IS NULL OR end_date >= ?)`
    ).all(sub.id, transferDate);
    for (const pause of pauses) {
      db.prepare('INSERT INTO pauses (subscription_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)')
        .run(result.lastInsertRowid, pause.start_date < transferDate ? transferDate : pause.start_date, pause.end_date, pause.reason);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  res.status(201).json({ old_subscription_id: sub.id, new_subscription_id: Number(result.lastInsertRowid), transfer_date: transferDate, plan_id: sub.plan_id });
});

// GET /api/subscriptions?status=active|paused&page=&limit=&sort=&order=
router.get('/', (req, res) => {
  const { status = '', page = 1, limit = 10 } = req.query;
  let { sort = 'start_date', order = 'desc' } = req.query;
  const SORTABLE = ['start_date', 'status'];
  if (!SORTABLE.includes(sort)) sort = 'start_date';
  order = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  let where = '1=1';
  const params = [];
  if (status) {
    where += ' AND s.status = ?';
    params.push(status);
  }

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM subscriptions s WHERE ${where}`)
    .get(...params).c;

  const rows = db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.phone, p.name AS plan_name, p.price_per_month
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
       WHERE ${where}
       ORDER BY ${sort} ${order}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limitNum, offset);

  res.json({
    data: rows,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  });
});

module.exports = router;
