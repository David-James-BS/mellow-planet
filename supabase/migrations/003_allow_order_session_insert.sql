-- Allow the browser anon client to start a new order session.
-- Apply the block below to existing Supabase projects in the SQL Editor too.

DO $$
BEGIN
  IF to_regclass('public.order_sessions') IS NULL THEN
    RAISE EXCEPTION 'public.order_sessions does not exist. Run supabase/migrations/001_initial_schema.sql before this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_sessions'
      AND policyname = 'anon insert order_sessions'
  ) THEN
    CREATE POLICY "anon insert order_sessions"
      ON order_sessions
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;
