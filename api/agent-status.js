/* 가입 신청 상태 바꾸기 — 운영자만.
 *
 * 상태는 DB 에 남긴다. 브라우저에만 두면 기기를 바꾼 순간 사라지고,
 * 두 사람이 같은 신청에 두 번 연락하게 된다.
 *
 * 필요한 환경변수
 *   BK_URL · BK_SECRET_KEY · BK_OPS_PASS
 */

import crypto from 'node:crypto';

import { opsAccount } from './_auth.js';
import { logOps } from './_opslog.js';

const TABLE = 'bk_agent';
const STATUS = ['new', 'contacted', 'approved', 'rejected'];

function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  const n = Math.max(x.length, y.length, 1);
  const px = Buffer.alloc(n), py = Buffer.alloc(n);
  x.copy(px); y.copy(py);
  return crypto.timingSafeEqual(px, py) && x.length === y.length;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /* 계정을 먼저 본다. 로그인도 안 한 요청에 암호를 시험할 기회를 주지 않는다.
     암호는 사람 사이를 돌아다니고, 새면 누가 열었는지도 남지 않는다.
     BK_OPS_USERS 가 비어 있으면 명단은 안 보고 누구인지만 알아둔다. */
  const gate = await opsAccount(req);
  if (gate.error) return res.status(gate.code).json({ error: gate.error });
  const opsUser = gate.user;

  if (!sameSecret(p.pass, BK_OPS_PASS)) {
    return res.status(401).json({ error: '접근 암호가 맞지 않습니다' });
  }
  /* 한 건이든 여럿이든 같은 길로 처리한다 - 목록에서 골라 한 번에 바꾸는 일이 잦다 */
  const ids = Array.isArray(p.ids) ? p.ids : (p.id ? [p.id] : []);
  if (!ids.length)          return res.status(400).json({ error: '대상이 없습니다' });
  if (ids.length > 100)     return res.status(400).json({ error: '한 번에 100건까지만 바꿀 수 있습니다' });
  if (!ids.every(x => UUID.test(String(x || '')))) return res.status(400).json({ error: '대상이 올바르지 않습니다' });
  if (!STATUS.includes(p.status)) return res.status(400).json({ error: '알 수 없는 상태입니다' });

  try {
    const q = ids.length === 1
      ? `id=eq.${encodeURIComponent(ids[0])}`
      : `id=in.(${ids.map(encodeURIComponent).join(',')})`;
    const r = await fetch(`${BK_URL}/rest/v1/${TABLE}?${q}`, {
      method: 'PATCH',
      headers: {
        apikey: BK_SECRET_KEY,
        Authorization: 'Bearer ' + BK_SECRET_KEY,
        'Content-Type': 'application/json',
        /* 몇 건이 실제로 바뀌었는지 받아야 한다. minimal 로 두면 한 건도
           안 바뀌어도 200 이 와서, 운영자는 승인했다고 믿고 중개사는 계속 막힌다. */
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status: p.status }),
    });
    if (!r.ok) return res.status(500).json({ error: '상태를 바꾸지 못했습니다' });
    const changed = (await r.json().catch(() => [])).length;
    if (!changed) return res.status(404).json({ error: '바뀐 건이 없습니다 - 목록을 새로고침해 주세요', count: 0 });
    await logOps(req, opsUser, { action: 'agent-status', count: changed,
      detail: `${p.status} · 요청 ${ids.length}건` });
    return res.status(200).json({ ok: true, status: p.status, count: changed, asked: ids.length });
  } catch (e) {
    return res.status(500).json({ error: '상태 변경 중 문제가 생겼습니다' });
  }
}
