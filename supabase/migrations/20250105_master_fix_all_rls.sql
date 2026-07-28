-- ============================================================
-- SoapFlow Master Database Setup & RLS Policy Fix
-- Paste and Run this ENTIRE script in your Supabase SQL Editor
-- ============================================================

-- ── 1. Create Helper Function First (Explicit role::text cast) ──
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    lower(trim(replace(replace(role::text, '-', '_'), ' ', '_'))),
    'marketing_agent'
  )
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- ── 2. Setup `clients` Table & Policies ──────────────────────
ALTER TABLE IF EXISTS public.clients 
ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' 
    AND public.get_current_user_role() IN ('manager', 'marketing_agent', 'stock_agent')
  );

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE USING (
    auth.role() = 'authenticated' 
    AND public.get_current_user_role() IN ('manager', 'marketing_agent', 'stock_agent')
  );

DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_delete" ON public.clients
  FOR DELETE USING (
    auth.role() = 'authenticated' 
    AND public.get_current_user_role() = 'manager'
  );

-- ── 3. Setup `products` Table & Policies ─────────────────────
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() = 'manager'
  );

-- ── 4. Setup `stock_movements` Table & Policies ──────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  date          date NOT NULL,
  type          text NOT NULL CHECK (type IN ('production','marketing_agent','customer_sale','other')),
  agent_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name text,
  location      text,
  is_return     boolean NOT NULL DEFAULT false,
  unit          text NOT NULL DEFAULT 'box',
  entered_qty   numeric NOT NULL DEFAULT 0,
  base_qty      numeric NOT NULL DEFAULT 0,
  stock_in      numeric NOT NULL DEFAULT 0,
  stock_out     numeric NOT NULL DEFAULT 0,
  balance       numeric NOT NULL DEFAULT 0,
  created_by    text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Ensure column numeric types for decimal boxes
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN stock_in TYPE numeric USING stock_in::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN stock_out TYPE numeric USING stock_out::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN balance TYPE numeric USING balance::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN entered_qty TYPE numeric USING entered_qty::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN base_qty TYPE numeric USING base_qty::numeric;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;
CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "stock_movements_update" ON public.stock_movements;
CREATE POLICY "stock_movements_update" ON public.stock_movements
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "stock_movements_delete" ON public.stock_movements;
CREATE POLICY "stock_movements_delete" ON public.stock_movements
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() = 'manager'
  );

-- ── 5. Setup `activity_logs` Table & Policies ────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_name  text,
  action      text,
  entity_type text,
  entity_id   text,
  entity_name text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 6. Setup `profiles` Policies ─────────────────────────────
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());
