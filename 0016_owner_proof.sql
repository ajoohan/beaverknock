-- 소유자는 개인만이 아니다.
--
-- 지금까지 소유자 가입은 '의뢰인과 소유자의 관계' 한 줄만 받았다. 법인이
-- 소유한 건물, 신탁등기가 되어 형식상 소유자가 신탁사인 건물은 그 한 줄로는
-- 누가 올릴 자격이 있는지 알 수 없다.
--
-- 신탁 건은 특히 그렇다. 등기부상 소유자는 신탁사지만 실제로 물건을 놓고
-- 움직이는 사람은 위탁자(시행사)다. 형식상 소유자만 받으면 정작 올려야 할
-- 사람이 못 올린다. 그래서 위탁자로도 들어올 수 있게 두고, 대신 어느
-- 신탁사에 맡긴 것인지를 함께 받는다 - 등기부나 신탁원부로 확인할 수 있게.
--
-- 확인 자체는 사람이 한다. 등기부·신탁원부는 공공데이터가 없고 인터넷등기소는
-- API 가 아니라 건당 유료 열람이라, 자동으로 볼 방법이 지금은 없다.
-- 번호를 받아 두고 운영자가 보고 승인한다.

alter table public.bk_agent
  add column if not exists owner_type text
    check (owner_type is null or owner_type in ('individual','corp','trustor')),
  add column if not exists corp_name  text,   -- 법인명 (법인·위탁자)
  add column if not exists corp_no    text,   -- 법인등록번호 13자리
  add column if not exists trust_co   text;   -- 신탁사명 (위탁자일 때)

comment on column public.bk_agent.owner_type is
  'individual 개인 · corp 법인 · trustor 신탁 위탁자(시행사). role=owner 일 때만 쓴다.';
comment on column public.bk_agent.trust_co is
  '신탁등기된 물건의 수탁자(신탁사). 등기부·신탁원부로 위탁자임을 확인할 때 쓴다.';

-- 시행사(developer)는 포지션에서 뺐다. 시행사도 소유자로 들어와
-- owner_type='trustor' 로 표시한다 - 실제로 하는 일이 그것이기 때문이다.
-- 기존 행은 건드리지 않는다. 지우면 그 사람이 보낸 제안까지 딸려 사라진다.
comment on column public.bk_agent.role is
  'agent 공인중개사 · owner 소유자. developer 는 더 받지 않는다(기존 행만 남아 있다).';
