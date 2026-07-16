-- Clean up duplicate default modifiers left by repeated manual seed/migration runs.
-- Keep the newest row for each group/sort slot, then enforce uniqueness.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY group_name, sort_order
      ORDER BY id DESC
    ) AS duplicate_rank
  FROM modifiers
)
DELETE FROM modifiers
WHERE id IN (
  SELECT id FROM ranked WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_modifier_group_sort_order
  ON modifiers (group_name, sort_order);
