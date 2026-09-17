const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, first, second, year] = match;
  const result = `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() + 1 === Number(second) && parsed.getUTCDate() === Number(first)
    ? result : null;
}

router.post('/customers', (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.customers;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'customers must be an array' });

  const report = { imported: [], deduped: [], rejected: [] };
  const seenPhones = new Set();
  db.exec('BEGIN');
  try {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const name = String(row.name || row.customer_name || '').trim();
      const phone = normalizePhone(row.phone || row.mobile);
      const startDate = normalizeDate(row.start_date || row.startDate || row.date);
      const planId = Number(row.plan_id || row.planId);
      if (!name || !/^\d{10}$/.test(phone) || !startDate || !Number.isInteger(planId)) {
        report.rejected.push({ row: index + 1, reason: 'name, 10-digit phone, valid start_date, and plan_id are required' });
        continue;
      }
      if (seenPhones.has(phone) || db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone)) {
        report.deduped.push({ row: index + 1, phone, reason: 'duplicate phone' });
        continue;
      }
      if (!db.prepare('SELECT id FROM plans WHERE id = ?').get(planId)) {
        report.rejected.push({ row: index + 1, phone, reason: 'plan not found' });
        continue;
      }
      seenPhones.add(phone);
      const customer = db.prepare('INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)')
        .run(name, phone, row.address ? String(row.address).trim() : null);
      const subscription = db.prepare('INSERT INTO subscriptions (customer_id, plan_id, start_date, status) VALUES (?, ?, ?, ?)')
        .run(customer.lastInsertRowid, planId, startDate, 'active');
      report.imported.push({ row: index + 1, customer_id: Number(customer.lastInsertRowid), subscription_id: Number(subscription.lastInsertRowid), phone });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  res.status(201).json(report);
});

module.exports = router;