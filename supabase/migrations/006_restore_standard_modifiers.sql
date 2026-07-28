-- Restore any standard choices removed by the old group/sort-order cleanup.
-- Custom modifiers are retained.

DROP INDEX IF EXISTS unique_modifier_group_sort_order;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY group_name, shortcode
      ORDER BY id DESC
    ) AS duplicate_rank
  FROM modifiers
)
DELETE FROM modifiers
WHERE id IN (
  SELECT id FROM ranked WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_modifier_group_shortcode
  ON modifiers (group_name, shortcode);

INSERT INTO modifiers (group_name, label, shortcode, sort_order) VALUES
  ('milk',        'Normal',                    '',        1),
  ('milk',        'Evaporated Milk only (C)',  'C',       2),
  ('milk',        'Black / no milk (O)',       'O',       3),
  ('sugar',       'Normal sugar',              '',        1),
  ('sugar',       'Less sweet (Siu Dai)',      'Siu Dai', 2),
  ('sugar',       'Extra sweet (Gah Dai)',     'Gah Dai', 3),
  ('sugar',       'No sugar (Kosong)',         'Kosong',  4),
  ('strength',    'Normal strength',           '',        1),
  ('strength',    'Strong (Gau)',              'Gau',     2),
  ('strength',    'Weak (Po)',                 'Po',      3),
  ('temperature', 'Hot',                       '',        1),
  ('temperature', 'Iced (Peng)',               'Peng',    2)
ON CONFLICT (group_name, shortcode) DO UPDATE
  SET label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;
