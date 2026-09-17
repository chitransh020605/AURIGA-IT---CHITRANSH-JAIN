const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isPaused } = require('../utils/billing');

const router = express.Router();

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function notifyDueDeliveries(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return [];

  const subscriptions = db.prepare(
    `SELECT s.id AS subscription_id, c.id AS customer_id, c.name, c.phone, c.address,
            p.name AS plan_name
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     JOIN plans p ON p.id = s.plan_id
     WHERE s.start_date <= ? AND (s.end_date IS NULL OR s.end_date >= ?)
       AND s.status != 'cancelled'`
  ).all(date, date);

  const created = [];
  for (const subscription of subscriptions) {
    const pauses = db.prepare('SELECT start_date, end_date FROM pauses WHERE subscription_id = ?').all(subscription.subscription_id);
    if (isPaused(date, pauses)) continue;
    const payload = {
      date,
      subscription_id: subscription.subscription_id,
      customer_id: subscription.customer_id,
      customer_name: subscription.name,
      phone: subscription.phone,
      address: subscription.address,
      plan_name: subscription.plan_name,
      message: `Tiffin delivery due today for ${subscription.name}`,
    };
    const info = db.prepare('INSERT INTO outbox (event_type, payload) VALUES (?, ?)')
      .run('delivery_due', JSON.stringify(payload));
    created.push({ id: Number(info.lastInsertRowid), event_type: 'delivery_due', ...payload });
  }
  return created;
}

function clockHandler(req, res) {
  const date = req.body.date || req.query.date;
  if (!validDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const notifications = notifyDueDeliveries(date);
  res.json({ date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), notifications });
}

function outboxHandler(req, res) {
  const rows = db.prepare('SELECT id, event_type, payload, created_at FROM outbox ORDER BY id').all()
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  res.json({ data: rows });
}

router.post('/clock', clockHandler);
router.get('/outbox', outboxHandler);

const authenticated = express.Router();
authenticated.use(requireAuth);
authenticated.post('/clock', clockHandler);
authenticated.get('/outbox', outboxHandler);

module.exports = { router, authenticated };