# 공유 링크 저장 구조

공유 링크는 선택한 품목의 읽기 전용 스냅샷을 `asset_shares`에 저장합니다. 로컬 개발 중 테이블이 아직 없으면 API가 프로세스 메모리 저장소로 동작합니다.

Supabase에서는 다음 마이그레이션을 적용해야 재시작 후에도 공유 링크가 유지됩니다.

```sql
create table if not exists public.asset_shares (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists asset_shares_token_hash_idx
  on public.asset_shares (token_hash);
```

공유 API는 원본 행 ID가 아닌 랜덤 토큰을 링크에 사용하며, 토큰 해시만 저장합니다. 공유 페이지는 스냅샷에 포함된 품목만 읽기 전용으로 표시합니다.
