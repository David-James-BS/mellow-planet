-- Tables organise orders within one session. Existing orders stay unassigned.

CREATE TABLE IF NOT EXISTS order_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  created_by_device_id text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES order_tables(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  person_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, device_id),
  UNIQUE (table_id, device_id)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES order_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS order_tables_session_id_idx ON order_tables(session_id);
CREATE INDEX IF NOT EXISTS table_memberships_session_id_idx ON table_memberships(session_id);
CREATE INDEX IF NOT EXISTS table_memberships_table_id_idx ON table_memberships(table_id);
CREATE INDEX IF NOT EXISTS orders_table_id_idx ON orders(table_id);

ALTER TABLE order_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon select order_tables" ON order_tables FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert order_tables" ON order_tables FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update order_tables" ON order_tables FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete order_tables" ON order_tables FOR DELETE TO anon USING (true);

CREATE POLICY "anon select table_memberships" ON table_memberships FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert table_memberships" ON table_memberships FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update table_memberships" ON table_memberships FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete table_memberships" ON table_memberships FOR DELETE TO anon USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_tables;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_memberships;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.order_tables REPLICA IDENTITY FULL;
ALTER TABLE public.table_memberships REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
