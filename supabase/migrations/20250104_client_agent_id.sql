-- ============================================================
-- SoapFlow Migration 20250104 — Client Agent ID & RLS Policies
-- ============================================================

-- 1. Add agent_id column to clients table if it doesn't exist
ALTER TABLE IF EXISTS public.clients 
ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Ensure RLS is enabled on clients
ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for clients table
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
