require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws'); // Node < 22 has no built-in WebSocket; supabase-js realtime needs one

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[WARN] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. ' +
    'Copy backend/.env.example to backend/.env and fill in your Supabase project credentials.'
  );
}

// Service-role client: used server-side only. It bypasses Row Level Security,
// so every route MUST enforce ownership/role checks itself (see middleware/auth.js).
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket }
});

module.exports = { supabaseAdmin };
