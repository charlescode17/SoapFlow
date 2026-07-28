-- ============================================================
-- SoapFlow Migration 20250103 — Stock Movement Units & Activity Logs RLS
-- ============================================================

-- 1. Ensure stock_movements supports decimal numbers for boxes (e.g. 0.5 boxes, 2.5 boxes)
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN stock_in TYPE numeric USING stock_in::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN stock_out TYPE numeric USING stock_out::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN balance TYPE numeric USING balance::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN entered_qty TYPE numeric USING entered_qty::numeric;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN base_qty TYPE numeric USING base_qty::numeric;

-- 2. Ensure activity_logs table exists and allows authenticated inserts
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  action text,
  entity_type text,
  entity_id text,
  entity_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
