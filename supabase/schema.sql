-- ============================================================
-- Hyprep Group 6: Travel Management System
-- Run this entire file in Supabase Dashboard -> SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- PROFILES (adds a role to each auth user) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- PACKAGES (second table / simple CRUD) ----------
create table if not exists packages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  destination text not null,
  description text,
  price numeric not null check (price > 0),
  duration_days int not null check (duration_days > 0),
  image_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- BOOKINGS (main table / full CRUD) ----------
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid not null references packages(id) on delete restrict,
  traveler_name text not null,
  number_of_travelers int not null check (number_of_travelers > 0),
  travel_date date not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  total_price numeric not null,
  payment_proof_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_touch_updated_at on bookings;
create trigger bookings_touch_updated_at
  before update on bookings
  for each row execute procedure public.touch_updated_at();

-- ---------- ROW LEVEL SECURITY ----------
-- Note: the Express backend uses the service_role key (bypasses RLS) and
-- enforces these same rules in code. RLS is enabled here too as defense-in-depth
-- in case any client ever queries Supabase directly with the anon key.

alter table profiles enable row level security;
alter table packages enable row level security;
alter table bookings enable row level security;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

create policy "Admins can view all profiles" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Authenticated users can view active packages" on packages
  for select using (auth.role() = 'authenticated');

create policy "Admins can insert packages" on packages
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can update packages" on packages
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can delete packages" on packages
  for delete using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Users view own bookings, admins view all" on bookings
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Users can create their own bookings" on bookings
  for insert with check (auth.uid() = user_id);

create policy "Users update own bookings, admins update all" on bookings
  for update using (
    auth.uid() = user_id
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Users delete own bookings, admins delete all" on bookings
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------- STORAGE (file upload rule: max 2MB, payment proof / package images) ----------
insert into storage.buckets (id, name, public)
values ('travel-uploads', 'travel-uploads', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload to travel-uploads"
  on storage.objects for insert
  with check (bucket_id = 'travel-uploads' and auth.role() = 'authenticated');

create policy "Anyone can view travel-uploads files"
  on storage.objects for select
  using (bucket_id = 'travel-uploads');

-- ---------- OPTIONAL: seed a couple of sample packages ----------
insert into packages (name, destination, description, price, duration_days, image_url)
values
  ('5-Day Zanzibar Getaway', 'Zanzibar, Tanzania', 'Beachfront resort stay with island tours.', 650, 5, null),
  ('Weekend in Lagos', 'Lagos, Nigeria', 'City tour, Lekki beach, and nightlife experience.', 180, 3, null),
  ('Dubai Explorer Package', 'Dubai, UAE', 'Desert safari, Burj Khalifa, and shopping tour.', 1200, 7, null)
on conflict do nothing;
