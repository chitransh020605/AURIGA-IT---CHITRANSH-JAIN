const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/plans
router.get('/', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY price_per_month ASC').all();
  res.json(plans);
});

// POST /api/plans
router.post('/', (req, res) => {
  const { name, price_per_month, description } = req.body;
  if (!name || !price_per_month) {
    return res.status(400).json({ error: 'name and price_per_month are required' });
  }
  const info = db
    .prepare('INSERT INTO plans (name, price_per_month, description) VALUES (?, ?, ?)')
    .run(name, price_per_month, description || null);
  res.status(201).json({ id: info.lastInsertRowid, name, price_per_month, description });
});

module.exports = router;
