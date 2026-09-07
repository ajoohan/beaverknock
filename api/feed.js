/* 중개사 화면 — 나에게 맞는 손님 조건.
 *
 * 승인된 파트너만 본다. 승인 전에는 아무것도 보이지 않는다 -
 * 손님 조건은 이름과 연락처가 붙은 자료이고, 아무나 열어볼 것이 아니다.
 *
 * 연락처는 여기서 절대 내보내지 않는다. 손님이 '연결' 을 누르기 전까지
 * 중개사는 지역·조건·메모까지만 본다.
 */

import { userFrom, sbHeaders, sbUrl } from './_auth.js';

const KIND_KO = { home: '주거', shop: '상가', office: '오피스', storage: '창고' };

/* '미사역 상권' 과 '미사역' 을 같은 곳으로 본다 */
const norm = x => String(x || '').replace(/\s*(상권|전체|어디든)\s*/g, '').trim();

export async function approvedAgent(user) {
  const q = new URLSearchParams({
    select: 'id,role,status,office,name', user_id: 'eq.' + user.id, limit: '1',
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
  if (chk.none)    return res.status(403).json({ error: '파트너 가입 후 이용하실 수 있습니다', need: 'join' });
  if (chk.pending) return res.status(403).json({ error: '가입 확인이 끝나면 손님 조건을 보내드립니다', need: 'approval', status: chk.pending });

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
  /* 빈 배열은 '가리지 않는다' 가 아니라 '아무것도 안 받겠다' 는 뜻이다.
     지역은 그렇게 막아뒀는데 유형만 반대로 열려 있었다. */
  const kinds = Array.isArray(b.kinds) ? b.kinds.filter(k => KIND_KO[k]) : Object.keys(KIND_KO);
  if (!kinds.length) {
    return res.status(200).json({ ok: true, agent: { id: chk.agent.id, office: chk.agent.office || null },
      hidden: { region: 0, slot: 0, kind: 1 }, at: new Date().toISOString(), rows: [] });
  }
  const regions = (Array.isArray(b.regions) ? b.regions : []).map(norm).filter(Boolean);

  try {
    const q = new URLSearchParams({
      select: 'id,created_at,kind,dongs,deal,dep,rent,biz,area_min,area_max,htype,rooms,musts,must_free,'
            + 'floor_avoid,household,elevator,loan_plan,open_when,shop_floor_free,facilities_free,'
            + 'key_ok,sign_need,park_need,shop_note,spec,memo,slots,slots_left',
      order: 'created_at.desc', limit: '200',
    });
    q.set('kind', `in.(${kinds.join(',')})`);
    const r = await fetch(sbUrl('bk_demand', q.toString()), { headers: sbHeaders() });
    if (!r.ok) return res.status(502).json({ error: '조건을 불러오지 못했습니다' });
    let rows = await r.json();

    /* 지역은 배열이라 DB 에서 거르기 번거롭다 - 여기서 맞춰본다.
       고른 지역이 없으면 아무것도 보여주지 않는다. 활동 지역을 정하는 것이 먼저다. */
    const hidden = { region: 0, slot: 0 };
    rows = rows.filter(d => {
      if (!(d.slots_left > 0)) { hidden.slot++; return false; }
      if (!regions.length) { hidden.region++; return false; }
      const ds = (d.dongs || []).map(norm);
      const hit = ds.some(x => regions.some(rg => x === rg || x.includes(rg) || rg.includes(x)));
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
      agent: { id: chk.agent.id, office: chk.agent.office || null },
      hidden,
      at: new Date().toISOString(),
      rows: rows.map(d => ({ ...d, kind_ko: KIND_KO[d.kind] || '주거', mine: mine.has(d.id) })),
    });
  } catch (e) {
    console.error('[feed]', e && e.message);
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
    kind, name, dong: txt(L.dong, 60), deal: txt(L.deal, 20), biz: txt(L.biz, 60),
    dep: int0(L.dep), rent: int0(L.rent), fee: int0(L.fee),
    py: num0(L.py), rooms: int0(L.rooms), baths: int0(L.baths),
    band: txt(L.band, 20), floors: int0(L.floors),
    musts: arr(L.musts), fac: arr(L.fac),
    move_in: txt(L.moveIn, 40), photos: int0(L.photos) || 0,
  };

  try {
    const r = await fetch(sbUrl('bk_listing'), {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const t = await r.text();
      if (noTable(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0015 마이그레이션 필요)' });
      console.error('[feed:listing-add]', r.status, t.slice(0, 160));
      return res.status(502).json({ error: '물건을 저장하지 못했습니다' });
    }
    return res.status(201).json({ ok: true, row: (await r.json())[0] || null });
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
