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

import { opsAccount, sbHeaders, sbUrl } from './_auth.js';
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

  /* 열람 기록도 여기서 읽는다.
     따로 함수를 두는 편이 깔끔하지만 Vercel 함수 상한(12개)에 걸린다.
     문(계정 + 암호)이 어차피 같으니 한 지붕 아래 둔다. */
  if (payload.what === 'log') return readLog(req, res, payload, opsUser);

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
