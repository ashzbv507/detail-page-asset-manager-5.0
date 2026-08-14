# 5.0 1차 구현 범위와 2차 확장 지점

## 1차 원칙

5.0 1차는 4.0의 일반 상세페이지 관리 화면과 흐름을 재현하는 단계다. 브랜드 선택·검색, 자산 테이블, 제품 정보 상세패널, 새 작업 등록 1·2단계, 이미지 목록/미리보기/정렬/삭제, 파일명 기반 이미지 URL, 일반 HTML, 썸네일 NAS와 상세페이지 NAS를 포함한다.

현재 단계에서는 컬리 NAS, 분할·크롭·캔버스·다운로드·GIF 프레임 기능은 제외한다. 다만 후속 작업 준비를 위해 이미지 카드의 컬리 제외 체크박스와 전체 이미지/제외 이미지 미리보기 영역만 제공한다. 컬리 결과의 Supabase 저장과 테이블 표시·복사는 아직 연결하지 않는다.

## 이미지와 일반 HTML

일반 이미지 한 장은 `app/lib/task-types.ts`의 `AssetImage`로 표현한다.

```ts
type AssetImage = {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
};
```

`id`는 정렬·삭제·선택 시 이미지 위치가 바뀌어도 같은 자산을 가리키는 안정적인 키다. 기본 이미지 URL은 `app/lib/html.ts`의 `buildImageUrl(filename)`에서 만든다. 사용자가 선택한 로컬 파일은 미리보기 동안 object URL을 사용하고, 실제 저장 단계에서 파일 업로드 결과 URL로 교체한다.

일반 HTML은 `generateGeneralHtml(images)`가 이미지 배열 전체를 순서대로 `<img>` 태그로 변환한다. 테이블, 상세패널, 작업 모달은 이 함수를 공통으로 사용하므로 HTML 형식 변경 지점이 한 곳에 있다.

## Supabase 연결 지점

현재 UI에는 하드코딩된 자산 mock data가 없다. Supabase 연결이 없으면 테이블과 이미지 목록이 빈 상태로 표시되며, 파일 선택으로 새 작업 초안을 만들 수 있다. `AssetTask`를 Supabase 행으로 변환하는 API 저장소는 `app/api/tasks/route.ts`에 있다.

현재 4.0과 연결된 Supabase `asset_tasks`에서 231건을 읽어 `public/data/tasks.json`으로 가져왔다. 화면은 API 조회를 우선 시도하고, 개발 서버가 Supabase에 접근하지 못할 때 이 실제 데이터 스냅샷을 fallback으로 사용한다. 최신 데이터로 다시 가져오려면 `.env.local`을 준비한 뒤 `npm.cmd run data:export`를 실행한다.

- 조회: 선택 브랜드와 검색 조건을 기준으로 `asset_tasks` 조회
- 생성: 작업 기본 정보와 NAS 경로 저장 후 이미지 메타데이터 저장
- 수정: 작업 id 기준으로 기본 정보·NAS 경로·이미지 순서 갱신
- 이미지: 업로드 결과의 공개 URL을 `AssetImage.url`에 기록하고 `id`를 별도 생성
- 일반 HTML: `generateGeneralHtml` 결과를 링크 또는 저장 필드에 기록

Supabase 스키마의 기존 컬리 열은 1차 화면 모델에 매핑하지 않는다. 기존 데이터 보존이 필요할 때는 조회/마이그레이션 계층에서 원본 열을 유지하고, 일반 UI에는 노출하지 않는다.

## 2차 컬리 기능을 추가할 위치

현재 이미지 카드에는 `excludeFromKurly` 상태와 컬리 미리보기 필터가 적용되어 있다. 일반 이미지 순서와 URL은 그대로 유지하고, 컬리용 결과는 별도 투영으로 계산한다. 2차에서는 이 상태를 Supabase에 저장하고 링크/테이블 기능으로 확장한다.

1. 이미지 카드에 `excludeFromKurly` 편집 상태를 추가한다.
2. `generateGeneralHtml(images)`는 그대로 전체 이미지를 사용한다.
3. 별도 함수 `generateKurlyHtml(images)`에서 제외 상태를 필터링한다.
4. Supabase에는 일반 HTML과 컬리 HTML 링크/저장 필드를 별도로 둔다.
5. 테이블과 상세패널에 컬리 링크·복사 UI를 추가한다.

이 순서를 따르면 일반 HTML 결과와 기존 이미지 id/url을 변경하지 않고 컬리 기능을 확장할 수 있다. 현재 체크 상태는 작업 모달의 로컬 미리보기에서만 사용하며, 저장 모델에는 아직 별도 컬리 필드를 추가하지 않는다.
