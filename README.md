# Hyprep Group 6 — Travel Management System

Fullstack project built to the Hyprep scope: **Frontend (HTML/CSS/JS) + Backend (Node.js/Express) + Database/Auth/Storage (Supabase)**.

- Main table (full CRUD): `bookings`
- Second table (simple CRUD): `packages`
- 5 frontend pages, login + roles, backend validation, file upload (max 2MB), search, and a test checklist — matching every rule in the scope document.

## Folder Structure
```
hyprep-travel-management/
├── backend/           Node.js + Express API
│   ├── server.js
│   ├── src/
│   │   ├── supabaseClient.js
│   │   ├── middleware/auth.js      (verifies login + checks admin/customer role)
│   │   ├── routes/packages.js      (simple CRUD)
│   │   ├── routes/bookings.js      (full CRUD + validation)
│   │   ├── routes/upload.js        (file upload, 2MB limit)
│   │   └── utils/validate.js
│   └── .env.example
├── frontend/          Static HTML/CSS/JS (5 pages)
│   ├── index.html             Login / Sign up
│   ├── packages.html          Browse + search packages
│   ├── package-detail.html    Package detail + booking form
│   ├── bookings.html          My Bookings (customer) / All Bookings (admin)
│   ├── admin-packages.html    Manage Packages (admin only)
│   ├── config.js              Supabase + API URL config
│   ├── css/style.css
│   └── js/ (supabaseClient.js, common.js)
└── supabase/
    └── schema.sql      Run this once in Supabase SQL editor
```

## 1. Set up Supabase (database, auth, storage)
1. Create a free project at https://supabase.com.
2. Go to **SQL Editor** → paste the entire contents of `supabase/schema.sql` → **Run**.
   This creates `profiles`, `packages`, `bookings` tables, auto-profile trigger, Row Level Security policies, and a `travel-uploads` storage bucket (with 3 sample packages seeded).
3. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (keep this private — backend only)

## 2. Configure & run the backend
```bash
cd backend
cp .env.example .env
# edit .env and paste SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm start          # or: npm run dev (auto-restart with nodemon)
```
API runs at `http://localhost:4000`. Check it with `GET /api/health`.

## 3. Configure & run the frontend
```bash
cd frontend
# edit config.js with your SUPABASE_URL, SUPABASE_ANON_KEY, and API_BASE_URL
```
Serve it with any static server, e.g.:
```bash
npx http-server . -p 8080
```
Then open `http://localhost:8080`.

## 4. Try it out
- Sign up once as **Admin / Travel Agent** → go to "Manage Packages" → add a package (or use the 3 seeded ones).
- Sign up again (different email) as **Customer** → browse/search packages → book a trip (upload a payment proof file) → see it in "My Bookings".
- Log back in as Admin → "All Bookings" → change a booking's status to Confirmed/Cancelled.

## Test Checklist (finish line, per scope)
- [ ] Register/login works; correct role assigned
- [ ] Customer can browse and search packages
- [ ] Customer can create a booking (validation errors show clearly)
- [ ] Customer sees/edits/cancels only their own bookings
- [ ] Admin can create/edit/delete packages
- [ ] Admin can view and update status of all bookings
- [ ] File upload enforces 2MB limit and file type
- [ ] Search returns accurate filtered results
- [ ] Responsive on phone and laptop
- [ ] Full flow works: form → API → Supabase → success/error feedback

## Deployment Notes
- **Frontend**: deploy the `frontend/` folder as a static site (Netlify, Vercel, GitHub Pages). Update `config.js` → `API_BASE_URL` to your deployed backend URL.
- **Backend**: deploy `backend/` to Render, Railway, Fly.io, or similar Node host. Set the same env vars as `.env` in the host's dashboard, and set `ALLOWED_ORIGINS` to your deployed frontend URL (for CORS).
- **Supabase**: already hosted — no separate deployment needed.
