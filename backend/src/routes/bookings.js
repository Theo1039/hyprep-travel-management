
const express = require('express');
const router = express.Router();

const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { validateBooking } = require('../utils/validate');

const PRIVATE_BUCKET = 'travel-payment-proofs';

// Check that a payment-proof path belongs to the logged-in user.
function isValidPaymentProofPath(path, userId) {
  if (typeof path !== 'string') return false;

  const prefix = `${userId}/`;

  if (!path.startsWith(prefix)) return false;

  const filename = path.slice(prefix.length);

  // Accept only UUID-based PNG, JPG, or PDF filenames.
  const filenamePattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|pdf)$/i;

  return filenamePattern.test(filename);
}


// GET /api/bookings
// Customers see their own bookings. Admins see all bookings.
router.get('/', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('bookings')
    .select('*, packages(name, destination, price, image_url)')
    .order('created_at', { ascending: false });

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Get bookings error:', error);
    return res.status(500).json({ error: 'Could not retrieve bookings' });
  }

  res.json({ bookings: data });
});


// GET /api/bookings/:id/payment-proof
// Only the booking owner or an admin can view the private payment proof.
router.get('/:id/payment-proof', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('bookings')
    .select('id, user_id, payment_proof_path')
    .eq('id', req.params.id);

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  const { data: booking, error } = await query.single();

  if (error || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (!booking.payment_proof_path) {
    return res.status(404).json({ error: 'No payment proof was uploaded' });
  }

  const { data, error: signedUrlError } = await supabaseAdmin.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(booking.payment_proof_path, 300);

  if (signedUrlError || !data) {
    console.error('Create payment proof URL error:', signedUrlError);
    return res.status(500).json({
      error: 'Could not access payment proof'
    });
  }

  // The link expires after five minutes.
  res.json({ url: data.signedUrl });
});


// GET /api/bookings/:id
// Customers can retrieve their own booking. Admins can retrieve any booking.
router.get('/:id', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('bookings')
    .select('*, packages(name, destination, price, image_url)')
    .eq('id', req.params.id);

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  res.json({ booking: data });
});


// POST /api/bookings
// Create a new booking.
router.post('/', requireAuth, async (req, res) => {
  const errors = validateBooking(req.body);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const {
    package_id,
    traveler_name,
    number_of_travelers,
    travel_date,
    payment_proof_path
  } = req.body;

  // Make sure the payment proof belongs to this user.
  if (
    payment_proof_path !== undefined &&
    payment_proof_path !== null &&
    !isValidPaymentProofPath(payment_proof_path, req.user.id)
  ) {
    return res.status(400).json({
      error: 'Invalid payment proof path'
    });
  }

  // Find the selected travel package.
  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from('packages')
    .select('price, is_active')
    .eq('id', package_id)
    .single();

  if (pkgError || !pkg) {
    return res.status(400).json({
      error: 'Selected package does not exist'
    });
  }

  if (!pkg.is_active) {
    return res.status(400).json({
      error: 'This package is no longer available'
    });
  }

  // Calculate the total booking price on the server.
  const total_price =
    Number(pkg.price) * Number(number_of_travelers);

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .insert([{
      user_id: req.user.id,
      package_id,
      traveler_name: traveler_name.trim(),
      number_of_travelers: Number(number_of_travelers),
      travel_date,
      payment_proof_path: payment_proof_path || null,
      status: 'pending',
      total_price
    }])
    .select()
    .single();

  if (error) {
    console.error('Create booking error:', error);
    return res.status(500).json({
      error: 'Could not create booking'
    });
  }

  res.status(201).json({ booking: data });
});


// PUT /api/bookings/:id
// Customers can edit their own booking or cancel it.
// Admins can update booking status.
router.put('/:id', requireAuth, async (req, res) => {
  let findQuery = supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', req.params.id);

  if (req.user.role !== 'admin') {
    findQuery = findQuery.eq('user_id', req.user.id);
  }

  const { data: existing, error: findError } = await findQuery.single();

  if (findError || !existing) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const updates = {
    updated_at: new Date().toISOString()
  };

  // Only admins can set any of the allowed booking statuses.
  if (req.body.status !== undefined) {
    if (req.user.role !== 'admin' && req.body.status !== 'cancelled') {
      return res.status(403).json({
        error: 'You cannot change this booking status'
      });
    }

    if (!['pending', 'confirmed', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    updates.status = req.body.status;
  }

  // Validate traveller name.
  if (req.body.traveler_name !== undefined) {
    if (
      typeof req.body.traveler_name !== 'string' ||
      !req.body.traveler_name.trim()
    ) {
      return res.status(400).json({
        error: 'traveler_name must be valid text'
      });
    }

    updates.traveler_name = req.body.traveler_name.trim();
  }

  // Validate number of travellers.
  if (req.body.number_of_travelers !== undefined) {
    const travelers = Number(req.body.number_of_travelers);

    if (!Number.isInteger(travelers) || travelers < 1) {
      return res.status(400).json({
        error: 'number_of_travelers must be a positive whole number'
      });
    }

    updates.number_of_travelers = travelers;

    // Recalculate total price using the current package price.
    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from('packages')
      .select('price')
      .eq('id', existing.package_id)
      .single();

    if (pkgError || !pkg) {
      return res.status(400).json({
        error: 'Could not find the booking package'
      });
    }

    updates.total_price = Number(pkg.price) * travelers;
  }

  // Validate travel date.
  if (req.body.travel_date !== undefined) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(req.body.travel_date)) {
      return res.status(400).json({
        error: 'travel_date must use YYYY-MM-DD format'
      });
    }

    const [year, month, day] = req.body.travel_date.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return res.status(400).json({
        error: 'travel_date is not a valid date'
      });
    }

    const today = new Date();

    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    if (req.body.travel_date < todayString) {
      return res.status(400).json({
        error: 'travel_date must be today or a future date'
      });
    }

    updates.travel_date = req.body.travel_date;
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    console.error('Update booking error:', error);
    return res.status(500).json({
      error: 'Could not update booking'
    });
  }

  res.json({ booking: data });
});


// DELETE /api/bookings/:id
// Customers can delete their own bookings. Admins can delete any booking.
router.delete('/:id', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('bookings')
    .delete()
    .eq('id', req.params.id);

  if (req.user.role !== 'admin') {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error } = await query.select('id').single();

  if (error || !data) {
    return res.status(404).json({
      error: 'Booking not found or could not be deleted'
    });
  }

  res.json({ success: true });
});


module.exports = router;
