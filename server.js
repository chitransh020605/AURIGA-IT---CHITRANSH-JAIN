require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // initializes + seeds sqlite on first run

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const planRoutes = require('./routes/plans');
const subscriptionRoutes = require('./routes/subscriptions');
const billingRoutes = require('./routes/billing');
const importRoutes = require('./routes/imports');
const clockRoutes = require('./routes/clock');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/import', importRoutes);
app.use('/api', clockRoutes.authenticated);
app.use('/', clockRoutes.router);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tiffin billing app running on http://localhost:${PORT}`);
});
