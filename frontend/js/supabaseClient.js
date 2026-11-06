// Requires the Supabase UMD script to be loaded first (see <script> tags in each HTML page)
// and config.js to have set window.APP_CONFIG
const supabaseClient = supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);
