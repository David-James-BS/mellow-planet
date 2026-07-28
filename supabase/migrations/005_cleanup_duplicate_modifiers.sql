-- Clean up duplicate modifiers left by repeated manual seed/migration runs.
-- A modifier's identity is its group and shortcode. Sort order is presentation
-- data and must not be used to decide that two choices are the same.

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

DROP INDEX IF EXISTS unique_modifier_group_sort_order;

CREATE UNIQUE INDEX IF NOT EXISTS unique_modifier_group_shortcode
  ON modifiers (group_name, shortcode);
