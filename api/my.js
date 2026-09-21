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

  /* 가입 동의. 함수 상한(12개)이 꽉 차서 새 주소를 낼 수 없다 - 여기에 붙인다.
     손님·파트너 공통이라 '내 것' 을 다루는 이 자리가 맞다. */
  const body = req.method === 'POST' ? (req.body || {}) : {};
  if (body.what === 'consent') return consent(req, res, user, body);

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
  const row = {
    user_id: user.id,
    terms_at: now,
    privacy_at: now,
    marketing_at: set.marketing ? now : null,
    marketing_off_at: set.marketing ? null : now,
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
