/* 운영 화면 열람 기록 조회 — 운영자만.
 *
 * 기록은 남기는 것보다 보는 것이 어렵다. 아무도 안 보는 기록은
 * 기록이 아니라 저장 공간이다. 화면에 붙여 둔다.
 *
 * 필요한 환경변수
 *   BK_URL · BK_SECRET_KEY · BK_OPS_PASS · (BK_OPS_USERS)
 */

import crypto from 'node:crypto';
import { opsAccount, sbHeaders, sbUrl } from './_auth.js';

const TABLE = 'bk_ops_log';

function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  const n = Math.max(x.length, y.length, 1);
  const px = Buffer.alloc(n), py = Buffer.alloc(n);
  x.copy(px); y.copy(py);
  return crypto.timingSafeEqual(px, py) && x.length === y.length;
}

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

  /* 조건 조회와 같은 문을 쓴다 - 기록만 따로 헐겁게 열어두면 의미가 없다 */
  const gate = await opsAccount(req);
  if (gate.error) return res.status(gate.code).json({ error: gate.error });

  if (!sameSecret(p.pass, BK_OPS_PASS)) {
    return res.status(401).json({ error: '접근 암호가 맞지 않습니다' });
  }

  const limit = Math.min(parseInt(p.limit, 10) || 200, 1000);

  try {
    const q = new URLSearchParams({ select: '*', order: 'at.desc', limit: String(limit) });
    /* 연락처를 드러낸 조회만 따로 볼 수 있어야 한다 - 그게 이 표를 보는 이유다 */
    if (p.only === 'reveal') q.set('reveal', 'is.true');
    const r = await fetch(sbUrl(TABLE, q.toString()), { headers: sbHeaders() });
    if (!r.ok) {
      const t = await r.text();
      if (/does not exist|PGRST205/i.test(t)) {
        return res.status(200).json({ rows: [], at: new Date().toISOString(),
          note: '기록 표가 아직 없습니다 (0011 마이그레이션 필요)' });
      }
      return res.status(500).json({ error: '조회에 실패했습니다' });
    }
    /* 이 조회 자체는 기록하지 않는다. 기록을 보는 일이 기록을 밀어내면 안 된다. */
    return res.status(200).json({ rows: await r.json(), at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: '조회 중 문제가 생겼습니다' });
  }
}
