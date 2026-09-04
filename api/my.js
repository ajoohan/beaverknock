/* 손님 화면 — 내가 건 조건과 거기에 온 제안.
 *
 * 지금까지 이 화면은 브라우저 메모리의 시드였다. 조건을 내면 DB 에는 들어갔지만
 * 본인은 다시 볼 수 없었고, 새로고침하면 방금 낸 조건도 사라졌다.
 *
 * 누가 보냈는지는 Supabase 토큰으로만 정한다 - 브라우저가 적어 보내는 id 는 안 믿는다.
 */

import { userFrom, sbHeaders, sbUrl } from './_auth.js';

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

    /* 제안을 보낸 중개사의 사무소 이름만 붙인다. 연락처는 붙이지 않는다 -
       손님이 '연결' 을 누르기 전까지는 서로의 번호가 오가지 않는 것이 이 서비스의 약속이다. */
    const agentIds = [...new Set(proposals.map(p => p.agent_id).filter(Boolean))];
    let offices = {};
    if (agentIds.length) {
      const aq = new URLSearchParams({ select: 'id,office,name', id: `in.(${agentIds.join(',')})` });
      const ar = await fetch(sbUrl('bk_agent', aq.toString()), { headers: sbHeaders() });
      if (ar.ok) for (const a of await ar.json()) offices[a.id] = a.office || '공인중개사사무소';
    }

    return res.status(200).json({
      ok: true,
      demands: demands.map(d => ({
        id: d.id, kind: d.kind, kind_ko: KIND_KO[d.kind] || '주거',
        dongs: d.dongs || [], deal: d.deal, dep: d.dep, rent: d.rent,
        biz: d.biz, area_min: d.area_min, area_max: d.area_max,
        htype: d.htype || [], rooms: d.rooms, memo: d.memo,
        slots: d.slots, slots_left: d.slots_left,
        created_at: d.created_at,
      })),
      proposals: proposals.map(p => ({
        id: p.id, demand_id: p.demand_id, status: p.status,
        office: offices[p.agent_id] || '공인중개사사무소',
        bname: p.bname, addr_area: String(p.addr || '').split(' ').slice(0, 2).join(' '),
        dep: p.dep, rent: p.rent, fee: p.fee, fee_type: p.fee_type, fee_items: p.fee_items,
        area_sup: p.area_sup, area: p.area, rooms: p.rooms, baths: p.baths, dir: p.dir,
        floor: p.floor_mode === '비공개' ? '비공개' : (p.floor_no ? p.floor_no + '층' : p.band || ''),
        move_in: p.move_in, park: p.park, approved: p.approved, photos: p.photos,
        msg: p.msg, created_at: p.created_at,
      })),
    });
  } catch (e) {
    console.error('[my]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}
