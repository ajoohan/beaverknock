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

  const { BK_URL, BK_SECRET_KEY, BK_OPS_PASS } = process.env;
  if (!BK_URL || !BK_SECRET_KEY || !BK_OPS_PASS) {
    return res.status(503).json({
      error: '서버에 환경변수가 아직 설정되지 않았습니다',
      need: ['BK_URL', 'BK_SECRET_KEY', 'BK_OPS_PASS'].filter(k => !process.env[k]),
    });
  }

  /* 암호는 본문으로 받는다 — HTTP 헤더는 latin-1 만 담을 수 있어 한글 암호가 깨진다.
     본문이면 로그·리퍼러에 남을 위험도 없다. */
  let payload = {};
  if (req.method === 'POST') {
    payload = typeof req.body === 'object' && req.body ? req.body : {};
    if (typeof req.body === 'string') { try { payload = JSON.parse(req.body); } catch { payload = {}; } }
  }
  const pass = payload.pass;
  if (!sameSecret(pass, BK_OPS_PASS)) {
    /* 무차별 대입을 조금이라도 늦춘다 */
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ error: '접근 암호가 맞지 않습니다' });
  }

  const limit  = Math.min(parseInt(payload.limit, 10) || 200, 1000);
  const kind   = payload.kind;                 // home | shop
  const days   = parseInt(payload.days, 10) || 0;
  const reveal = payload.reveal === true;      // 연락처 원문 보기

  const q = new URLSearchParams();
  q.set('select', '*');
  q.set('order', 'created_at.desc');
  q.set('limit', String(limit));
  if (kind === 'home' || kind === 'shop') q.set('kind', 'eq.' + kind);
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

  res.status(200).json({
    count: out.length,
    revealed: reveal,
    fetchedAt: new Date().toISOString(),
    rows: out,
  });
}
