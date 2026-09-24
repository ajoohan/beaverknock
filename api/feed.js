/* 중개사 화면 — 나에게 맞는 손님 조건.
 *
 * 승인된 파트너만 본다. 승인 전에는 아무것도 보이지 않는다 -
 * 손님 조건은 이름과 연락처가 붙은 자료이고, 아무나 열어볼 것이 아니다.
 *
 * 연락처는 여기서 절대 내보내지 않는다. 손님이 '연결' 을 누르기 전까지
 * 중개사는 지역·조건·메모까지만 본다.
 */

import { userFrom, sbHeaders, sbUrl } from './_auth.js';
import { dbWhy } from './_dberr.js';

const KIND_KO = { home: '주거', shop: '상가', office: '오피스', storage: '창고' };

/* '미사역 상권' 과 '미사역' 을 같은 곳으로 본다 */
const norm = x => String(x || '').replace(/\s*(상권|전체|어디든)\s*/g, '').trim();

/* ── 소유자가 볼 수 있는 수요 ──
   소유자와 시행사는 목록을 훑지 못한다. 올려둔 물건에 실제로 맞는 수요만 본다.

   중개사는 여러 물건을 다루니 목록을 보는 것이 일이지만, 소유자는 가진 물건이
   정해져 있다. 목록을 열어주면 맞지 않는 곳까지 일단 다 뿌리게 되고 -
   그러면 손님의 다섯 자리가 홍보로 차서, 정작 맞는 곳이 못 들어온다.
   이 서비스가 파는 것이 그 다섯 자리라서, 여기서 새면 파는 물건이 상한다.

   화면에서 감추는 것으로는 부족하다. 목록도 제안도 서버에서 막는다.

   맞는다는 것은 넷이 모두 맞는다는 뜻이다 - 지역 · 유형 · 거래방식 · 예산.
   손님이 적은 예산은 상한이므로, 물건 값이 그 안에 들어와야 한다. */
const normDeal = x => String(x || '').trim();

/* 손님이 고른 곳이 어느 시·군에 속하는지.
   지금 동 단위로 고를 수 있는 곳은 하남시뿐이라 표가 짧다. 서울은 구,
   경기는 시가 이미 시군구 단위여서 따로 옮길 것이 없다. */
const HANAM = ['미사1동','미사2동','미사3동','신장1동','신장2동','신장동','덕풍1동','덕풍2동','덕풍3동',
  '덕풍동','천현동','감일동','감북동','초이동','위례동','춘궁동','미사역','하남시청역','스타필드 인근'];
const DONG_TO_SI = {};
HANAM.forEach(d => { DONG_TO_SI[d] = '하남시'; });

/* '하남 어디든' · '서울 전체' 처럼 넓게 적은 것 */
const WIDE = /(어디든|전체)/;
const siOf = n => DONG_TO_SI[n] || (/(시|군|구)$/.test(n) ? n : (/^하남/.test(n) ? '하남시' : ''));

/* 두 지역이 같은 곳을 가리키는가.

   넓게 잡은 쪽이 있으면 시·군으로 견준다 - '하남시' 를 맡은 중개사에게
   '미사1동' 손님이 가야 하고, '하남 어디든' 손님에게 미사1동 물건이 가야 한다.
   어느 쪽이 넓은지는 미리 정해져 있지 않다. 활동 지역은 시·군이 넓은 쪽이고,
   손님이 '어디든' 을 고르면 손님 쪽이 넓은 쪽이다 - 그래서 양쪽 다 본다.

   둘 다 콕 집었으면 이름이 같아야 한다. '미사1동' 을 적은 손님에게 덕풍2동
   물건이 가면 안 된다 - 같은 하남시라도 그 손님이 고른 곳이 아니다. */
const isWide = raw => {
  const n = norm(raw);
  return WIDE.test(String(raw)) || /(시|군|구)$/.test(n);
};

function regionHit(mine, theirs) {
  const one = norm(mine);
  if (!one) return false;
  const myWide = isWide(mine), mySi = siOf(one);
  return (theirs || []).some(x => {
    const d = norm(x);
    if (!d) return false;
    if (d === one || d.includes(one) || one.includes(d)) return true;
    if (!myWide && !isWide(x)) return false;
    const si = siOf(d);
    return !!mySi && !!si && mySi === si;
  });
}

/* 손님이 안 적은 값으로는 막지 않는다 - 안 적은 것은 '아무거나' 라는 뜻이지
   '0원까지' 라는 뜻이 아니다. 없는 조건을 만들어 막으면 정상 거래가 사라진다. */
const withinCap = (mine, cap) => !(cap > 0) || !(mine > 0) || mine <= cap;

export function listingFits(L, d) {
  if (!L || !d) return false;
  if (L.kind !== d.kind) return false;
  if (!regionHit(L.dong, d.dongs)) return false;
  /* 거래방식은 주거에만 있다. 상가·오피스·창고는 이 칸이 비어 있다. */
  const a = normDeal(L.deal), b = normDeal(d.deal);
  if (a && b && a !== b) return false;
  if (!withinCap(L.dep, d.dep)) return false;
  if (!withinCap(L.rent, d.rent)) return false;
  return true;
}

/* 어느 물건 하나라도 맞으면 보여준다 - 그 물건으로 제안하면 되기 때문이다 */
export const anyFits = (list, d) => (list || []).some(L => listingFits(L, d));

/* 목록을 훑을 수 있는 사람인가. 중개사만이다. */
export const canBrowse = agent => (agent && agent.role) === 'agent';

export async function myListings(agentId) {
  const q = new URLSearchParams({
    select: 'id,kind,dong,deal,dep,rent,name,status',
    agent_id: 'eq.' + agentId, status: 'eq.active', limit: '200',
  });
  const r = await fetch(sbUrl('bk_listing', q.toString()), { headers: sbHeaders() });
  if (!r.ok) {
    const t = await r.text();
    /* 표가 아직 없으면 물건이 없는 것과 같다 - 없는 것으로 보고 막는다 */
    if (/does not exist|PGRST205/i.test(t)) return [];
    return null;
  }
  return await r.json();
}

/* 파트너 화면이 '내 정보' 로 보여줄 것. 자기 것이라 가리지 않는다 -
   가리면 잘못 적은 번호를 본인이 찾아낼 방법이 없다. */
export const meAgent = a => a && {
  id: a.id, office: a.office || null, role: a.role || null,
  owner_type: a.owner_type || null, status: a.status || null,
  name: a.name || null, phone: a.phone || null,
  reg_no: a.reg_no || null, addr: a.addr || null,
  created_at: a.created_at || null,
};

export async function approvedAgent(user) {
  const q = new URLSearchParams({
    select: 'id,role,status,office,name,phone,reg_no,addr,owner_type,created_at,'
          + 'scope_regions,scope_kinds,scope_excluded,scope_set,notify_paused',
    user_id: 'eq.' + user.id, limit: '1',
  });
  const r = await fetch(sbUrl('bk_agent', q.toString()), { headers: sbHeaders() });
  if (!r.ok) return { error: await r.text() };
  const rows = await r.json();
  if (!rows.length) return { none: true };
  const a = rows[0];
  return a.status === 'approved' ? { agent: a } : { pending: a.status || 'new', agent: a };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });
  if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) {
    return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
  }

  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' });

  const chk = await approvedAgent(user);
  if (chk.error) {
    if (/user_id/.test(chk.error)) return res.status(503).json({ error: '아직 준비 중입니다 (0009 마이그레이션 필요)' });
    return res.status(502).json({ error: '자격을 확인하지 못했습니다' });
  }
  /* 가입은 했지만 자격(공인중개사 등록번호 등)을 아직 확인하지 않은 분도 목록은 본다.
     다만 **요약만** 본다 - 아래 maskDemand 가 가린다. 전에는 403 으로 아예 막아서,
     가입해도 무엇이 있는지 볼 수 없으니 인증할 이유가 생기지 않았다. */
  if (chk.none)    return res.status(403).json({ error: '파트너 가입 후 이용하실 수 있습니다', need: 'join' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  /* 내가 보낸 제안 목록. 지금까지 이 목록은 그 브라우저 메모리에만 있어서
     새로고침하면 자기가 보낸 것이 사라졌다.
     함수 상한(12개) 때문에 수요 목록과 한 지붕 아래 둔다. */
  if (b.what === 'mine') return readMine(req, res, chk.agent);

  /* 올려둔 물건. 지금까지 이 목록도 그 브라우저에만 있어서 창을 닫으면
     사라졌다. 함수 상한(12개) 때문에 여기 함께 둔다. */
  if (b.what === 'listings')    return readListings(req, res, chk.agent);
  if (b.what === 'listing-add') return addListing(req, res, chk.agent, user, b);
  if (b.what === 'listing-del') return delListing(req, res, chk.agent, b);

  /* 활동 조건을 저장한다.
     지금까지 이 화면은 "저장됐습니다" 라고 말하고 아무 데도 넣지 않았다.
     브라우저 메모리에만 있어서 새로고침하면 하남시로 돌아갔고, 서울에서
     활동하겠다고 정해둔 분이 다음 날 들어오면 하남 손님만 보였다. */
  if (b.what === 'scope-save') return saveScope(res, chk.agent, b);
  if (b.what === 'scope')      return res.status(200).json({ ok: true, scope: scopeOf(chk.agent) });
  /* 소유자·시행사는 목록을 훑지 못한다. 올려둔 물건에 맞는 것만 본다.
     화면에서 감추는 것으로는 부족해 여기서 막는다 - 화면은 고쳐 쓸 수 있다. */
  if (!canBrowse(chk.agent)) return readFitting(res, chk.agent);

  /* 거르는 값은 저장된 것을 쓴다. 브라우저가 보내는 것을 그대로 믿으면,
     새 조건이 들어왔을 때 '이것이 누구에게 맞는가' 를 서버가 알 수 없다 -
     알림을 보낼 방법이 아예 없어진다. */
  const sc = scopeOf(chk.agent);
  /* 빈 배열은 '가리지 않는다' 가 아니라 '아무것도 안 받겠다' 는 뜻이다.
     지역은 그렇게 막아뒀는데 유형만 반대로 열려 있었다. */
  const kinds = sc.kinds.filter(k => KIND_KO[k]);
  if (!kinds.length) {
    return res.status(200).json({ ok: true, agent: meAgent(chk.agent),
      scope: sc, hidden: { region: 0, slot: 0, kind: 1 }, at: new Date().toISOString(), rows: [] });
  }
  const regions = sc.set ? sc.regions.map(norm).filter(Boolean) : [];

  try {
    const q = new URLSearchParams({
      select: 'id,created_at,kind,dongs,deal,dep,rent,biz,area_min,area_max,htype,rooms,musts,must_free,'
            + 'floor_avoid,household,elevator,loan_plan,open_when,shop_floor_free,facilities_free,'
            + 'area_bands,bath_want,floor_bands,dir_want,age_band,'
            + 'key_ok,sign_need,park_need,shop_note,spec,memo,slots,slots_left',
      order: 'created_at.desc', limit: '200',
    });
    q.set('kind', `in.(${kinds.join(',')})`);
    const r = await getDemands(q);
    if (!r.ok) return res.status(502).json({ error: '조건을 불러오지 못했습니다' });
    let rows = await r.json();

    /* 지역은 배열이라 DB 에서 거르기 번거롭다 - 여기서 맞춰본다.
       고른 지역이 없으면 아무것도 보여주지 않는다. 활동 지역을 정하는 것이 먼저다. */
    /* 알림과 같은 규칙으로 거른다. 여기만 따로 두면 목록에는 보이는데 알림은
       안 오는 일이 생기고, 그때는 어느 쪽이 맞는지 알 수 없게 된다.
       예전에는 이름이 겹치는지만 봐서, 활동 지역을 '하남시' 로 둔 분에게
       미사1동 손님이 한 건도 보이지 않았다 - 기본값이 하남시였다. */
    const hidden = { region: 0, slot: 0 };
    rows = rows.filter(d => {
      if (!(d.slots_left > 0)) { hidden.slot++; return false; }
      if (!regions.length) { hidden.region++; return false; }
      const hit = regions.some(rg => regionHit(rg, d.dongs));
      if (!hit) hidden.region++;
      return hit;
    });

    /* 내가 이미 보낸 조건은 표시해 준다 */
    let mine = new Set();
    if (rows.length) {
      /* 조건 id 를 전부 URL 에 싣지 않는다 - 200개면 7KB 가 넘어 414 로 잘린다.
         내가 보낸 것만 받아와서 여기서 맞춰본다. */
      const pq = new URLSearchParams({
        select: 'demand_id', agent_id: 'eq.' + chk.agent.id,
        order: 'created_at.desc', limit: '1000',
      });
      const pr = await fetch(sbUrl('bk_proposal', pq.toString()), { headers: sbHeaders() });
      if (pr.ok) for (const p of await pr.json()) mine.add(p.demand_id);
    }

    return res.status(200).json({
      ok: true,
      agent: meAgent(chk.agent),
      scope: sc,
      hidden,
      at: new Date().toISOString(),
      locked: !!chk.pending,
      need: chk.pending ? 'verify' : '',
      rows: rows.map(d => {
        const base = chk.pending ? maskDemand(d) : d;
        return { ...base, kind_ko: KIND_KO[d.kind] || '주거', mine: mine.has(d.id) };
      }),
    });
  } catch (e) {
    console.error('[feed]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* 새 칸을 select 에 적었는데 0022 가 아직 안 돌았으면 목록이 통째로 502 가 된다 -
   물건 저장과 달리 조회는 조용히 물러설 자리가 없다. 한 번 더, 새 칸만 빼고 묻는다.
   이때는 손님이 건 밴드 조건이 안 실려 오므로 중개사 화면에서 그 줄만 비어 보인다. */
const BAND_COLS = 'area_bands,bath_want,floor_bands,dir_want,age_band,';
async function getDemands(q) {
  let r = await fetch(sbUrl('bk_demand', q.toString()), { headers: sbHeaders() });
  if (r.ok) return r;
  const t = await r.clone().text().catch(() => '');
  if (!/does not exist|PGRST204|42703/i.test(t)) return r;
  if (!/area_bands|bath_want|floor_bands|dir_want|age_band/.test(t)) return r;
  const q2 = new URLSearchParams(q);
  q2.set('select', String(q.get('select') || '').replace(BAND_COLS, ''));
  return fetch(sbUrl('bk_demand', q2.toString()), { headers: sbHeaders() });
}

/* ── 자격을 확인하기 전에 보이는 것 ──
   조건 전문에는 손님이 적은 사정과 메모가 들어 있어서 자격 없이 볼 것이 아니다.
   그렇다고 빈 화면만 보여주면 '여기 손님이 있다' 는 것조차 알 수 없어 인증할
   이유가 안 생긴다 - 있다는 것까지만 보여준다.
   ※ 가리는 일은 반드시 서버가 한다. 화면에서 감추면 감춘 것이 아니다. */
const SUMMARY_COLS = ['id','created_at','kind','dongs','deal','dep','rent',
                      'htype','rooms','slots_left','open_when','area_bands'];
function maskDemand(d) {
  const o = { locked: true };
  for (const k of SUMMARY_COLS) if (d[k] !== undefined) o[k] = d[k];
  return o;
}

/* 이 조건이 이 활동 조건에 드는가.
   목록을 거를 때 쓰는 규칙과 같은 것을 쓴다 - 목록에는 보이는데 알림은 안 오거나
   그 반대이면, 어느 쪽이 맞는지 알 수 없게 된다. */
export function scopeHits(sc, d) {
  if (!sc || !d) return false;
  if (!sc.set || !sc.regions.length) return false;      /* 정하기 전에는 아무것도 안 간다 */
  if (!sc.kinds.includes(d.kind)) return false;
  return sc.regions.some(rg => regionHit(rg, d.dongs));
}

/* ── 활동 조건 ──
   0017 전이면 칸이 없다. 그때는 예전처럼 기본값으로 돈다 - 마이그레이션을
   안 돌렸다고 목록이 안 보이면, 고장 난 것으로 읽힌다. */
const SCOPE_KINDS = ['home', 'shop', 'office', 'storage'];

export function scopeOf(a) {
  const has = a && a.scope_kinds !== undefined;
  return {
    regions: (a && a.scope_regions) || [],
    kinds:   has ? ((a.scope_kinds || []).filter(k => SCOPE_KINDS.includes(k))) : SCOPE_KINDS,
    excluded: (a && a.scope_excluded) || [],
    set:     has ? !!a.scope_set : false,
    paused:  !!(a && a.notify_paused),
    stored:  !!has,
  };
}

const cleanList = (v, max) => (Array.isArray(v) ? v : [])
  .map(x => String(x || '').trim()).filter(Boolean).slice(0, max);

async function saveScope(res, agent, b) {
  const patch = {
    scope_regions:  cleanList(b.regions, 60),
    scope_kinds:    cleanList(b.kinds, 8).filter(k => SCOPE_KINDS.includes(k)),
    scope_excluded: cleanList(b.excluded, 20),
    scope_set:      true,
    notify_paused:  b.paused === true,
    scope_at:       new Date().toISOString(),
  };
  try {
    const r = await fetch(sbUrl('bk_agent', 'id=eq.' + agent.id), {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/scope_regions|scope_kinds|scope_set|notify_paused|scope_at|PGRST204/i.test(t)) {
        return res.status(503).json({ error: '아직 준비 중입니다 (0017 마이그레이션 필요)', need: 'sql' });
      }
      return res.status(500).json({ error: '활동 조건을 저장하지 못했습니다' });
    }
    /* 몇 건이 실제로 바뀌었는지 본다 - minimal 로 두면 한 건도 안 바뀌어도 200 이 온다 */
    const got = (await r.json().catch(() => []))[0];
    if (!got) return res.status(404).json({ error: '저장할 곳을 찾지 못했습니다' });
    return res.status(200).json({ ok: true, scope: scopeOf(got) });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 소유자: 내 물건에 맞는 수요만 ──
   활동 지역·유형을 따로 설정하지 않는다. 올려둔 물건이 곧 조건이다. */
async function readFitting(res, agent) {
  try {
    const list = await myListings(agent.id);
    if (list === null) return res.status(502).json({ error: '올려두신 물건을 확인하지 못했습니다' });
    if (!list.length) {
      return res.status(200).json({
        ok: true, agent: meAgent(agent),
        scope: scopeOf(agent),
        byListing: true, listings: 0, hidden: { region: 0, slot: 0, fit: 0 },
        at: new Date().toISOString(), rows: [],
        note: '물건을 올리시면 그 물건에 맞는 손님만 보여드립니다.',
      });
    }

    const kinds = [...new Set(list.map(L => L.kind).filter(k => KIND_KO[k]))];
    /* 빈 배열을 그대로 넣으면 kind=in.() 이 되어 PostgREST 가 문법 오류를 낸다.
       물건은 있는데 유형을 하나도 못 읽는 상황이라, 맞는 것이 없다고 답하는 편이
       '조건을 불러오지 못했습니다' 보다 사실에 가깝다. */
    if (!kinds.length) {
      return res.status(200).json({
        ok: true, agent: meAgent(agent),
        scope: scopeOf(agent),
        byListing: true, listings: list.length, hidden: { region: 0, slot: 0, fit: 0 },
        at: new Date().toISOString(), rows: [],
        note: '올려두신 물건의 유형을 읽지 못했습니다 - 물건을 다시 등록해 주세요.',
      });
    }
    const q = new URLSearchParams({
      select: 'id,created_at,kind,dongs,deal,dep,rent,biz,area_min,area_max,htype,rooms,musts,must_free,'
            + 'floor_avoid,household,elevator,loan_plan,open_when,shop_floor_free,facilities_free,'
            + 'area_bands,bath_want,floor_bands,dir_want,age_band,'
            + 'key_ok,sign_need,park_need,shop_note,spec,memo,slots,slots_left',
      order: 'created_at.desc', limit: '200',
    });
    q.set('kind', `in.(${kinds.join(',')})`);
    const r = await getDemands(q);
    if (!r.ok) return res.status(502).json({ error: '조건을 불러오지 못했습니다' });

    const hidden = { region: 0, slot: 0, fit: 0 };
    const rows = [];
    for (const d of await r.json()) {
      if (!(d.slots_left > 0)) { hidden.slot++; continue; }
      const fit = list.filter(L => listingFits(L, d));
      if (!fit.length) { hidden.fit++; continue; }
      /* 어느 물건으로 제안할 수 있는지 함께 보낸다 - 고르는 수고를 덜어준다 */
      rows.push({ ...d, fitIds: fit.map(L => L.id), fitNames: fit.map(L => L.name) });
    }

    let mine = new Set();
    if (rows.length) {
      const pq = new URLSearchParams({
        select: 'demand_id', agent_id: 'eq.' + agent.id, order: 'created_at.desc', limit: '1000',
      });
      const pr = await fetch(sbUrl('bk_proposal', pq.toString()), { headers: sbHeaders() });
      if (pr.ok) for (const p of await pr.json()) mine.add(p.demand_id);
    }

    return res.status(200).json({
      ok: true, agent: meAgent(agent),
      scope: scopeOf(agent),
      byListing: true, listings: list.length, hidden, at: new Date().toISOString(),
      locked: !!chk.pending,
      need: chk.pending ? 'verify' : '',
      rows: rows.map(d => {
        const base = chk.pending ? maskDemand(d) : d;
        return { ...base, kind_ko: KIND_KO[d.kind] || '주거', mine: mine.has(d.id) };
      }),
    });
  } catch (e) {
    console.error('[feed:fit]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 내가 보낸 제안 ── */
const P_STATUS_KO = {
  sent: '보냄', read: '열람', accepted: '연결', rejected: '관심 없음',
  reported: '신고', withdrawn: '회수',
};

async function readMine(req, res, agent) {
  try {
    const q = new URLSearchParams({
      select: 'id,created_at,status,addr,bname,dep,rent,fee,demand_id,connected_at,'
            + 'report_type,read_at',
      agent_id: 'eq.' + agent.id, order: 'created_at.desc', limit: '200',
    });
    const r = await fetch(sbUrl('bk_proposal', q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|PGRST205/i.test(t)) {
        return res.status(200).json({ ok: true, rows: [], at: new Date().toISOString() });
      }
      return res.status(502).json({ error: '보낸 제안을 불러오지 못했습니다' });
    }
    const rows = await r.json();
    if (!rows.length) return res.status(200).json({ ok: true, rows: [], at: new Date().toISOString() });

    /* 어느 조건에 보낸 것인지 붙여준다.
       손님 이름과 연락처는 '연결' 된 건에만 싣는다 - 손님이 연결을 누른 그
       순간에만 오간다는 약속이 여기서도 지켜져야 한다. */
    const dIds = [...new Set(rows.map(x => x.demand_id).filter(Boolean))];
    const dm = {};
    if (dIds.length) {
      const dr = await fetch(sbUrl('bk_demand',
        `select=id,dongs,kind,deal,dep,rent,name,phone&id=in.(${dIds.join(',')})`), { headers: sbHeaders() });
      if (dr.ok) for (const d of await dr.json()) dm[d.id] = d;
    }

    return res.status(200).json({
      ok: true, at: new Date().toISOString(),
      rows: rows.map(x => {
        const d = dm[x.demand_id] || {};
        const connected = x.status === 'accepted';
        return {
          id: x.id, status: x.status, status_ko: P_STATUS_KO[x.status] || x.status,
          created_at: x.created_at, connected_at: x.connected_at || null,
          bname: x.bname, addr: x.addr, dep: x.dep, rent: x.rent, fee: x.fee,
          dongs: (d.dongs || []).join(' · '),
          kind: d.kind || null, deal: d.deal || null,
          want: d.dep != null ? { dep: d.dep, rent: d.rent } : null,
          report_type: x.status === 'reported' ? (x.report_type || null) : null,
          cust:   connected ? (d.name || null)  : null,
          cphone: connected ? (d.phone || null) : null,
        };
      }),
    });
  } catch (e) {
    console.error('[feed:mine]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 올려둔 물건 ── */
const KINDS = ['home', 'shop', 'office', 'storage'];
const LUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const txt = (v, max = 200) => { const x = String(v ?? '').trim(); return x ? x.slice(0, max) : null; };
const int0 = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num0 = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const arr = (v, max = 20) => Array.isArray(v)
  ? v.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, max) : null;

/* 표가 아직 없을 때는 빈 목록으로 돌려준다 - 화면이 예시로 버틴다 */
const noTable = t => /does not exist|PGRST205|bk_listing/i.test(t);

async function readListings(req, res, agent) {
  try {
    const q = new URLSearchParams({
      select: '*', agent_id: 'eq.' + agent.id, status: 'neq.closed',
      order: 'created_at.desc', limit: '200',
    });
    const r = await fetch(sbUrl('bk_listing', q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(200).json({ ok: true, rows: [], note: '0015 마이그레이션 필요' });
      return res.status(502).json({ error: '물건을 불러오지 못했습니다' });
    }
    return res.status(200).json({ ok: true, rows: await r.json(), at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

async function addListing(req, res, agent, user, b) {
  const L = b.listing || {};
  const kind = KINDS.includes(L.kind) ? L.kind : null;
  const name = txt(L.name, 80);
  if (!kind) return res.status(400).json({ error: '어떤 물건인지 알 수 없습니다' });
  if (!name) return res.status(400).json({ error: '물건 이름을 적어주세요' });

  const row = {
    agent_id: agent.id, agent_user: user.id,
    /* biz(업종)·fac(설비)는 싣지 않는다. 물건 등록 화면에서 업종·설비 칩을
       걷어낸 뒤로 화면이 늘 빈 값을 보냈고, 표에는 늘 빈 칸만 쌓였다.
       0027 에서 칸 자체를 지웠다 - 여기서 보내면 등록이 통째로 막힌다. */
    kind, name, dong: txt(L.dong, 60), deal: txt(L.deal, 20),
    dep: int0(L.dep), rent: int0(L.rent), fee: int0(L.fee),
    /* 면적은 ㎡ 로 담는다. py 는 대조와 옛 행이 아직 쓰므로 함께 남긴다 */
    area: num0(L.area), area_sup: num0(L.areaSup), py: num0(L.py),
    /* 화장실은 주거에만 받는다 - 화면이 이미 안 보여주지만, 조건 번호만 알고
       바로 찔러 넣는 길이 있으므로 여기서도 막는다(중개사 회신 2026-09-20). */
    rooms: int0(L.rooms), baths: kind === 'home' ? int0(L.baths) : 0,
    band: txt(L.band, 20), floors: int0(L.floors),
    /* 아파트 동·호 (2026-09-21). 동은 손님에게 보이고 호는 보내지 않는다 -
       특정 세대를 지목하는 값이라 연결 전에 나갈 이유가 없다.
       내보내지 않는 일은 제안을 만드는 api/proposal.js 가 맡는다. */
    bdong: txt(L.bdong, 20), ho: txt(L.ho, 20),
    htype: txt(L.htype, 30),
    floor_no: txt(L.floorNo, 10), duplex: L.duplex === true,
    musts: arr(L.musts),
    musts_free: txt(L.mustsFree, 120), fac_free: txt(L.facFree, 120),
    /* 중개대상물 표시·광고 명시사항 - 방향은 기준까지, 관리비는 산정 기준과 포함 비목까지 */
    dir: txt(L.dir, 10), dir_base: txt(L.dirBase, 20),
    fee_basis: txt(L.feeBasis, 20), fee_type: txt(L.feeType, 40), fee_items: txt(L.feeItems, 200),
    note: txt(L.note, 1000),
    /* 손님의 연식 조건(age_band)을 판단하려면 이 값이 물건에 있어야 한다.
       여태 칸도 없고 묻지도 않아서 그 조건은 한 번도 판단된 적이 없다(0026). */
    approved: txt(L.approved, 40),
    move_in: txt(L.moveIn, 40), photos: int0(L.photos) || 0,
  };

  try {
    const put = body => fetch(sbUrl('bk_listing'), {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    let r = await put(row);
    let dropped = null;          /* 물러섰으면 무엇을 빼고 넣었는지 적어둔다 */
    /* 코드가 먼저 올라가고 마이그레이션이 아직 안 돌았을 수 있다. 그때 새 칸 때문에
       등록 자체가 막히면 안 된다 - 새 칸만 빼고 한 번 더 넣는다. 면적이 평으로만
       남지만, 물건을 못 올리는 것보다는 낫다.
       ⚠ 다만 **조용히 물러서지는 않는다.** 예전에는 그냥 성공이라고 답해서,
       반쪽만 저장됐는데도 등록한 사람은 다 된 줄 알았다 - 그러면 무엇이 안 들어갔는지
       아무도 모른 채로 넘어간다. 무엇을 뺐는지 함께 돌려준다. */
    if (!r.ok) {
      const t0 = await r.text();
      /* '그 칸이 없다' 는 두 가지 말로 온다.
           PGRST204 : Could not find the 'area' column of ... in the schema cache
           42703    : column "area" of relation ... does not exist
         전에는 뒤의 것과 코드 이름만 보고 있었다 - 앞의 형태로 오면 못 알아채고
         등록 자체를 실패로 돌려보냈다. demand.js 는 둘 다 보고 있었는데
         여기만 빠져 있었다. */
      const noColumn = /does not exist|PGRST204/i.test(t0)
                    || /Could not find the '[a-z_]+' column/i.test(t0);
      if (noColumn
          && /area|duplex|floor_no|musts_free|fac_free|dir|fee_basis|fee_type|fee_items|note|bdong|ho|htype|approved/.test(t0)) {
        const { area, area_sup, floor_no, duplex, musts_free, fac_free,
                dir, dir_base, fee_basis, fee_type, fee_items, note,
                bdong, ho, htype, approved, ...old } = row;
        dropped = ['면적', '정확한 층', '복층', '갖춰진 조건', '방향', '관리비 기준',
                   '매물 특징', '동·호', '주택 유형', '사용승인일'];
        console.error('[feed:listing-add] 새 칸을 빼고 저장했다 - 마이그레이션 확인 필요',
                      t0.slice(0, 160));
        r = await put(old);
      } else {
        if (noTable(t0)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
        /* 왜 거절당했는지 코드로 가려 사람 말로 돌려준다 - 중개사님이 화면만 보고
           무엇을 고쳐야 할지 알 수 있어야 한다. 칸 이름이 든 원문은 로그에만 남긴다. */
        const w0 = dbWhy(t0);
        console.error('[feed:listing-add]', r.status, w0.code || '-', t0.slice(0, 200));
        return res.status(502).json({ error: w0.msg || '물건을 저장하지 못했습니다', code: w0.code });
      }
    }
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
      const w = dbWhy(t);
      console.error('[feed:listing-add]', r.status, w.code || '-', t.slice(0, 200));
      return res.status(502).json({ error: w.msg || '물건을 저장하지 못했습니다', code: w.code });
    }
    return res.status(201).json({
      ok: true, row: (await r.json())[0] || null,
      /* 화면이 이것을 보고 '다 저장되지 않았다' 고 말한다 */
      degraded: dropped ? { dropped } : null,
    });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

async function delListing(req, res, agent, b) {
  const id = String(b.id || '');
  if (!LUUID.test(id)) return res.status(400).json({ error: '어느 물건인지 알 수 없습니다' });
  try {
    /* 내 물건만 내린다. 지우지 않고 닫는다 - 이미 보낸 제안에서 참조가 남는다. */
    const r = await fetch(sbUrl('bk_listing', `id=eq.${id}&agent_id=eq.${agent.id}`), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'closed' }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
      return res.status(502).json({ error: '물건을 내리지 못했습니다' });
    }
    if (!(await r.json().catch(() => [])).length) {
      return res.status(404).json({ error: '내 물건이 아니거나 이미 내려간 물건입니다' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}
