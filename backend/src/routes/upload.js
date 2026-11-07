
const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');

const router = express.Router();

const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const MAX_SIZE = 2 * 1024 * 1024;

const PUBLIC_BUCKET = 'travel-uploads';
const PRIVATE_BUCKET = 'travel-payment-proofs';

// Store uploaded files temporarily in memory.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SIZE
  }
});

// Check the actual file signature instead of trusting its filename.
function detectFileType(buffer) {
  // PNG signature
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    )
  ) {
    return { mime: 'image/png', extension: 'png' };
  }

  // JPEG signature
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xFF &&
    buffer[1] === 0xD8 &&
    buffer[2] === 0xFF
  ) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }

  // PDF signature
  if (buffer.subarray(0, 5).toString() === '%PDF-') {
    return { mime: 'application/pdf', extension: 'pdf' };
  }

  return null;
}

// Handle errors from Multer.
function handleUpload(handler) {
  return (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: err.code === 'LIMIT_FILE_SIZE'
            ? 'File must be 2MB or smaller'
            : err.message
        });
      }

      handler(req, res, next).catch(next);
    });
  };
}

// Check that a file is genuine and has an allowed type.
function validateFile(file, allowedTypes) {
  if (!file) {
    return { error: 'No file provided' };
  }

  const detected = detectFileType(file.buffer);

  if (!detected || !allowedTypes.includes(detected.mime)) {
    return { error: 'Only valid PNG, JPG, or PDF files are allowed' };
  }

  return { detected };
}

// PACKAGE IMAGE UPLOAD
// Only administrators can upload package images.
router.post(
  '/package-image',
  requireAuth,
  async (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Only administrators can upload package images'
      });
    }

    next();
  },
  handleUpload(async (req, res) => {
    const result = validateFile(req.file, [
      'image/png',
      'image/jpeg'
    ]);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const { detected } = result;
    const path = `packages/${randomUUID()}.${detected.extension}`;

    const { error } = await supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .upload(path, req.file.buffer, {
        contentType: detected.mime,
        upsert: false
      });

    if (error) {
      console.error('Package image upload failed:', error);
      return res.status(500).json({
        error: 'Could not upload package image'
      });
    }

    const { data } = supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .getPublicUrl(path);

    res.status(201).json({
      url: data.publicUrl,
      path
    });
  })
);

// PAYMENT PROOF UPLOAD
// Authenticated users can upload their own payment documents.
router.post(
  '/payment-proof',
  requireAuth,
  handleUpload(async (req, res) => {
    const result = validateFile(req.file, [
      'image/png',
      'image/jpeg',
      'application/pdf'
    ]);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const { detected } = result;

    // Every user's files are stored inside their own folder.
    const path = `${req.user.id}/${randomUUID()}.${detected.extension}`;

    const { error } = await supabaseAdmin.storage
      .from(PRIVATE_BUCKET)
      .upload(path, req.file.buffer, {
        contentType: detected.mime,
        upsert: false
      });

    if (error) {
      console.error('Payment proof upload failed:', error);
      return res.status(500).json({
        error: 'Could not upload payment proof'
      });
    }

    // Return the private file path, not a public URL.
    res.status(201).json({
      path
    });
  })
);

module.exports = router;