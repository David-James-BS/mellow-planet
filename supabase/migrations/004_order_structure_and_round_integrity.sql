-- Add structured order ownership/details and prevent multiple active rounds.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS drink_id uuid REFERENCES drinks_menu(id),
  ADD COLUMN IF NOT EXISTS modifier_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE orders
  SET modifier_ids = '[]'::jsonb
  WHERE modifier_ids IS NULL;

-- If older data has several active rounds, keep the newest one active.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at DESC, id DESC) AS active_rank
  FROM order_sessions
  WHERE is_active
)
UPDATE order_sessions
  SET is_active = false,
      closed_at = COALESCE(closed_at, now())
  WHERE id IN (SELECT id FROM ranked WHERE active_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_order_session
  ON order_sessions (is_active)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS unique_drink_category_base_name
  ON drinks_menu (category, base_name);

WITH ranked_modifiers AS (
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
  SELECT id FROM ranked_modifiers WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_modifier_group_sort_order
  ON modifiers (group_name, sort_order);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_sessions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drinks_menu;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.modifiers;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.drinks_menu REPLICA IDENTITY FULL;
ALTER TABLE public.modifiers REPLICA IDENTITY FULL;
