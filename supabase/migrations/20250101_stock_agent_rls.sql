-- Supabase Row Level Security (RLS) policies for SoapFlow
-- Enables database-level permission enforcement for Stock Agents and Managers

-- 1. Enable RLS on core tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 2. Helper function to fetch current user's role from profiles
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text AS $$
  SELECT lower(trim(replace(role, '-', '_'))) FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. RLS Policies for `products` table
DROP POLICY IF EXISTS "Products view policy" ON public.products;
CREATE POLICY "Products view policy" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Products insert policy" ON public.products;
CREATE POLICY "Products insert policy" ON public.products
  FOR INSERT WITH CHECK (
    public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "Products update policy" ON public.products;
CREATE POLICY "Products update policy" ON public.products
  FOR UPDATE USING (
    public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "Products delete policy" ON public.products;
CREATE POLICY "Products delete policy" ON public.products
  FOR DELETE USING (
    public.get_current_user_role() = 'manager'
  );

-- 4. RLS Policies for `stock_movements` table
DROP POLICY IF EXISTS "Stock movements view policy" ON public.stock_movements;
CREATE POLICY "Stock movements view policy" ON public.stock_movements
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Stock movements insert policy" ON public.stock_movements;
CREATE POLICY "Stock movements insert policy" ON public.stock_movements
  FOR INSERT WITH CHECK (
    public.get_current_user_role() IN ('manager', 'stock_agent')
  );

DROP POLICY IF EXISTS "Stock movements update policy" ON public.stock_movements;
CREATE POLICY "Stock movements update policy" ON public.stock_movements
  FOR UPDATE USING (
    public.get_current_user_role() IN ('manager', 'stock_agent')
  );
