/* 손님 화면 — 내가 건 조건과 거기에 온 제안.
 *
 * 지금까지 이 화면은 브라우저 메모리의 시드였다. 조건을 내면 DB 에는 들어갔지만
 * 본인은 다시 볼 수 없었고, 새로고침하면 방금 낸 조건도 사라졌다.
 *
 * 누가 보냈는지는 Supabase 토큰으로만 정한다 - 브라우저가 적어 보내는 id 는 안 믿는다.
 */

import { userFrom, sbHeaders, sbUrl } from './_auth.js';
import { approvedAgent, meAgent } from './feed.js';
import { logOps } from './_opslog.js';

const KIND_KO = { home: '주거', shop: '상가', office: '오피스', storage: '창고' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET 또는 POST 만 받습니다' });
  }
  if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) {
    return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
  }

  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' });

  /* 가입 동의. 함수 상한(12개)이 꽉 차서 새 주소를 낼 수 없다 - 여기에 붙인다.
     손님·파트너 공통이라 '내 것' 을 다루는 이 자리가 맞다. */
  const body = req.method === 'POST' ? (req.body || {}) : {};
  if (body.what === 'consent') return consent(req, res, user, body);

  /* 내가 파트너인가.
     ── 왜 여기에 있나 ──
     지금까지 이 물음에 답하는 자리는 `/api/feed` 뿐이었다. 그런데 feed 는
     **파트너 화면에서만** 불린다. 그래서 승인된 중개사가 첫 화면으로 들어오면
     화면은 그분이 파트너인 줄을 모른다 - 상단바에 파트너로 가는 문이 없고,
     '이미 신청한 계정은 가입 화면을 다시 걸지 않는다' 는 라우터의 가드도
     `S.agent` 가 비어 있어서 한 번도 돌지 못했다(2026-09-28 이훈희 님 제보).
     로그인 직후 한 번 물어볼 자리가 필요한데, 함수 상한(12개)이 꽉 찼다 -
     동의와 같은 이유로 '내 것' 을 다루는 이 자리에 붙인다.
     ⚠ 못 물어봤다고 막지 않는다. 파트너인지 모르면 손님 화면을 보여주면 되고,
     진짜 문턱은 어차피 서버가 각 화면에서 다시 본다. */
  if (body.what === 'agent') return agentAnswer(res, user);

  /* 동의 + 파트너를 한 번에 (2026-10-12).
     로그인할 때마다 화면이 이 둘을 따로 물어서 함수 호출 두 번 · 토큰 확인(userFrom)
     두 번이 들었다. 콜드스타트 둘이 boot 의 1.2초와 겹치면 늦게 온 쪽이 화면을 다시
     그렸다. 각 답은 따로 부를 때와 **같은 모양**으로 담는다 - 화면은 그대로 읽는다. */
  if (body.what === 'me') {
    const 담기 = () => { const o = { status: 200, body: null };
      return { o, res: { setHeader() {}, status(c) { o.status = c; return this; }, json(j) { o.body = j; return this; } } }; };
    const c = 담기(), a = 담기();
    await Promise.all([
      consent(req, c.res, user, {}).catch(() => { c.o.status = 502; c.o.body = { error: '확인하지 못했습니다' }; }),
      agentAnswer(a.res, user),
    ]);
    return res.status(200).json({ ok: true, consent: c.o, agent: a.o });
  }

  /* 걸어 둔 조건의 상세를 고친다 (2026-10-15).
     전에는 화면의 '저장했습니다' 가 메모리만 바꾸고 서버에는 아무것도 보내지 않았다 -
     덧붙인 상세는 중개사에게 한 번도 가지 않았다. 함수 상한(12개)이 꽉 차 여기에 붙인다. */
  if (body.what === 'demand-edit') return demandEdit(req, res, user, body);

  try {
    const dq = new URLSearchParams({
      select: '*', user_id: 'eq.' + user.id, order: 'created_at.desc', limit: '50',
    });
    const dr = await fetch(sbUrl('bk_demand', dq.toString()), { headers: sbHeaders() });
    if (!dr.ok) {
      const t = await dr.text();
      /* user_id 칸이 아직 없으면 그렇다고 알린다 - 빈 목록으로 속이지 않는다 */
      if (/user_id/.test(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0009 마이그레이션 필요)' });
      return res.status(502).json({ error: '조건을 불러오지 못했습니다' });
    }
    const demands = await dr.json();
    if (!demands.length) return res.status(200).json({ ok: true, demands: [], proposals: [] });

    const ids = demands.map(d => d.id);
    const pq = new URLSearchParams({
      select: '*', demand_id: `in.(${ids.join(',')})`, order: 'created_at.desc', limit: '200',
    });
    const pr = await fetch(sbUrl('bk_proposal', pq.toString()), { headers: sbHeaders() });
    const proposals = pr.ok ? await pr.json() : [];

    /* 누가 보냈는지는 '어떤 자격인지' 까지만 알린다. 사무소 이름도 보내지 않는다 -
       손님이 '연결' 을 누르기 전까지는 서로를 특정할 수 있는 것이 오가지 않는다.
       사무소를 밝히는 것은 손님이 연결을 고른 그 순간이다. */
    const ROLE_KO = { agent: '공인중개사', owner: '소유자', developer: '시행사' };
    const agentIds = [...new Set(proposals.map(p => p.agent_id).filter(Boolean))];
    let by = {}, contact = {};
    if (agentIds.length) {
      const aq = new URLSearchParams({
        select: 'id,role,name,phone,office,reg_no,addr', id: `in.(${agentIds.join(',')})`,
      });
      const ar = await fetch(sbUrl('bk_agent', aq.toString()), { headers: sbHeaders() });
      if (ar.ok) for (const a of await ar.json()) {
        by[a.id] = ROLE_KO[a.role] || '공인중개사';
        /* 연결한 제안에만 붙여 내보낸다 - 아래 map 에서 status 를 보고 고른다.
           여기서 다 만들어 두되, 연결하지 않은 제안에는 절대 싣지 않는다. */
        contact[a.id] = {
          role: ROLE_KO[a.role] || '공인중개사',
          office: a.office || null, name: a.name || null, phone: a.phone || null,
          reg_no: a.reg_no || null, addr: a.addr || null,
        };
      }
    }

    return res.status(200).json({
      ok: true,
      demands: demands.map(d => ({
        id: d.id, kind: d.kind, kind_ko: KIND_KO[d.kind] || '주거',
        dongs: d.dongs || [], deal: d.deal, dep: d.dep, rent: d.rent,
        biz: d.biz, area_min: d.area_min, area_max: d.area_max,
        htype: d.htype || [], rooms: d.rooms, memo: d.memo,
        /* 상세 - '수정' 화면이 지금 값을 채워 보여 주려면 함께 와야 한다 */
        floor_bands: d.floor_bands || [], dir_want: d.dir_want || [], age_band: d.age_band || null,
        household: d.household || null, elevator: d.elevator || null, loan_plan: d.loan_plan || null,
        key_ok: d.key_ok || null, sign_need: d.sign_need || null, park_need: d.park_need ?? null,
        shop_note: d.shop_note || null,
        slots: d.slots, slots_left: d.slots_left,
        created_at: d.created_at,
      })),
      proposals: proposals.map(p => ({
        id: p.id, demand_id: p.demand_id, status: p.status,
        /* 주거면 '공급면적', 상가·오피스·창고면 '계약면적' 이라 부른다.
           그 이름은 조건의 종류에서 갈리므로 여기서 함께 실어 보낸다. */
        kind: (demands.find(d => d.id === p.demand_id) || {}).kind || 'home',
        by: by[p.agent_id] || '공인중개사',
        bname: p.bname, addr_area: String(p.addr || '').split(' ').slice(0, 2).join(' '),
        dep: p.dep, rent: p.rent, fee: p.fee,
        fee_type: p.fee_type, fee_items: p.fee_items, fee_basis: p.fee_basis,
        note: p.note,
        area_sup: p.area_sup, area: p.area, rooms: p.rooms, baths: p.baths,
        /* 동까지만. 호는 제안 표에 아예 없다(0025) - 실을 것이 없다. */
        bdong: p.bdong, htype: p.htype,
        dir: p.dir, dir_base: p.dir_base,
        /* 'B1' 처럼 숫자가 아닌 표기에 '층' 을 붙이면 'B1층' 이 된다 */
        floor: p.floor_mode === '비공개' ? '비공개'
             : (p.floor_no ? (/^[0-9]+$/.test(p.floor_no) ? p.floor_no + '층' : p.floor_no) : p.band || ''),
        duplex: p.duplex === true,
        move_in: p.move_in, park: p.park, approved: p.approved, photos: p.photos,
        msg: p.msg, created_at: p.created_at,
        /* 연결한 뒤에야 상대가 누구인지 나간다. 새로고침해도 번호가 남아 있어야
           손님이 나중에 다시 걸 수 있다. */
        contact: p.status === 'accepted' ? (contact[p.agent_id] || null) : null,
      })),
    });
  } catch (e) {
    console.error('[my]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 가입 동의 ──
   읽기: {what:'consent'} · 쓰기: {what:'consent', set:{terms, privacy, marketing}}
   항목마다 '언제' 를 담는다. true/false 로 두면 언제 동의했는지가 사라지고,
   철회한 것인지 처음부터 안 한 것인지도 구분되지 않는다. */
async function agentAnswer(res, user) {
  try {
    const chk = await approvedAgent(user);
    if (chk.error) return res.status(200).json({ ok: true, agent: null, note: 'lookup-failed' });
    return res.status(200).json({ ok: true, agent: meAgent(chk.agent) || null });
  } catch (e) {
    return res.status(200).json({ ok: true, agent: null, note: 'lookup-failed' });
  }
}

async function consent(req, res, user, body) {
  const url = sbUrl('bk_consent', new URLSearchParams({
    select: '*', user_id: 'eq.' + user.id, limit: '1' }).toString());

  /* '행이 없다' 와 '못 읽었다' 는 다르다. 둘을 같은 null 로 돌려주면
     아직 동의 안 한 분에게 502 를 주게 된다 - 가입 첫날이 바로 그 경우다.
     겉을 씌워 셋을 구분한다: 표가 없다 · 못 읽었다 · 읽었다(행은 있거나 없다). */
  const read = async () => {
    const r = await fetch(url, { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (/does not exist|PGRST205/i.test(t)) return { missing: true };
      return { err: true };
    }
    return { row: (await r.json())[0] || null };
  };

  if (!body.set) {
    const got = await read();
    if (got.missing) {
      /* 0023 이 아직 안 돌았다. 아무도 못 지나가게 막는 것보다 통과시키는 편이 낫다 -
         동의 화면에 갇혀 서비스를 못 쓰는 것이 더 나쁘다. 대신 그렇다고 답한다. */
      return res.status(200).json({ ok: true, ready: false, consent: null });
    }
    if (got.err) return res.status(502).json({ error: '확인하지 못했습니다' });
    return res.status(200).json({ ok: true, ready: true, consent: got.row });
  }

  const set = body.set || {};
  if (!set.terms || !set.privacy) {
    return res.status(400).json({ error: '필수 항목에 동의해 주세요' });
  }
  const now = new Date().toISOString();

  /* 이미 적힌 시각은 덮지 않는다.
     나중에 **광고 수신만** 바꿔도 terms_at·privacy_at 이 지금으로 밀리면,
     '언제 동의했는가' 에 답할 수 없게 된다 - 그러자고 만든 표다(0023).
     못 읽었으면 지금 시각으로 적는다. 기록을 남기는 편이 안 남기는 것보다 낫다. */
  const before = await read();
  if (before.err) return res.status(502).json({ error: '확인하지 못했습니다' });
  const prev = before.row || {};

  const row = {
    user_id: user.id,
    terms_at:   prev.terms_at   || now,
    privacy_at: prev.privacy_at || now,
    marketing_at: set.marketing ? now : null,
    /* 철회한 시각은 **실제로 철회한 그때**다. 동의한 적이 없으면 처음 거절한 때를
       적고, 그 뒤로 계속 거절이면 그 시각을 그대로 둔다 - 저장할 때마다
       밀어 두면 '언제 거두었나' 가 사라진다. */
    marketing_off_at: set.marketing ? null
      : (prev.marketing_at ? now : (prev.marketing_off_at || now)),
    ua: String(req.headers['user-agent'] || '').slice(0, 200),
    updated_at: now,
  };
  const r = await fetch(sbUrl('bk_consent', ''), {
    method: 'POST',
    headers: { ...sbHeaders(), 'Content-Type': 'application/json',
               Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (/does not exist|PGRST205/i.test(t)) {
      return res.status(503).json({ error: '아직 준비 중입니다 (0023 마이그레이션 필요)' });
    }
    console.error('[my:consent]', r.status, t.slice(0, 160));
    return res.status(502).json({ error: '동의를 저장하지 못했습니다' });
  }
  return res.status(200).json({ ok: true, consent: row });
}

/* ── 걸어 둔 조건 고치기 ── {what:'demand-edit', id, set:{...}}
   고칠 수 있는 것은 '상세 보강' 화면의 칸뿐이다. 지역·예산·유형처럼 중개사가 이미 보고 제안을
   맞춰 온 기준은 여기서 바꾸지 않는다 - 바꾸면 이미 온 제안이 엉뚱한 조건에 걸린 것이 된다.
   누구의 조건인지는 토큰의 사용자로만 정한다. 남의 번호를 보내도 user_id 가 달라 고쳐지지 않는다. */
const EDIT_HOME = ['memo', 'floor_bands', 'dir_want', 'age_band', 'household', 'elevator', 'loan_plan'];
const EDIT_SHOP = ['memo', 'park_need', 'shop_note'];
const EDIT_SHOP_ONLY = ['key_ok', 'sign_need'];           /* 상가에만 있는 칸 */
const EDIT_LIST = ['floor_bands', 'dir_want'];
const EDIT_MAX = { memo: 1000, shop_note: 500, key_ok: 30, sign_need: 30 };
/* 고치기 횟수 제한 - 한 계정이 1분에 EDIT_MAX_PER_MIN 번까지(2026-10-15 리뷰).
   접수에는 빈도 제한이 있는데 고치기에는 없어, 스크립트가 메모를 끝없이 바꿀 수 있었다.
   서버리스라 인스턴스마다 따로 센다 - 막으려는 것은 연타이지 정밀한 할당량이 아니다. */
const EDIT_MAX_PER_MIN = 10;
const editHits = new Map();
const KINDS_OK = ['home', 'shop', 'office', 'storage'];
export async function demandEdit(req, res, user, body) {
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) return res.status(400).json({ error: '어느 조건인지 알 수 없습니다' });
  /* 유형은 화면이 알려 주고, 고칠 때 DB 에서 '그 유형인 내 조건' 으로 함께 거른다 -
     유형을 묻는 조회를 따로 하지 않아도(2026-10-15 리뷰) 다른 유형의 칸이 들어갈 수 없다. */
  const kind = KINDS_OK.includes(body.kind) ? body.kind : null;
  if (!kind) return res.status(400).json({ error: '어떤 조건인지 알 수 없습니다' });
  const set = body.set && typeof body.set === 'object' ? body.set : {};

  const now = Date.now();
  const 최근 = (editHits.get(user.id) || []).filter(t => now - t < 60_000);
  if (최근.length >= EDIT_MAX_PER_MIN) return res.status(429).json({ error: '너무 자주 고치셨습니다 - 잠시 뒤 다시 해 주세요' });
  최근.push(now); editHits.set(user.id, 최근);
  if (editHits.size > 5000) editHits.clear();

  const home = kind === 'home';
  const 칸 = home ? EDIT_HOME : [...EDIT_SHOP, ...(kind === 'shop' ? EDIT_SHOP_ONLY : [])];
  const patch = {};
  for (const k of 칸) {
    if (!(k in set)) continue;
    const v = set[k];
    if (EDIT_LIST.includes(k)) {
      patch[k] = Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, 20).map(x => x.trim().slice(0, 40)) : [];
    } else if (k === 'park_need') {
      const n = parseInt(v, 10);
      patch[k] = Number.isFinite(n) && n >= 0 && n < 1000 ? n : null;
    } else {
      const s = String(v ?? '').trim();
      patch[k] = s ? s.slice(0, EDIT_MAX[k] || 20) : null;
    }
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: '고칠 내용이 없습니다' });
  /* 언제 고쳤는지 - 중개사 화면이 '조건 고침' 을 띄운다(0030). 칸이 아직 없으면 빼고 고친다. */
  const 고친시각 = new Date(now).toISOString();
  try {
    const pq = new URLSearchParams({ id: 'eq.' + id, user_id: 'eq.' + user.id, select: 'id' });
    /* 주거는 예전 행에 유형이 비어 있을 수 있다 - 비어 있어도 주거로 본다 */
    if (home) pq.set('or', '(kind.eq.home,kind.is.null)'); else pq.set('kind', 'eq.' + kind);
    const 고치기 = body => fetch(sbUrl('bk_demand', pq.toString()), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(body),
    });
    let r = await 고치기({ ...patch, edited_at: 고친시각 });
    let 시각남김 = true;
    if (!r.ok) {
      const t = await r.text();
      if (/edited_at/.test(t) && /PGRST204|does not exist|42703/i.test(t)) { 시각남김 = false; r = await 고치기(patch); }
      else { console.error('[my:demand-edit]', r.status, t.slice(0, 160)); return res.status(502).json({ error: '고치지 못했습니다 - 잠시 뒤 다시 해 주세요' }); }
      if (!r.ok) {
        console.error('[my:demand-edit]', r.status, (await r.text()).slice(0, 160));
        return res.status(502).json({ error: '고치지 못했습니다 - 잠시 뒤 다시 해 주세요' });
      }
    }
    /* 고쳐진 행이 없다 = 내 조건이 아니거나, 유형이 다르거나, 이미 없다 */
    const 고친행 = await r.json().catch(() => []);
    if (!Array.isArray(고친행) || !고친행.length) return res.status(404).json({ error: '내 조건이 아니거나 이미 없어진 조건입니다' });
    /* 운영 기록 - 중개사가 본 뒤 손님이 무엇을 언제 바꿨는지 운영자가 되짚을 수 있게 */
    await logOps(req, user, { action: 'demand-edit', detail: `${id} · ${Object.keys(patch).join(',')}` });
    return res.status(200).json({ ok: true, id, set: patch, edited_at: 시각남김 ? 고친시각 : null });
  } catch (e) {
    console.error('[my:demand-edit]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}
