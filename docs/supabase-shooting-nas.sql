-- 촬영본 NAS 경로를 자산 테이블에 추가합니다.
-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.
alter table public.asset_tasks
  add column if not exists shooting_nas text not null default '';
