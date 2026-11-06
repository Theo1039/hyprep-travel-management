const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validatePackage } = require('../utils/validate');

// GET /api/packages?search=zanzibar  -> search/filter (the "same search" rule)
router.get('/', requireAuth, async (req, res) => {
  const { search } = req.query;

  let query = supabaseAdmin
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (search && search.trim()) {
    const term = search.trim().replace(/[%,]/g, '');
    query = query.or(`name.ilike.%${term}%,destination.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ packages: data });
});

// GET /api/packages/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Package not found' });
  res.json({ package: data });
});

// POST /api/packages (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const errors = validatePackage(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const { name, destination, description, price, duration_days, image_url } = req.body;

  const { data, error } = await supabaseAdmin
    .from('packages')
    .insert([{
      name,
      destination,
      description: description || null,
      price: Number(price),
      duration_days: Number(duration_days),
      image_url: image_url || null,
      is_active: true
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ package: data });
});

// PUT /api/packages/:id (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const errors = validatePackage(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const allowedFields = ['name', 'destination', 'description', 'price', 'duration_days', 'image_url', 'is_active'];
  const updates = {};
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  const { data, error } = await supabaseAdmin
    .from('packages')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ package: data });
});

// DELETE /api/packages/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin.from('packages').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
