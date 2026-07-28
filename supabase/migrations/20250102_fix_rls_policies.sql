-- ============================================================
-- SoapFlow RLS Fix — paste this entire file in Supabase SQL Editor
-- ============================================================

-- ── 1. Ensure stock_movements table exists ──────────────────
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
  entered_qty   integer NOT NULL DEFAULT 0,
  base_qty      integer NOT NULL DEFAULT 0,
  stock_in      integer NOT NULL DEFAULT 0,
  stock_out     integer NOT NULL DEFAULT 0,
  balance       integer NOT NULL DEFAULT 0,
  created_by    text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Safer helper function ─────────────────────────────────
-- Uses a direct SELECT so it never errors even if row is missing
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    lower(trim(replace(replace(role, '-', '_'), ' ', '_'))),
    'marketing_agent'
  )
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- ── 3. Enable RLS ────────────────────────────────────────────
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- ── 4. products policies ─────────────────────────────────────
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() = 'manager'
  );

-- ── 5. stock_movements policies ──────────────────────────────
DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;
CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "stock_movements_update" ON public.stock_movements;
CREATE POLICY "stock_movements_update" ON public.stock_movements
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "stock_movements_delete" ON public.stock_movements;
CREATE POLICY "stock_movements_delete" ON public.stock_movements
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND public.get_current_user_role() = 'manager'
  );

-- ── 6. profiles — ensure authenticated users can read own row ─
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid());
