/* 가입 신청 조회 — 운영자만.
 *
 * demands.js 와 같은 방식이다. 암호는 본문에 담는다 -
 * HTTP 헤더는 latin-1 만 실을 수 있어 한글 암호를 못 보낸다.
 *
 * 필요한 환경변수
 *   BK_URL · BK_SECRET_KEY · BK_OPS_PASS
 */

import crypto from 'node:crypto';

const TABLE = 'bk_agent';

/* 길이가 달라도 같은 시간이 걸리게 비교한다 */
function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  const n = Math.max(x.length, y.length, 1);
  const px = Buffer.alloc(n), py = Buffer.alloc(n);
  x.copy(px); y.copy(py);
  return crypto.timingSafeEqual(px, py) && x.length === y.length;
}

const mask = p => {
  const n = String(p || '').replace(/-/g, '');
  return n.length >= 10 ? n.replace(/^(01[016789])([0-9]{3,4})([0-9]{4})$/, '$1-****-$3') : n;
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

  let p = req.body;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }
  p = p || {};

  if (!sameSecret(p.pass, BK_OPS_PASS)) {
    return res.status(401).json({ error: '접근 암호가 맞지 않습니다' });
  }

  const limit = Math.min(parseInt(p.limit, 10) || 300, 1000);
  const q = new URLSearchParams();
  q.set('select', '*');
  q.set('order', 'created_at.desc');
  q.set('limit', String(limit));

  try {
    const r = await fetch(`${BK_URL}/rest/v1/${TABLE}?${q}`, {
      headers: { apikey: BK_SECRET_KEY, Authorization: 'Bearer ' + BK_SECRET_KEY },
    });
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|PGRST205/i.test(t)) {
        return res.status(200).json({ rows: [], at: new Date().toISOString(), note: '신청 표가 아직 없습니다' });
      }
      return res.status(500).json({ error: '조회에 실패했습니다' });
    }
    const rows = await r.json();

    /* 화면에서는 연락처를 기본으로 가린다 - 원문은 따로 요청해야 나온다 */
    const out = p.reveal ? rows : rows.map(x => ({ ...x, phone: mask(x.phone) }));
    return res.status(200).json({ rows: out, at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: '조회 중 문제가 생겼습니다' });
  }
}
