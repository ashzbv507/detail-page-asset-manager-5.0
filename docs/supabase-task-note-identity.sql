-- Allow separate tasks when either their vendors or notes differ.
-- This file is safe to run again when upgrading from the earlier note-only rule.
-- No tasks are deleted. All changes roll back if a step fails.
BEGIN;

LOCK TABLE public.asset_tasks IN SHARE ROW EXCLUSIVE MODE;

-- API saves already use an empty string for an absent note.
UPDATE public.asset_tasks SET note = '' WHERE note IS NULL;
ALTER TABLE public.asset_tasks
  ALTER COLUMN note SET DEFAULT '',
  ALTER COLUMN note SET NOT NULL;

-- Store vendor selections in one stable order so selecting the same vendors in
-- a different click order cannot create an accidental duplicate.
UPDATE public.asset_tasks AS task
SET vendors = COALESCE((
  SELECT array_agg(normalized.vendor ORDER BY
    CASE normalized.vendor
      WHEN '컬리 ONLY' THEN 0
      WHEN '오집 ONLY' THEN 1
      WHEN '퀸잇 ONLY' THEN 2
      WHEN '현대 ONLY' THEN 3
      WHEN '네이버 ONLY' THEN 4
      WHEN '29cm ONLY' THEN 5
      ELSE 100
    END,
    normalized.vendor
  )
  FROM (
    SELECT DISTINCT btrim(vendor_value.value) AS vendor
    FROM unnest(COALESCE(task.vendors, ARRAY[]::text[])) AS vendor_value(value)
    WHERE btrim(vendor_value.value) <> ''
  ) AS normalized
), ARRAY[]::text[]);
ALTER TABLE public.asset_tasks
  ALTER COLUMN vendors SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN vendors SET NOT NULL;

DO $$
DECLARE
  old_key record;
BEGIN
  -- Discover the actual names instead of assuming the original constraint name.
  -- Remove the former product-only, note-only, or vendor+note identity rule;
  -- keep the primary key and every unrelated constraint/index. No CASCADE is used.
  FOR old_key IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.asset_tasks'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(c.conkey) AS key_column(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_column.attnum
      ) IN (
        ARRAY['brand_key', 'item_name', 'option_name', 'product_name']::text[],
        ARRAY['brand_key', 'item_name', 'note', 'option_name', 'product_name']::text[],
        ARRAY['brand_key', 'item_name', 'note', 'option_name', 'product_name', 'vendors']::text[]
      )
  LOOP
    EXECUTE format('ALTER TABLE public.asset_tasks DROP CONSTRAINT %I', old_key.conname);
  END LOOP;

  -- Also handle an original rule created as a standalone unique index.
  FOR old_key IN
    SELECT n.nspname, idx.relname
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = idx.relnamespace
    WHERE i.indrelid = 'public.asset_tasks'::regclass
      AND i.indisunique AND NOT i.indisprimary
      AND i.indnkeyatts IN (4, 5, 6) AND i.indexprs IS NULL AND i.indpred IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key_column.attnum
        WHERE key_column.ordinality <= i.indnkeyatts
      ) IN (
        ARRAY['brand_key', 'item_name', 'option_name', 'product_name']::text[],
        ARRAY['brand_key', 'item_name', 'note', 'option_name', 'product_name']::text[],
        ARRAY['brand_key', 'item_name', 'note', 'option_name', 'product_name', 'vendors']::text[]
      )
  LOOP
    EXECUTE format('DROP INDEX %I.%I', old_key.nspname, old_key.relname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX asset_tasks_identity_vendor_note_key
  ON public.asset_tasks (brand_key, product_name, item_name, option_name, vendors, note);

NOTIFY pgrst, 'reload schema';
COMMIT;
