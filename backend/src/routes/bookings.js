const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { validateBooking } = require('../utils/validate');

// GET /api/bookings -> customers see only their own; admins see all
router.get('/', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('bookings')
    .select('*, packages(name, destination, price, image_url)')
    .order('created_at', { ascending: false });

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ bookings: data });
});

// GET /api/bookings/:id
router.get('/:id', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('bookings')
    .select('*, packages(name, destination, price, image_url)')
    .eq('id', req.params.id);

  if (req.user.role !== 'admin') query = query.eq('user_id', req.user.id);

  const { data, error } = await query.single();
  if (error || !data) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking: data });
});

// POST /api/bookings -> create a booking (full CRUD, with validation)
router.post('/', requireAuth, async (req, res) => {
  const errors = validateBooking(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const { package_id, traveler_name, number_of_travelers, travel_date, payment_proof_url } = req.body;

  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from('packages')
    .select('price, is_active')
    .eq('id', package_id)
    .single();

  if (pkgError || !pkg) return res.status(400).json({ error: 'Selected package does not exist' });
  if (!pkg.is_active) return res.status(400).json({ error: 'This package is no longer available' });

  const total_price = Number(pkg.price) * Number(number_of_travelers);

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .insert([{
      user_id: req.user.id,
      package_id,
      traveler_name: traveler_name.trim(),
      number_of_travelers: Number(number_of_travelers),
      travel_date,
      payment_proof_url: payment_proof_url || null,
      status: 'pending',
      total_price
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ booking: data });
});

// PUT /api/bookings/:id -> owner can edit/cancel their own; admin can update status on any
router.put('/:id', requireAuth, async (req, res) => {
  let findQuery = supabaseAdmin.from('bookings').select('*').eq('id', req.params.id);
  if (req.user.role !== 'admin') findQuery = findQuery.eq('user_id', req.user.id);

  const { data: existing, error: findError } = await findQuery.single();
  if (findError || !existing) return res.status(404).json({ error: 'Booking not found' });

  const updates = { updated_at: new Date().toISOString() };

  if (req.user.role === 'admin' && req.body.status) {
    if (!['pending', 'confirmed', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    updates.status = req.body.status;
  }

  if (req.body.status === 'cancelled') updates.status = 'cancelled';
  if (req.body.traveler_name) updates.traveler_name = req.body.traveler_name.trim();
  if (req.body.number_of_travelers) {
    if (Number(req.body.number_of_travelers) <= 0) {
      return res.status(400).json({ error: 'number_of_travelers must be at least 1' });
    }
    updates.number_of_travelers = Number(req.body.number_of_travelers);
  }
  if (req.body.travel_date) updates.travel_date = req.body.travel_date;

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ booking: data });
});

// DELETE /api/bookings/:id -> owner deletes own, admin deletes any
router.delete('/:id', requireAuth, async (req, res) => {
  let query = supabaseAdmin.from('bookings').delete().eq('id', req.params.id);
  if (req.user.role !== 'admin') query = query.eq('user_id', req.user.id);

  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
