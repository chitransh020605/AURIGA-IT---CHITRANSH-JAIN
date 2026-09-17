const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  const existing = db.prepare('SELECT id FROM owners WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO owners (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name, email, hash);

  const token = jwt.sign({ id: info.lastInsertRowid, email, name }, SECRET, { expiresIn: '2d' });
  res.status(201).json({ token, owner: { id: info.lastInsertRowid, name, email } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const owner = db.prepare('SELECT * FROM owners WHERE email = ?').get(email);
  if (!owner) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = bcrypt.compareSync(password, owner.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: owner.id, email: owner.email, name: owner.name }, SECRET, {
    expiresIn: '2d',
  });
  res.json({ token, owner: { id: owner.id, name: owner.name, email: owner.email } });
});

module.exports = router;
