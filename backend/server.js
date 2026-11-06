require('dotenv').config();
const express = require('express');
const cors = require('cors');

const packagesRoutes = require('./src/routes/packages');
const bookingsRoutes = require('./src/routes/bookings');
const uploadRoutes = require('./src/routes/upload');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
}));

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', project: 'Travel Management System (Group 6)' }));

app.use('/api/packages', packagesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/upload', uploadRoutes);

// 404 handler
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Travel Management API running on port ${PORT}`);
});
