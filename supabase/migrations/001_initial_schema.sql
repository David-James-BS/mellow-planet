-- Enable pgcrypto (for crypt() used in seed)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLES (FK-dependency order: order_sessions before orders)
-- ============================================================

CREATE TABLE order_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz
);

CREATE TABLE drinks_menu (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category            text        NOT NULL,
  base_name           text        NOT NULL,
  available_modifiers jsonb       NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE modifiers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name text NOT NULL,
  label      text NOT NULL,
  shortcode  text NOT NULL,
  sort_order int  NOT NULL
);

CREATE TABLE orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name       text        NOT NULL,
  drink_description text        NOT NULL,
  session_id        uuid        REFERENCES order_sessions(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reset_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by text,
  status       text        NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_config (
  id                  int  PRIMARY KEY DEFAULT 1,
  admin_password_hash text
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE order_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drinks_menu     ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reset_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_config    ENABLE ROW LEVEL SECURITY;

-- SELECT for anon on all tables
CREATE POLICY "anon select order_sessions"  ON order_sessions  FOR SELECT TO anon USING (true);
CREATE POLICY "anon select drinks_menu"     ON drinks_menu     FOR SELECT TO anon USING (true);
CREATE POLICY "anon select modifiers"       ON modifiers       FOR SELECT TO anon USING (true);
CREATE POLICY "anon select orders"          ON orders          FOR SELECT TO anon USING (true);
CREATE POLICY "anon select reset_requests"  ON reset_requests  FOR SELECT TO anon USING (true);
CREATE POLICY "anon select admin_config"    ON admin_config    FOR SELECT TO anon USING (true);

-- INSERT for anon: orders, reset_requests
CREATE POLICY "anon insert orders"         ON orders         FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon insert reset_requests" ON reset_requests FOR INSERT TO anon WITH CHECK (true);

-- INSERT + UPDATE + DELETE for anon: drinks_menu, modifiers
CREATE POLICY "anon insert drinks_menu"  ON drinks_menu FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update drinks_menu"  ON drinks_menu FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete drinks_menu"  ON drinks_menu FOR DELETE TO anon USING (true);

CREATE POLICY "anon insert modifiers"    ON modifiers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update modifiers"    ON modifiers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete modifiers"    ON modifiers FOR DELETE TO anon USING (true);

-- UPDATE + DELETE for anon: orders, order_sessions, admin_config
CREATE POLICY "anon update orders"          ON orders          FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete orders"          ON orders          FOR DELETE TO anon USING (true);
CREATE POLICY "anon update order_sessions"  ON order_sessions  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete order_sessions"  ON order_sessions  FOR DELETE TO anon USING (true);
CREATE POLICY "anon update admin_config"    ON admin_config    FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete admin_config"    ON admin_config    FOR DELETE TO anon USING (true);

-- ============================================================
-- SUPABASE REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE reset_requests;
