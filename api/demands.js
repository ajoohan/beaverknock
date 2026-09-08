/* 운영 조회 — 접수된 수요 조건을 읽는다.
 *
 * 서비스 키는 이 함수 안에서만 쓴다. 브라우저로 절대 내려보내지 않는다.
 * 브라우저는 접근 암호만 보내고, 조회는 여기서 대신 한다.
 *
 * 필요한 환경변수 (Vercel > Settings > Environment Variables)
 *   BK_URL         https://gmbtsucasfwqskfvugzo.supabase.co
 *   BK_SECRET_KEY  service_role 키  ← 절대 커밋하지 않는다
 *   BK_OPS_PASS    운영자 접근 암호
 */

import { opsAccount, opsOpenUntil, sbHeaders, sbUrl } from './_auth.js';
import { logOps } from './_opslog.js';

const TABLE = 'bk_demand';

/* 길이를 흘리지 않는 상수 시간 비교 */
function sameSecret(a, b) {
  const x = String(a ?? ''), y = String(b ?? '');
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

const maskPhone = p => {
  const n = String(p ?? '').replace(/-/g, '');
  return n.length >= 10 ? n.replace(/^(01[016789])(\d{3,4})(\d{4})$/, '$1-****-$3') : n;
};
const maskName = s => {
  const t = String(s ?? '').trim();
  if (t.length <= 1) return t;
  if (t.length === 2) return t[0] + '○';
  return t[0] + '○'.repeat(t.length - 2) + t[t.length - 1];
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  const { BK_URL, BK_SECRET_KEY, BK_OPS_PASS } = process.env;
  if (!BK_URL || !BK_SECRET_KEY || !BK_OPS_PASS) {
    return res.status(503).json({
      error: '서버에 환경변수가 설정되지 않았습니다',
      need: ['BK_URL', 'BK_SECRET_KEY', 'BK_OPS_PASS'].filter(k => !process.env[k]),
    });
  }

  /* 암호는 본문으로 받는다 — HTTP 헤더는 latin-1 만 담을 수 있어 한글 암호가 깨진다.
     본문이면 로그·리퍼러에 남을 위험도 없다. */
  let payload = typeof req.body === 'object' && req.body ? req.body : {};
  if (typeof req.body === 'string') { try { payload = JSON.parse(req.body); } catch { payload = {}; } }
  const pass = payload.pass;
  /* 계정을 먼저 본다. 로그인도 안 한 요청에 암호를 시험할 기회를 주지 않는다.
     암호는 사람 사이를 돌아다니고, 새면 누가 열었는지도 남지 않는다.
     BK_OPS_USERS 가 비어 있으면 명단은 안 보고 누구인지만 알아둔다. */
  const gate = await opsAccount(req);
  if (gate.error) return res.status(gate.code).json({ error: gate.error });
  const opsUser = gate.user;

  if (!sameSecret(pass, BK_OPS_PASS)) {
    /* 무차별 대입을 조금이라도 늦춘다 */
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ error: '접근 암호가 맞지 않습니다' });
  }

  /* 운영 화면이 보는 것은 여기로 모은다.
     따로 함수를 두는 편이 깔끔하지만 Vercel 함수 상한(12개)에 걸린다.
     문(계정 + 암호)이 어차피 같으니 한 지붕 아래 둔다. */
  if (payload.what === 'log')         return readLog(req, res, payload, opsUser);
  if (payload.what === 'reports')     return readReports(req, res, payload, opsUser);
  if (payload.what === 'report-mark') return markReport(req, res, payload, opsUser);
  if (payload.what === 'listings')    return readListings(req, res, payload, opsUser);
  if (payload.what === 'users')       return readUsers(req, res, payload, opsUser);

  const limit  = Math.min(parseInt(payload.limit, 10) || 200, 1000);
  const kind   = payload.kind;                 // home | shop | office | storage
  const days   = parseInt(payload.days, 10) || 0;
  const reveal = payload.reveal === true;      // 연락처 원문 보기

  const q = new URLSearchParams();
  q.set('select', '*');
  q.set('order', 'created_at.desc');
  q.set('limit', String(limit));
  if (['home', 'shop', 'office', 'storage'].includes(kind)) q.set('kind', 'eq.' + kind);
  if (days > 0) q.set('created_at', 'gte.' + new Date(Date.now() - days * 864e5).toISOString());

  let rows;
  try {
    const r = await fetch(`${BK_URL}/rest/v1/${TABLE}?${q}`, {
      headers: {
        apikey: BK_SECRET_KEY,
        Authorization: 'Bearer ' + BK_SECRET_KEY,
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: 'DB 조회 실패', status: r.status, detail: t.slice(0, 300) });
    }
    rows = await r.json();
  } catch (e) {
    return res.status(502).json({ error: 'DB에 닿지 못했습니다', detail: String(e).slice(0, 200) });
  }

  /* 기본은 가림. 필요할 때만 원문을 내린다 — 열어본 흔적이 남도록 응답에 표시한다 */
  const out = rows.map(x => ({
    ...x,
    name:  reveal ? x.name  : maskName(x.name),
    phone: reveal ? x.phone : maskPhone(x.phone),
    birth: reveal ? x.birth : (x.birth ? String(x.birth).slice(0, 4) + '****' : null),
  }));

  /* 누가 언제 무엇을 봤는지 남긴다. 특히 연락처를 드러낸 조회는 반드시.
     기다렸다 보낸다 - 서버리스는 응답과 함께 접혀서, 띄워만 두면 사라진다. */
  await logOps(req, opsUser, { action: 'demands', reveal, count: out.length,
    detail: [kind || '', days ? days + '일' : ''].filter(Boolean).join(' · ') || null });

  res.status(200).json({
    count: out.length,
    revealed: reveal,
    fetchedAt: new Date().toISOString(),
    /* 문이 열려 있다면 언제 닫히는지 화면이 말할 수 있어야 한다.
       열어둔 것을 잊는 것이 이 기능의 유일한 위험이므로, 눈에 보이게 둔다. */
    openUntil: opsOpenUntil() || null,
    guest: !!gate.guest,
    rows: out,
  });
}

/* ── 운영 화면 열람 기록 ──
   남기기만 하고 아무도 안 보면 기록이 아니라 저장 공간이다. */
async function readLog(req, res, p, opsUser) {
  const limit = Math.min(parseInt(p.limit, 10) || 200, 1000);
  try {
    const q = new URLSearchParams({ select: '*', order: 'at.desc', limit: String(limit) });
    /* 연락처를 드러낸 조회만 따로 볼 수 있어야 한다 - 그게 이 표를 보는 이유다 */
    if (p.only === 'reveal') q.set('reveal', 'is.true');
    const r = await fetch(sbUrl('bk_ops_log', q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|PGRST205/i.test(t)) {
        return res.status(200).json({ rows: [], at: new Date().toISOString(),
          note: '기록 표가 아직 없습니다 (0011 마이그레이션 필요)' });
      }
      return res.status(500).json({ error: '기록을 불러오지 못했습니다' });
    }
    /* 이 조회 자체는 기록하지 않는다. 기록을 보는 일이 기록을 밀어내면 안 된다. */
    return res.status(200).json({ rows: await r.json(), at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: '기록을 불러오지 못했습니다' });
  }
}

/* ── 신고 ──
   손님이 신고한 제안을 모아 본다. 메일로도 가지만, 무엇을 이미 처리했는지는
   목록에서 봐야 안다. 메일만 있으면 같은 건을 두 번 보거나 묻힌다. */
async function readReports(req, res, p, opsUser) {
  const limit = Math.min(parseInt(p.limit, 10) || 200, 500);
  try {
    const q = new URLSearchParams({
      select: 'id,created_at,reported_at,report_type,report_detail,report_status,report_note,'
            + 'addr,bname,dep,rent,demand_id,agent_id,status',
      order: 'reported_at.desc', limit: String(limit),
    });
    q.set('reported_at', 'not.is.null');
    /* 아직 손 안 댄 것만 보고 싶을 때가 대부분이다 */
    if (p.only === 'todo') q.set('report_status', 'is.null');

    const r = await fetch(sbUrl('bk_proposal', q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (/report_status|reported_at|does not exist|PGRST205/i.test(t)) {
        return res.status(200).json({ rows: [], at: new Date().toISOString(),
          note: '신고 칸이 아직 없습니다 (0013·0014 마이그레이션 필요)' });
      }
      return res.status(500).json({ error: '신고를 불러오지 못했습니다' });
    }
    const rows = await r.json();

    /* 어느 지역 조건이었는지, 어느 사무소가 보낸 것인지 붙여준다.
       신고 한 건만 봐서는 무엇을 봐야 할지 알 수 없다. */
    const dIds = [...new Set(rows.map(x => x.demand_id).filter(Boolean))];
    const aIds = [...new Set(rows.map(x => x.agent_id).filter(Boolean))];
    const where = {}, who = {};
    if (dIds.length) {
      const dr = await fetch(sbUrl('bk_demand', `select=id,dongs,kind&id=in.(${dIds.join(',')})`), { headers: sbHeaders() });
      if (dr.ok) for (const d of await dr.json()) where[d.id] = (d.dongs || []).join(' · ');
    }
    if (aIds.length) {
      const ar = await fetch(sbUrl('bk_agent', `select=id,role,office,name,phone,status&id=in.(${aIds.join(',')})`), { headers: sbHeaders() });
      if (ar.ok) for (const a of await ar.json()) who[a.id] = a;
    }

    await logOps(req, opsUser, { action: 'reports', count: rows.length,
      detail: p.only === 'todo' ? '미확인만' : null });

    return res.status(200).json({
      at: new Date().toISOString(),
      rows: rows.map(x => ({
        ...x,
        dongs: where[x.demand_id] || '',
        agent: who[x.agent_id]
          ? { office: who[x.agent_id].office || who[x.agent_id].name || '-',
              role: who[x.agent_id].role, phone: who[x.agent_id].phone || null,
              status: who[x.agent_id].status }
          : null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: '신고를 불러오지 못했습니다' });
  }
}

const REPORT_MARK = ['checking', 'done', 'dismissed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function markReport(req, res, p, opsUser) {
  const id = String(p.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: '어느 신고인지 알 수 없습니다' });
  const mark = p.mark === null || p.mark === '' ? null : String(p.mark || '');
  if (mark !== null && !REPORT_MARK.includes(mark)) {
    return res.status(400).json({ error: '알 수 없는 처리 상태입니다' });
  }
  const note = p.note ? String(p.note).slice(0, 500) : null;

  try {
    const r = await fetch(sbUrl('bk_proposal', `id=eq.${id}&reported_at=not.is.null`), {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(note === null ? { report_status: mark } : { report_status: mark, report_note: note }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/report_status/.test(t)) return res.status(503).json({ error: '아직 준비 중입니다 (0014 마이그레이션 필요)' });
      return res.status(500).json({ error: '처리 상태를 바꾸지 못했습니다' });
    }
    /* 몇 건이 실제로 바뀌었는지 본다 - minimal 로 두면 한 건도 안 바뀌어도 200 이 온다 */
    const changed = (await r.json().catch(() => [])).length;
    if (!changed) return res.status(404).json({ error: '바뀐 건이 없습니다 - 목록을 새로고침해 주세요' });

    await logOps(req, opsUser, { action: 'report-mark', count: changed, detail: mark || '미확인으로' });
    return res.status(200).json({ ok: true, mark, count: changed });
  } catch (e) {
    return res.status(500).json({ error: '처리 상태를 바꾸지 못했습니다' });
  }
}

/* ── 매물 ──
   중개사가 올려둔 물건. 손님에게는 목록으로 공개하지 않지만,
   운영자는 어떤 물건이 쌓이고 있는지 봐야 한다. */
async function readListings(req, res, p, opsUser) {
  const limit = Math.min(parseInt(p.limit, 10) || 300, 1000);
  try {
    const q = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: String(limit) });
    if (p.only === 'active') q.set('status', 'eq.active');
    const r = await fetch(sbUrl('bk_listing', q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|PGRST205|bk_listing/i.test(t)) {
        return res.status(200).json({ rows: [], note: '매물 표가 아직 없습니다 (0015 마이그레이션 필요)' });
      }
      return res.status(500).json({ error: '매물을 불러오지 못했습니다' });
    }
    const rows = await r.json();

    /* 누가 올린 것인지 붙여준다 - 물건만 보고는 연락할 곳을 알 수 없다 */
    const ids = [...new Set(rows.map(x => x.agent_id).filter(Boolean))];
    const who = {};
    if (ids.length) {
      const ar = await fetch(sbUrl('bk_agent',
        `select=id,role,office,name,phone,status&id=in.(${ids.join(',')})`), { headers: sbHeaders() });
      if (ar.ok) for (const a of await ar.json()) who[a.id] = a;
    }
    await logOps(req, opsUser, { action: 'listings', count: rows.length });
    return res.status(200).json({
      at: new Date().toISOString(),
      rows: rows.map(x => ({ ...x, agent: who[x.agent_id] || null })),
    });
  } catch (e) {
    return res.status(500).json({ error: '매물을 불러오지 못했습니다' });
  }
}

/* ── 손님 계정 ──
   조건을 낸 사람만 bk_demand 에 남는다. 가입만 하고 아직 조건을 안 건 사람은
   거기에 없다 - 계정 자체는 Supabase 가 들고 있으므로 그쪽에 물어본다. */
async function readUsers(req, res, p, opsUser) {
  const page = Math.max(1, parseInt(p.page, 10) || 1);
  const per = Math.min(parseInt(p.per, 10) || 50, 200);
  try {
    const r = await fetch(
      `${process.env.BK_URL}/auth/v1/admin/users?page=${page}&per_page=${per}`,
      { headers: { apikey: process.env.BK_SECRET_KEY,
                   Authorization: 'Bearer ' + process.env.BK_SECRET_KEY } });
    if (!r.ok) return res.status(502).json({ error: '계정을 불러오지 못했습니다' });
    const j = await r.json();
    const users = (j.users || j || []).map(u => ({
      id: u.id, email: u.email || null,
      /* 어떤 길로 들어온 계정인지 - 카카오를 켜기 전에 얼마나 쓰는지 봐야 한다 */
      via: (u.app_metadata && (u.app_metadata.provider || (u.app_metadata.providers||[])[0])) || 'email',
      created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null,
    }));
    await logOps(req, opsUser, { action: 'users', count: users.length, detail: `${page}쪽` });
    return res.status(200).json({ rows: users, page, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: '계정을 불러오지 못했습니다' });
  }
}
