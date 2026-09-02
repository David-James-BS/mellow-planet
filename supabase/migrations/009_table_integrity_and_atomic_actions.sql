-- Keep table data internally consistent even if a browser request is interrupted.

CREATE OR REPLACE FUNCTION public.validate_order_table_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  table_session_id uuid;
BEGIN
  IF NEW.table_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT session_id INTO table_session_id
  FROM public.order_tables
  WHERE id = NEW.table_id;

  IF table_session_id IS NULL OR table_session_id <> NEW.session_id THEN
    RAISE EXCEPTION 'An order can only belong to a table in the same session';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_table_session_trigger ON public.orders;
CREATE TRIGGER validate_order_table_session_trigger
  BEFORE INSERT OR UPDATE OF session_id, table_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_table_session();

CREATE OR REPLACE FUNCTION public.delete_empty_order_table()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.order_tables AS order_table
  WHERE order_table.id = OLD.table_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.table_memberships AS membership
      WHERE membership.table_id = OLD.table_id
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_empty_order_table_trigger ON public.table_memberships;
CREATE TRIGGER delete_empty_order_table_trigger
  AFTER DELETE ON public.table_memberships
  FOR EACH ROW EXECUTE FUNCTION public.delete_empty_order_table();

CREATE OR REPLACE FUNCTION public.create_and_join_order_table(
  p_session_id uuid,
  p_device_id text,
  p_person_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_table_id uuid;
BEGIN
  INSERT INTO order_tables (session_id, name, created_by_device_id, created_by_name)
  VALUES (p_session_id, trim(p_person_name) || '''s table', p_device_id, trim(p_person_name))
  RETURNING id INTO new_table_id;

  DELETE FROM table_memberships
  WHERE session_id = p_session_id AND device_id = p_device_id;

  INSERT INTO table_memberships (session_id, table_id, device_id, person_name)
  VALUES (p_session_id, new_table_id, p_device_id, trim(p_person_name));

  RETURN new_table_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_order_table(
  p_session_id uuid,
  p_table_id uuid,
  p_device_id text,
  p_person_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM order_tables WHERE id = p_table_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Table does not belong to this session';
  END IF;

  DELETE FROM table_memberships
  WHERE session_id = p_session_id AND device_id = p_device_id;

  INSERT INTO table_memberships (session_id, table_id, device_id, person_name)
  VALUES (p_session_id, p_table_id, p_device_id, trim(p_person_name));

  UPDATE orders
  SET table_id = p_table_id
  WHERE session_id = p_session_id
    AND device_id = p_device_id
    AND table_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_order_table(
  p_session_id uuid,
  p_device_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_table_id uuid;
BEGIN
  SELECT table_id INTO current_table_id
  FROM table_memberships
  WHERE session_id = p_session_id AND device_id = p_device_id;

  IF current_table_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE orders
  SET table_id = NULL
  WHERE session_id = p_session_id
    AND device_id = p_device_id
    AND table_id = current_table_id;

  DELETE FROM table_memberships
  WHERE session_id = p_session_id AND device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_orders_to_table(
  p_session_id uuid,
  p_table_id uuid,
  p_actor_device_id text,
  p_order_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM table_memberships
    WHERE session_id = p_session_id AND table_id = p_table_id AND device_id = p_actor_device_id
  ) THEN
    RAISE EXCEPTION 'Only a current table member can move orders';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM order_tables WHERE id = p_table_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Table does not belong to this session';
  END IF;

  FOR owner IN
    SELECT DISTINCT device_id, person_name
    FROM orders
    WHERE session_id = p_session_id
      AND id = ANY(p_order_ids)
      AND device_id IS NOT NULL
  LOOP
    DELETE FROM table_memberships
    WHERE session_id = p_session_id
      AND device_id = owner.device_id
      AND table_id <> p_table_id;

    INSERT INTO table_memberships (session_id, table_id, device_id, person_name)
    VALUES (p_session_id, p_table_id, owner.device_id, owner.person_name)
    ON CONFLICT (session_id, device_id)
    DO UPDATE SET table_id = EXCLUDED.table_id, person_name = EXCLUDED.person_name;
  END LOOP;

  UPDATE orders
  SET table_id = p_table_id
  WHERE session_id = p_session_id AND id = ANY(p_order_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_order_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  UPDATE order_sessions
  SET is_active = false, closed_at = now()
  WHERE is_active AND id <> p_session_id;

  UPDATE order_sessions
  SET is_active = true, closed_at = NULL
  WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_and_join_order_table(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_order_table(uuid, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.leave_order_table(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.move_orders_to_table(uuid, uuid, text, uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.resume_order_session(uuid) TO anon;
