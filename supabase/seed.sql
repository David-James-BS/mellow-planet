-- ============================================================
-- MODIFIERS
-- ============================================================

INSERT INTO modifiers (group_name, label, shortcode, sort_order) VALUES
  -- milk group
  ('milk',        'Normal',               '',        1),
  ('milk',        'Evaporated Milk only', 'C',       2),
  ('milk',        'Black/No milk',        'O',       3),
  -- sugar group
  ('sugar',       'Normal sugar',         '',        1),
  ('sugar',       'Less sweet',           'Siu Dai', 2),
  ('sugar',       'Extra sweet',          'Gah Dai', 3),
  ('sugar',       'No sugar',             'Kosong',  4),
  -- temperature group
  ('temperature', 'Hot',                  '',        1),
  ('temperature', 'Iced',                 'Peng',    2),
  -- strength group
  ('strength',   'Normal',               '',        1),
  ('strength',   'Strong (Gau)',         'Gau',     2),
  ('strength',   'Weak (Po)',            'Po',      3);

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
  ('Others', 'Sugarcane',     '["temperature"]');

-- ============================================================
-- INITIAL ACTIVE ORDER SESSION
-- ============================================================

INSERT INTO order_sessions (is_active) VALUES (true);

-- ============================================================
-- ADMIN CONFIG
-- password: "admin123" — change this before going to production
-- ============================================================

INSERT INTO admin_config (id, admin_password_hash)
VALUES (1, crypt('admin123', gen_salt('bf', 10)));
