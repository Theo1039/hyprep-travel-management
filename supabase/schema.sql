
-- ============================================================
-- HYPREP GROUP 6: TRAVEL MANAGEMENT SYSTEM
-- Supabase Database Schema
--
-- IMPORTANT:
-- This is the canonical schema for a fresh installation.
-- Do not rerun the entire file on an existing production
-- database without checking the existing tables and policies.
-- ============================================================


-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 2. PROFILES
-- Each registered Supabase Auth user gets a profile.
-- New users are ALWAYS assigned the customer role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- Automatically create a customer profile after signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        'customer'
    );

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user();


-- ============================================================
-- 3. PACKAGES
-- Stores available travel packages.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    destination TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL CHECK (price > 0),
    duration_days INT NOT NULL CHECK (duration_days > 0),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 4. BOOKINGS
-- Stores customer travel bookings and payment-proof paths.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL
        REFERENCES public.packages(id) ON DELETE RESTRICT,
    traveler_name TEXT NOT NULL,
    number_of_travelers INT NOT NULL
        CHECK (number_of_travelers > 0),
    travel_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    total_price NUMERIC NOT NULL,
    payment_proof_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 5. AUTOMATIC UPDATED_AT TIMESTAMP
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS bookings_touch_updated_at
ON public.bookings;

CREATE TRIGGER bookings_touch_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE PROCEDURE public.touch_updated_at();


-- ============================================================
-- 6. ADMINISTRATOR HELPER FUNCTION
--
-- SECURITY DEFINER allows this function to check the profiles
-- table without triggering recursive administrator policies.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = (SELECT auth.uid())
          AND role = 'admin'
    );
$$;


REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;


-- Remove existing policies before recreating them.

DROP POLICY IF EXISTS "Users can view own profile"
ON public.profiles;

DROP POLICY IF EXISTS "Admins can view all profiles"
ON public.profiles;

DROP POLICY IF EXISTS "Authenticated users can view active packages"
ON public.packages;

DROP POLICY IF EXISTS "Admins can insert packages"
ON public.packages;

DROP POLICY IF EXISTS "Admins can update packages"
ON public.packages;

DROP POLICY IF EXISTS "Admins can delete packages"
ON public.packages;

DROP POLICY IF EXISTS "Users view own bookings, admins view all"
ON public.bookings;

DROP POLICY IF EXISTS "Users can create their own bookings"
ON public.bookings;

DROP POLICY IF EXISTS "Users update own bookings, admins update all"
ON public.bookings;

DROP POLICY IF EXISTS "Users delete own bookings, admins delete all"
ON public.bookings;


-- ------------------------------------------------------------
-- PROFILES POLICIES
-- ------------------------------------------------------------

-- Users can view their own profiles.

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);


-- Administrators can view all profiles.

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (public.is_admin());


-- ------------------------------------------------------------
-- PACKAGES POLICIES
-- ------------------------------------------------------------

-- Authenticated users can view active packages only.

CREATE POLICY "Authenticated users can view active packages"
ON public.packages
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND is_active = TRUE
);


-- Only administrators can create packages.

CREATE POLICY "Admins can insert packages"
ON public.packages
FOR INSERT
WITH CHECK (public.is_admin());


-- Only administrators can update packages.

CREATE POLICY "Admins can update packages"
ON public.packages
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- Only administrators can delete packages.

CREATE POLICY "Admins can delete packages"
ON public.packages
FOR DELETE
USING (public.is_admin());


-- ------------------------------------------------------------
-- BOOKINGS POLICIES
-- ------------------------------------------------------------

-- Customers can view their own bookings.
-- Administrators can view all bookings.

CREATE POLICY "Users view own bookings, admins view all"
ON public.bookings
FOR SELECT
USING (
    auth.uid() = user_id
    OR public.is_admin()
);


-- Customers can create bookings under their own user ID.

CREATE POLICY "Users can create their own bookings"
ON public.bookings
FOR INSERT
WITH CHECK (auth.uid() = user_id);


-- Customers can update their own bookings.
-- Administrators can update all bookings.

CREATE POLICY "Users update own bookings, admins update all"
ON public.bookings
FOR UPDATE
USING (
    auth.uid() = user_id
    OR public.is_admin()
)
WITH CHECK (
    auth.uid() = user_id
    OR public.is_admin()
);


-- Customers can delete their own bookings.
-- Administrators can delete all bookings.

CREATE POLICY "Users delete own bookings, admins delete all"
ON public.bookings
FOR DELETE
USING (
    auth.uid() = user_id
    OR public.is_admin()
);


-- ============================================================
-- 8. STORAGE BUCKETS
--
-- travel-uploads:
-- Public package images.
--
-- travel-payment-proofs:
-- Private customer payment documents.
-- ============================================================


-- Public package-image bucket.

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'travel-uploads',
    'travel-uploads',
    TRUE,
    2097152,
    ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id)
DO UPDATE SET
    public = TRUE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg'];


-- Private payment-proof bucket.

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'travel-payment-proofs',
    'travel-payment-proofs',
    FALSE,
    2097152,
    ARRAY[
        'image/png',
        'image/jpeg',
        'application/pdf'
    ]
)
ON CONFLICT (id)
DO UPDATE SET
    public = FALSE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY[
        'image/png',
        'image/jpeg',
        'application/pdf'
    ];


-- Remove the old direct-upload policy.
-- Uploads are handled by the Express backend using its
-- server-side service-role client.

DROP POLICY IF EXISTS "Authenticated users can upload to travel-uploads"
ON storage.objects;


-- Anyone can view images in the public package-image bucket.

DROP POLICY IF EXISTS "Anyone can view travel-uploads files"
ON storage.objects;

CREATE POLICY "Anyone can view travel-uploads files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'travel-uploads');


-- ============================================================
-- 9. OPTIONAL SAMPLE TRAVEL PACKAGES
--
-- The NOT EXISTS condition prevents duplicate sample records.
-- ============================================================

INSERT INTO public.packages (
    name,
    destination,
    description,
    price,
    duration_days,
    image_url
)
SELECT
    sample.name,
    sample.destination,
    sample.description,
    sample.price,
    sample.duration_days,
    sample.image_url
FROM (
    VALUES
        (
            '5-Day Zanzibar Getaway',
            'Zanzibar, Tanzania',
            'Beachfront resort stay with island tours.',
            650::NUMERIC,
            5,
            NULL::TEXT
        ),
        (
            'Weekend in Lagos',
            'Lagos, Nigeria',
            'City tour, Lekki beach, and nightlife experience.',
            180::NUMERIC,
            3,
            NULL::TEXT
        ),
        (
            'Dubai Explorer Package',
            'Dubai, UAE',
            'Desert safari, Burj Khalifa, and shopping tour.',
            1200::NUMERIC,
            7,
            NULL::TEXT
        )
) AS sample(
    name,
    destination,
    description,
    price,
    duration_days,
    image_url
)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.packages AS existing
    WHERE existing.name = sample.name
      AND existing.destination = sample.destination
);


-- ============================================================
-- END OF HYPREP GROUP 6 DATABASE SCHEMA
-- ============================================================
