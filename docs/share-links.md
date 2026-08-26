# 공유 링크 저장 구조

공유 링크는 선택한 원본 품목의 ID 목록을 `asset_shares`에 저장합니다. 공유 페이지를 열 때마다 원본 `asset_tasks`를 다시 조회하므로, 원본의 HTML·NAS·참고사항·이미지 등을 수정하면 공유 링크에도 즉시 반영됩니다. 원본 행을 삭제하면 공유 화면에서도 해당 행이 사라집니다.

공유 링크는 사실상 영구적으로 유지됩니다(만료일 `9999-12-31`). 필요 시 `revoked_at`을 설정해 비활성화할 수 있습니다.

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

공유 API는 원본 행 ID가 아닌 랜덤 토큰을 링크에 사용하며, 토큰 해시만 저장합니다. 공유 페이지는 선택된 원본 품목만 읽기 전용으로 표시합니다. Supabase 저장에 실패하면 링크를 생성하지 않고 오류를 반환합니다.
