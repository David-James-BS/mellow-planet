-- Remove inaccurate "Gar" lukewarm temperature modifier (not a real kopitiam term)
DELETE FROM modifiers WHERE group_name = 'temperature' AND shortcode = 'Gar';

-- Add strength modifier group (Gau = strong, Po = weak)
INSERT INTO modifiers (group_name, label, shortcode, sort_order) VALUES
  ('strength', 'Normal',       '',    1),
  ('strength', 'Strong (Gau)', 'Gau', 2),
  ('strength', 'Weak (Po)',    'Po',  3);

-- Add strength to Kopi and Teh (brewed drinks where strength matters)
UPDATE drinks_menu
  SET available_modifiers = available_modifiers || '["strength"]'::jsonb
  WHERE base_name IN ('Kopi', 'Teh');

-- Enable Realtime for drinks_menu and modifiers so /menu page gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE drinks_menu;
ALTER PUBLICATION supabase_realtime ADD TABLE modifiers;
