-- Allow separate tasks when their notes differ.
-- Run this file once in Supabase SQL Editor before using the new rule.
-- No tasks are deleted. All changes roll back if a step fails.
BEGIN;

LOCK TABLE public.asset_tasks IN SHARE ROW EXCLUSIVE MODE;

-- API saves already use an empty string for an absent note.
UPDATE public.asset_tasks SET note = '' WHERE note IS NULL;
ALTER TABLE public.asset_tasks
  ALTER COLUMN note SET DEFAULT '',
  ALTER COLUMN note SET NOT NULL;

DO $$
DECLARE
  old_key record;
BEGIN
  -- Discover the actual names instead of assuming the original constraint name.
  -- Only remove uniqueness on exactly these four key columns; keep the primary
  -- key and every unrelated constraint/index. No CASCADE is used.
  FOR old_key IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.asset_tasks'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(c.conkey) AS key_column(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_column.attnum
      ) = ARRAY['brand_key', 'item_name', 'option_name', 'product_name']::text[]
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
      AND i.indnkeyatts = 4 AND i.indexprs IS NULL AND i.indpred IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key_column.attnum
        WHERE key_column.ordinality <= i.indnkeyatts
      ) = ARRAY['brand_key', 'item_name', 'option_name', 'product_name']::text[]
  LOOP
    EXECUTE format('DROP INDEX %I.%I', old_key.nspname, old_key.relname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS asset_tasks_identity_note_key
  ON public.asset_tasks (brand_key, product_name, item_name, option_name, note);

NOTIFY pgrst, 'reload schema';
COMMIT;
