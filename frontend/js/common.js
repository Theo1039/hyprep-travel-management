// Shared helpers used across all pages (auth guard, nav rendering, API calls)

async function getSessionOrRedirect() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = 'index.html';
    return null;
  }
  return data.session;
}

async function getCurrentProfile() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return profile;
}

function authHeader(session) {
  return { Authorization: `Bearer ${session.access_token}` };
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// Renders the top navbar and returns { session, profile } for the calling page to use.
// activePage: 'packages' | 'bookings' | 'admin'
async function renderNav(activePage) {
  const session = await getSessionOrRedirect();
  if (!session) return null;

  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === 'admin';
  const nav = document.getElementById('nav');

  if (nav) {
    nav.innerHTML = `
      <div class="nav-brand">&#9992; Travel Manager</div>
      <div class="nav-links">
        <a href="packages.html" class="${activePage === 'packages' ? 'active' : ''}">Packages</a>
        <a href="bookings.html" class="${activePage === 'bookings' ? 'active' : ''}">${isAdmin ? 'All Bookings' : 'My Bookings'}</a>
        ${isAdmin ? `<a href="admin-packages.html" class="${activePage === 'admin' ? 'active' : ''}">Manage Packages</a>` : ''}
        <span class="nav-user">${profile?.full_name || ''} &middot; ${profile?.role || ''}</span>
        <button onclick="logout()">Logout</button>
      </div>`;
  }

  return { session, profile };
}

// Wrapper around fetch() that adds the auth header and the API base URL
async function apiFetch(path, session, options = {}) {
  const res = await fetch(`${window.APP_CONFIG.API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader(session),
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function uploadFile(file, session) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/upload', session, { method: 'POST', body: formData });
}

function showMessage(el, text, type = 'error') {
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`;
}
