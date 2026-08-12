-- Remove tables left without members by the initial tables implementation.
-- `orders.table_id` uses ON DELETE SET NULL, so their orders are preserved as
-- unassigned orders.

DELETE FROM order_tables AS order_table
WHERE NOT EXISTS (
  SELECT 1
  FROM table_memberships AS membership
  WHERE membership.table_id = order_table.id
);
