const express = require('express');
const multer = require('multer');
const router = express.Router();
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const MAX_SIZE = 2 * 1024 * 1024; // 2MB, per the "same file upload" rule
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const BUCKET = 'travel-uploads';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or PDF files are allowed'));
    }
    cb(null, true);
  }
});

// POST /api/upload  (multipart/form-data, field name: "file")
// Used for package cover images (admin) and booking payment proof (customer)
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const path = `${req.user.id}/${Date.now()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype });

    if (error) return res.status(500).json({ error: error.message });

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    res.json({ url: data.publicUrl, path });
  });
});

module.exports = router;
