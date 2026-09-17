-- Existing tasks remain enabled. No images or HTML are changed.
ALTER TABLE public.asset_tasks
  ADD COLUMN IF NOT EXISTS kurly_enabled boolean NOT NULL DEFAULT true;
