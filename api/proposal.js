/* 제안 — 중개사가 보내고, 손님이 읽고 답한다.
 *
 * 지금까지 '제안 보내기' 는 그 브라우저 메모리에만 남았다. 화면에는
 * "손님에게 즉시 전달됩니다" 라고 떴지만 아무 데도 가지 않았다.
 *
 * POST  중개사가 보낸다   - 승인된 파트너 · 슬롯이 남은 조건만
 * PATCH 손님이 상태를 바꾼다 - 자기 조건에 온 제안만
 */

import { userFrom, sbHeaders, sbUrl, emailOf } from './_auth.js';
import { approvedAgent } from './feed.js';
import { notify } from './_notify.js';

const str = (v, max = 200) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINE = ['read', 'accepted', 'rejected'];       /* 손님이 바꿀 수 있는 상태 */
const ROLE_KO = { agent: '공인중개사', owner: '소유자', developer: '시행사' };

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

    /* 자리를 먼저 잡고 넣는다.
       읽은 값 그대로일 때만 줄이도록 걸어(compare-and-swap) 두 사람이 동시에
       마지막 자리를 가져가는 것을 막는다 - 그냥 읽고 빼면 둘 다 성공해서
       '조건 1건당 5곳' 약속이 깨진다. 넣다 실패하면 자리를 돌려준다. */
    const take = async () => {
      let cur = d.slots_left;
      for (let i = 0; i < 4; i++) {
        if (!(cur > 0)) return { full: true };
        const rr = await fetch(sbUrl('bk_demand', `id=eq.${demandId}&slots_left=eq.${cur}`), {
          method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
          body: JSON.stringify({ slots_left: cur - 1 }),
        });
        if (!rr.ok) return { error: await rr.text() };
        const got = await rr.json().catch(() => []);
        if (got.length) return { left: cur - 1 };
        /* 그 사이 누가 가져갔다 - 다시 읽고 한 번 더 */
        const again = await fetch(sbUrl('bk_demand', `select=slots_left&id=eq.${demandId}&limit=1`), { headers: sbHeaders() });
        if (!again.ok) return { error: await again.text() };
        cur = ((await again.json())[0] || {}).slots_left;
      }
      return { busy: true };
    };
    const seat = await take();
    if (seat.full)  return res.status(409).json({ error: '이 조건은 제안이 마감됐습니다' });
    if (seat.busy)  return res.status(409).json({ error: '다른 분이 먼저 보내는 중입니다 - 잠시 후 다시 시도해 주세요' });
    if (seat.error) { console.error('[proposal] 슬롯 확보 실패', String(seat.error).slice(0, 200));
      return res.status(502).json({ error: '제안을 보내지 못했습니다' }); }

    /* 자리를 잡았으니, 넣다 실패하면 반드시 돌려준다 */
    const giveBack = async () => {
      await fetch(sbUrl('bk_demand', `id=eq.${demandId}&slots_left=eq.${seat.left}`), {
        method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ slots_left: seat.left + 1 }),
      }).catch(e => console.error('[proposal] 슬롯 반납 실패', e && e.message));
    };

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
      await giveBack();
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

    const where = (d.dongs || []).join(' · ') || '서울·경기';
    const price = `보증금 ${row.dep ?? 0}만${row.rent ? ` / 월 ${row.rent}만` : ''}`;

    /* 메일 둘을 나란히 보낸다.
       줄줄이 기다리면 제안을 보낸 중개사가 그만큼 더 서 있는다.
       손님 주소를 찾는 일도 운영자 메일과 겹쳐서 돌린다. */
    const toP = emailOf(d.user_id);

    /* 손님에게 알리는 쪽이 핵심이다.
       걸어두고 잊는 서비스다. 제안이 와도 다시 들어와 보지 않으면 모르고,
       모르는 사이에 자리가 차고 조건이 만료된다.
       메일에는 소재지도 사무소 이름도 담지 않는다 - 그건 로그인해서 볼 것이고,
       손님이 알 것은 '누가' 가 아니라 '어떤 자격의 사람인가' 까지다. */
    await Promise.all([
      notify(req, {
        subject: `새 제안 · ${where}`,
        rows: [
          ['사무소', chk.agent.office || '-'],
          ['물건', row.bname || row.addr],
          ['가격', price],
          ['남은 슬롯', String(seat.left)],
        ],
        link: '/#/ops/live',
      }),
      toP.then(to => to && notify(req, {
        to,
        subject: `${where}에 새 제안이 도착했습니다`,
        rows: [
          ['지역', where],
          ['보낸 곳', ROLE_KO[chk.agent.role] || '공인중개사'],
          ['가격', price],
          ['남은 자리', `${seat.left}곳`],
        ],
        link: '/#/inbox',
        cta: '제안 보러 가기',
        note: '사진과 자세한 내용은 비버노크에서 확인하실 수 있습니다. 연락처는 연결을 누르시기 전까지 어느 쪽에도 넘어가지 않습니다.',
      })),
    ]);

    return res.status(201).json({ ok: true, id: saved.id, slots_left: seat.left });
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
    const pq = new URLSearchParams({
      select: 'id,demand_id,status,agent_id,connected_at,addr,bname', id: 'eq.' + id, limit: '1',
    });
    const pr = await fetch(sbUrl('bk_proposal', pq.toString()), { headers: sbHeaders() });
    if (!pr.ok) {
      const t = await pr.text();
      if (/connected_at/.test(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0010 마이그레이션 필요)' });
      return res.status(502).json({ error: '제안을 확인하지 못했습니다' });
    }
    const p = (await pr.json())[0];
    if (!p) return res.status(404).json({ error: '없는 제안입니다' });

    const dq = new URLSearchParams({
      select: 'id,name,phone,dongs,slots,slots_left,returned',
      id: 'eq.' + p.demand_id, user_id: 'eq.' + user.id, limit: '1',
    });
    const dr = await fetch(sbUrl('bk_demand', dq.toString()), { headers: sbHeaders() });
    if (!dr.ok) return res.status(502).json({ error: '조건을 확인하지 못했습니다' });
    const d = (await dr.json())[0];
    if (!d) return res.status(403).json({ error: '내 조건에 온 제안이 아닙니다' });

    /* 한 번 읽은 것을 다시 '안 읽음' 으로 돌리지 않는다 */
    if (status === 'read' && p.status !== 'sent') return res.status(200).json({ ok: true, status: p.status });

    const body = { status };
    if (status === 'read') body.read_at = new Date().toISOString();

    /* 연결은 실번호가 오가는 순간이다.
       손님에게는 중개사 연락처를 응답으로 돌려주고, 중개사에게는 손님 연락처를
       메일로 보낸다. 언제 동의하고 연결했는지는 connected_at 에 남긴다 -
       개인정보 제공은 시점이 곧 근거다. */
    const first = status === 'accepted' && !p.connected_at;
    if (first) body.connected_at = new Date().toISOString();

    /* 거절이면 슬롯을 돌려준다.
       조건당 2회까지다 - 무제한이면 마음에 안 드는 제안을 계속 물리면서
       중개사만 끝없이 불러들이게 된다.
       이미 거절한 것을 또 눌러도 두 번 돌려주지 않는다. */
    let refund = null;
    if (status === 'rejected' && p.status !== 'rejected') refund = await giveSlotBack(d);

    let agent = null;
    if (status === 'accepted') {
      const aq = new URLSearchParams({
        select: 'id,role,name,phone,email,office,reg_no,addr', id: 'eq.' + p.agent_id, limit: '1',
      });
      const ar = await fetch(sbUrl('bk_agent', aq.toString()), { headers: sbHeaders() });
      if (!ar.ok) return res.status(502).json({ error: '연결할 곳을 확인하지 못했습니다' });
      agent = (await ar.json())[0];
      if (!agent) return res.status(404).json({ error: '연결할 곳을 찾지 못했습니다' });
    }

    const ur = await fetch(sbUrl('bk_proposal', 'id=eq.' + id), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(body),
    });
    if (!ur.ok) return res.status(502).json({ error: '상태를 바꾸지 못했습니다' });

    if (status !== 'accepted') {
      return res.status(200).json({ ok: true, status,
        returned: refund ? refund.returned : null,
        slots_left: refund ? refund.slots_left : null,
        refunded: refund ? !!refund.ok : false });
    }

    /* 중개사에게 손님 연락처를 보낸다.
       메일에 실번호를 담는 유일한 자리다. 손님이 방금 이 사람에게 주겠다고
       고른 번호이고, 이걸 가리면 연결이 연결이 아니게 된다.
       두 번 눌러도 메일은 한 번만 나간다. */
    if (first) {
      const where = (d.dongs || []).join(' · ') || '서울·경기';
      await notify(req, {
        to: agent.email || undefined,
        subject: `손님이 연결을 눌렀습니다 · ${where}`,
        rows: [
          ['손님', d.name || '-'],
          ['연락처', d.phone || '-'],
          ['물건', p.bname || p.addr || '-'],
          ['지역', where],
          /* 메일 주소를 안 남긴 파트너면 이 메일은 운영자에게 간다.
             누구에게 넘겨야 하는지가 메일 안에 있어야 한다. */
          ['받는 곳', agent.office || agent.name || '-'],
        ],
        link: '/#/partner',
        cta: '파트너 화면 열기',
        note: '손님이 연락처 제공에 동의하고 연결을 눌렀습니다. 이 번호는 이 제안 상담에만 사용해 주세요. '
            + '비버노크는 상담과 계약에 관여하지 않습니다.',
      });
    }

    return res.status(200).json({
      ok: true, status,
      contact: {
        role: ROLE_KO[agent.role] || '공인중개사',
        office: agent.office || null,
        name: agent.name || null,
        phone: agent.phone || null,
        reg_no: agent.reg_no || null,
        addr: agent.addr || null,
      },
    });
  } catch (e) {
    console.error('[proposal:patch]', e && e.message);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }
}

/* 슬롯 하나를 조건에 돌려놓는다.
   읽은 값 그대로일 때만 쓰도록 걸어(compare-and-swap) 두 제안을 연달아
   거절해도 반환이 한 번으로 뭉개지거나 두 번 세지지 않게 한다. */
async function giveSlotBack(d) {
  const MAX = 2;
  let cur = { returned: d.returned || 0, slots_left: d.slots_left, slots: d.slots };
  for (let i = 0; i < 4; i++) {
    if (cur.returned >= MAX) return { ok: false, why: 'max', returned: cur.returned, slots_left: cur.slots_left };
    /* 준 적 없는 자리를 돌려줄 수는 없다 */
    if (!(cur.slots_left < cur.slots)) return { ok: false, why: 'full', returned: cur.returned, slots_left: cur.slots_left };

    const q = `id=eq.${d.id}&returned=eq.${cur.returned}&slots_left=eq.${cur.slots_left}`;
    const r = await fetch(sbUrl('bk_demand', q), {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ returned: cur.returned + 1, slots_left: cur.slots_left + 1 }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      /* 칸이 아직 없으면 거절 자체는 살린다 - 슬롯만 못 돌려준다 */
      if (/returned/.test(t)) return { ok: false, why: 'no column' };
      console.error('[proposal] 슬롯 반환 실패', r.status, t.slice(0, 160));
      return { ok: false, why: 'error' };
    }
    const got = await r.json().catch(() => []);
    if (got.length) return { ok: true, returned: cur.returned + 1, slots_left: cur.slots_left + 1 };

    /* 그 사이 값이 움직였다 - 다시 읽고 한 번 더 */
    const again = await fetch(sbUrl('bk_demand', `select=slots,slots_left,returned&id=eq.${d.id}&limit=1`), { headers: sbHeaders() });
    if (!again.ok) return { ok: false, why: 'error' };
    const row = (await again.json())[0];
    if (!row) return { ok: false, why: 'error' };
    cur = { returned: row.returned || 0, slots_left: row.slots_left, slots: row.slots };
  }
  return { ok: false, why: 'busy' };
}
