/* 제안 — 중개사가 보내고, 손님이 읽고 답한다.
 *
 * 지금까지 '제안 보내기' 는 그 브라우저 메모리에만 남았다. 화면에는
 * "손님에게 즉시 전달됩니다" 라고 떴지만 아무 데도 가지 않았다.
 *
 * POST  중개사가 보낸다   - 승인된 파트너 · 슬롯이 남은 조건만
 * PATCH 손님이 상태를 바꾼다 - 자기 조건에 온 제안만
 */

import { userFrom, sbHeaders, sbUrl } from './_auth.js';
import { approvedAgent } from './feed.js';
import { notify } from './_notify.js';

const str = (v, max = 200) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINE = ['read', 'accepted', 'rejected'];       /* 손님이 바꿀 수 있는 상태 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) {
    return res.status(503).json({ error: '서버에 환경변수가 설정되지 않았습니다' });
  }
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  if (req.method === 'PATCH') return patch(req, res, user, b);
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 또는 PATCH 만 받습니다' });

  /* ── 중개사가 보낸다 ── */
  const chk = await approvedAgent(user);
  if (chk.error)   return res.status(502).json({ error: '자격을 확인하지 못했습니다' });
  if (chk.none)    return res.status(403).json({ error: '파트너 가입 후 이용하실 수 있습니다', need: 'join' });
  if (chk.pending) return res.status(403).json({ error: '가입 확인이 끝나야 제안을 보내실 수 있습니다', need: 'approval' });

  const demandId = str(b.demand_id, 40);
  if (!demandId || !UUID.test(demandId)) return res.status(400).json({ error: '어느 조건인지 알 수 없습니다' });
  const addr = str(b.addr, 200);
  if (!addr) return res.status(400).json({ error: '소재지가 없습니다' });

  try {
    /* 슬롯이 남았는지 본다. 조건 하나에 다섯 곳까지가 이 서비스의 약속이다. */
    const dq = new URLSearchParams({ select: 'id,slots_left,user_id,kind,dongs', id: 'eq.' + demandId, limit: '1' });
    const dr = await fetch(sbUrl('bk_demand', dq.toString()), { headers: sbHeaders() });
    if (!dr.ok) return res.status(502).json({ error: '조건을 확인하지 못했습니다' });
    const d = (await dr.json())[0];
    if (!d) return res.status(404).json({ error: '없는 조건입니다' });
    if (!(d.slots_left > 0)) return res.status(409).json({ error: '이 조건은 제안이 마감됐습니다' });

    const row = {
      demand_id: demandId, agent_id: chk.agent.id, agent_user: user.id,
      addr, bname: str(b.bname, 80),
      dep: int(b.dep), rent: int(b.rent), fee: int(b.fee),
      fee_type: str(b.fee_type, 40), fee_items: str(b.fee_items, 200),
      area_sup: num(b.area_sup), area: num(b.area),
      rooms: str(b.rooms, 10), baths: str(b.baths, 10), dir: str(b.dir, 10),
      floor_mode: str(b.floor_mode, 20), floor_no: str(b.floor_no, 10), band: str(b.band, 10),
      move_in: str(b.move_in, 40), park: str(b.park, 40), approved: str(b.approved, 20),
      photos: int(b.photos) || 0, msg: str(b.msg, 500),
    };

    const ir = await fetch(sbUrl('bk_proposal'), {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!ir.ok) {
      const t = await ir.text();
      if (/duplicate key|23505/i.test(t)) {
        return res.status(409).json({ error: '이미 제안하신 물건입니다 - 같은 주소는 한 번만 보낼 수 있습니다' });
      }
      if (/relation .* does not exist|PGRST205/i.test(t)) {
        return res.status(503).json({ error: '아직 준비 중입니다 (0009 마이그레이션 필요)' });
      }
      console.error('[proposal] 저장 실패', ir.status, t.slice(0, 200));
      return res.status(502).json({ error: '제안을 저장하지 못했습니다' });
    }
    const saved = (await ir.json())[0] || {};

    /* 슬롯을 하나 줄인다. 실패해도 제안은 이미 들어갔으니 접수는 성공이다. */
    await fetch(sbUrl('bk_demand', 'id=eq.' + demandId), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ slots_left: Math.max(0, (d.slots_left || 1) - 1) }),
    }).catch(() => {});

    await notify(req, {
      subject: `새 제안 · ${(d.dongs || []).join(' · ') || '서울·경기'}`,
      rows: [
        ['사무소', chk.agent.office || '-'],
        ['물건', row.bname || row.addr],
        ['가격', `보증금 ${row.dep ?? 0}만${row.rent ? ` / 월 ${row.rent}만` : ''}`],
        ['남은 슬롯', String(Math.max(0, (d.slots_left || 1) - 1))],
      ],
      link: '/#/ops/live',
    });

    return res.status(201).json({ ok: true, id: saved.id, slots_left: Math.max(0, (d.slots_left || 1) - 1) });
  } catch (e) {
    console.error('[proposal]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* ── 손님이 상태를 바꾼다 ── */
async function patch(req, res, user, b) {
  const id = str(b.id, 40);
  const status = str(b.status, 20);
  if (!id || !UUID.test(id)) return res.status(400).json({ error: '어느 제안인지 알 수 없습니다' });
  if (!MINE.includes(status)) return res.status(400).json({ error: '바꿀 수 없는 상태입니다' });

  try {
    /* 내 조건에 온 제안이 맞는지 본다 - 남의 제안을 건드리지 못하게 한다 */
    const pq = new URLSearchParams({ select: 'id,demand_id,status', id: 'eq.' + id, limit: '1' });
    const pr = await fetch(sbUrl('bk_proposal', pq.toString()), { headers: sbHeaders() });
    if (!pr.ok) return res.status(502).json({ error: '제안을 확인하지 못했습니다' });
    const p = (await pr.json())[0];
    if (!p) return res.status(404).json({ error: '없는 제안입니다' });

    const dq = new URLSearchParams({ select: 'id', id: 'eq.' + p.demand_id, user_id: 'eq.' + user.id, limit: '1' });
    const dr = await fetch(sbUrl('bk_demand', dq.toString()), { headers: sbHeaders() });
    if (!dr.ok || !(await dr.json()).length) return res.status(403).json({ error: '내 조건에 온 제안이 아닙니다' });

    /* 한 번 읽은 것을 다시 '안 읽음' 으로 돌리지 않는다 */
    if (status === 'read' && p.status !== 'sent') return res.status(200).json({ ok: true, status: p.status });

    const body = { status };
    if (status === 'read') body.read_at = new Date().toISOString();
    const ur = await fetch(sbUrl('bk_proposal', 'id=eq.' + id), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(body),
    });
    if (!ur.ok) return res.status(502).json({ error: '상태를 바꾸지 못했습니다' });
    return res.status(200).json({ ok: true, status });
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}
