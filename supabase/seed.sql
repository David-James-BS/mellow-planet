-- ============================================================
-- IDEMPOTENT SEED DATA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- MODIFIERS
-- ============================================================

INSERT INTO modifiers (group_name, label, shortcode, sort_order) VALUES
  -- milk group
  ('milk',        'Normal',                    '',        1),
  ('milk',        'Evaporated Milk only (C)',  'C',       2),
  ('milk',        'Black / no milk (O)',       'O',       3),
  -- sugar group
  ('sugar',       'Normal sugar',              '',        1),
  ('sugar',       'Less sweet (Siu Dai)',      'Siu Dai', 2),
  ('sugar',       'Extra sweet (Gah Dai)',     'Gah Dai', 3),
  ('sugar',       'No sugar (Kosong)',         'Kosong',  4),
  -- strength group
  ('strength',    'Normal strength',           '',        1),
  ('strength',    'Strong (Gau)',              'Gau',     2),
  ('strength',    'Weak (Po)',                 'Po',      3),
  -- temperature group
  ('temperature', 'Hot',                       '',        1),
  ('temperature', 'Iced (Peng)',               'Peng',    2)
ON CONFLICT (group_name, sort_order) DO UPDATE
  SET label = EXCLUDED.label,
      shortcode = EXCLUDED.shortcode;

-- ============================================================
-- DRINKS MENU
-- ============================================================

INSERT INTO drinks_menu (category, base_name, available_modifiers) VALUES
  -- Coffee
  ('Coffee', 'Kopi',          '["milk","sugar","strength","temperature"]'),
  -- Tea
  ('Tea',    'Teh',           '["milk","sugar","strength","temperature"]'),
  -- Others
  ('Others', 'Milo',          '["milk","sugar","temperature"]'),
  ('Others', 'Horlicks',      '["milk","sugar","temperature"]'),
  ('Others', 'Barley',        '["sugar","temperature"]'),
  ('Others', 'Bandung',       '["sugar","temperature"]'),
  ('Others', 'Lemon Tea',     '["sugar","temperature"]'),
  ('Others', 'Chin Chow',     '["sugar","temperature"]'),
  ('Others', 'Soy Bean Milk', '["sugar","temperature"]'),
  ('Others', 'Sugarcane',     '["temperature"]')
ON CONFLICT (category, base_name) DO UPDATE
  SET available_modifiers = EXCLUDED.available_modifiers;

-- ============================================================
-- INITIAL ACTIVE ORDER SESSION
-- ============================================================

INSERT INTO order_sessions (is_active)
SELECT true
WHERE NOT EXISTS (
  SELECT 1 FROM order_sessions WHERE is_active
);

-- Legacy table kept for old migrations/API routes. The public v1 app no longer
-- uses an admin password, but this harmless row keeps old routes from failing.
INSERT INTO admin_config (id, admin_password_hash)
VALUES (1, crypt('admin123', gen_salt('bf', 10)))
ON CONFLICT (id) DO UPDATE
  SET admin_password_hash = EXCLUDED.admin_password_hash;
