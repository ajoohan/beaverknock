-- 활동 조건이 어디에도 저장되지 않고 있었다.
--
-- '활동 조건 설정' 화면은 저장 버튼을 누르면 "저장됐습니다 · 새 조건부터
-- 적용됩니다" 라고 말했다. 실제로는 아무 데도 넣지 않았다. 브라우저 메모리에만
-- 있어서 새로고침하면 기본값(하남시)으로 돌아갔고, 서울에서 활동하겠다고
-- 정해둔 중개사가 다음 날 들어오면 하남 손님만 보였다.
--
-- 게다가 목록을 거르는 값을 매번 브라우저가 보냈다. 저장된 것이 없으니
-- 그럴 수밖에 없었는데, 그러면 새 조건이 들어왔을 때 '이 조건이 누구에게
-- 맞는가' 를 서버가 알 수 없다 - 알림을 보낼 방법이 아예 없었다.
--
-- 정한 것을 여기에 둔다.

alter table public.bk_agent
  add column if not exists scope_regions  text[]  not null default '{}',
  add column if not exists scope_kinds    text[]  not null default '{}',
  add column if not exists scope_excluded text[]  not null default '{}',
  add column if not exists scope_set      boolean not null default false,
  add column if not exists notify_paused  boolean not null default false,
  add column if not exists scope_at       timestamptz;

comment on column public.bk_agent.scope_regions is
  '활동 지역 - 서울은 구, 경기는 시·군. 비어 있으면 아무 조건도 보이지 않는다.';
comment on column public.bk_agent.scope_kinds is
  '취급 유형 - home·shop·office·storage. 빈 배열은 "아무것도 안 받겠다" 는 뜻이다.';
comment on column public.bk_agent.scope_set is
  '한 번이라도 직접 정했는가. 기본값이 들어 있어 "비었는가" 로는 알 수 없다.';
comment on column public.bk_agent.notify_paused is
  '알림 중단. 목록은 그대로 보이고 알림만 멈춘다.';

-- 새 조건이 들어왔을 때 이 지역을 맡은 사람을 찾는다
create index if not exists bk_agent_scope_idx
  on public.bk_agent using gin (scope_regions);
