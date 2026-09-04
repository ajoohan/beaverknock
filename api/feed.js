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
  const kinds = Array.isArray(b.kinds) ? b.kinds.filter(k => KIND_KO[k]) : [];
  const regions = (Array.isArray(b.regions) ? b.regions : []).map(norm).filter(Boolean);

  try {
    const q = new URLSearchParams({
      select: 'id,created_at,kind,dongs,deal,dep,rent,biz,area_min,area_max,htype,rooms,musts,must_free,'
            + 'floor_avoid,household,elevator,loan_plan,open_when,shop_floor_free,facilities_free,'
            + 'key_ok,sign_need,park_need,shop_note,spec,memo,slots,slots_left',
      order: 'created_at.desc', limit: '200',
    });
    if (kinds.length) q.set('kind', `in.(${kinds.join(',')})`);
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
      const pq = new URLSearchParams({
        select: 'demand_id', agent_id: 'eq.' + chk.agent.id,
        demand_id: `in.(${rows.map(x => x.id).join(',')})`, limit: '200',
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
