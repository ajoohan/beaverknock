/* 중개사·소유자·시행사 가입 신청 접수 — 브라우저 대신 여기서 저장한다.
 *
 * bk_demand 와 같은 원칙이다: 키는 서버에만 있고, 표에는 RLS 정책이 없어
 * 브라우저가 직접 넣지 못한다. 방어 순서도 같다 - 검증을 먼저, 속도 제한은 그 뒤.
 * 오타 세 번에 60초 잠기면 그건 방어가 아니라 방해다.
 *
 * 필요한 환경변수
 *   BK_URL         https://xxxx.supabase.co
 *   BK_SECRET_KEY  secret / service_role 키
 */

import crypto from 'node:crypto';
import { notify, mask } from '../lib/notify.js';

const TABLE = 'bk_agent';

/* 같은 인스턴스가 살아 있는 동안의 연타 방지 */
const burst = new Map();
const BURST_WINDOW = 60_000, BURST_MAX = 3;

const ipHash = (ip, salt) =>
  crypto.createHash('sha256').update(String(ip) + '|' + salt).digest('hex').slice(0, 32);

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  if (typeof f === 'string' && f) return f.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const str = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

const ROLES = ['agent', 'owner', 'developer'];
const ROLE_KO = { agent: '공인중개사', owner: '소유자', developer: '시행사' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  const { BK_URL, BK_SECRET_KEY } = process.env;
  if (!BK_URL || !BK_SECRET_KEY) {
    return res.status(503).json({
      error: '서버에 환경변수가 설정되지 않았습니다',
      need: ['BK_URL', 'BK_SECRET_KEY'].filter(k => !process.env[k]),
    });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  /* 사람은 비워두는 칸. 채워져 있으면 사람이 아니다. */
  if (str(b.website)) return res.status(200).json({ ok: true });
  /* 사람은 이 화면들을 3초 안에 통과하지 못한다 */
  if (Number(b.elapsed) < 3000) return res.status(429).json({ error: '너무 빠릅니다. 잠시 후 다시 시도해 주세요' });

  const role  = ROLES.includes(b.role) ? b.role : null;
  const name  = str(b.name, 40);
  const phone = String(b.phone ?? '').replace(/-/g, '');

  const bad =
    !role                                        ? '역할이 없습니다' :
    !name || name.length < 2                     ? '성함을 확인해 주세요' :
    !/^01[016789][0-9]{7,8}$/.test(phone)        ? '연락처 형식이 맞지 않습니다' :
    role === 'agent' && !str(b.reg_no)           ? '개설등록번호가 없습니다' :
    null;
  if (bad) return res.status(400).json({ error: bad });

  /* 검증을 통과한 요청만 센다 */
  const ip = clientIp(req);
  const now = Date.now();
  const hits = (burst.get(ip) || []).filter(t => now - t < BURST_WINDOW);
  if (hits.length >= BURST_MAX) {
    return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
  }
  hits.push(now); burst.set(ip, hits);

  const row = {
    role, name, phone,
    email:    str(b.email, 120),
    office:   str(b.office, 80),
    reg_no:   str(b.reg_no, 40),
    addr:     str(b.addr, 200),
    relation: str(b.relation, 40),
    biz_no:   str(b.biz_no, 20),
    dev_type: str(b.dev_type, 40),
    done:     str(b.done, 20),
    memo:     str(b.memo, 500),
    ip_hash:  ipHash(ip, BK_SECRET_KEY),
    ua:       str(req.headers['user-agent'], 200),
  };

  const post = body => fetch(`${BK_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: BK_SECRET_KEY,
      Authorization: 'Bearer ' + BK_SECRET_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  try {
    let r = await post(row);

    /* 표를 아직 안 만들었거나 컬럼이 없으면 알아볼 수 있게 답한다 */
    if (!r.ok) {
      const t = await r.text();
      if (/relation .* does not exist|PGRST205/i.test(t)) {
        return res.status(503).json({ error: '신청 표가 아직 준비되지 않았습니다 (bk_agent)' });
      }
      /* 같은 번호로 이미 신청한 경우는 실패가 아니다 */
      if (/duplicate key|23505/i.test(t)) {
        return res.status(200).json({ ok: true, already: true });
      }
      /* 컬럼 하나가 없더라도 신청 자체는 살린다 */
      const m = t.match(/'([a-z_]+)' column/i);
      if (m && row[m[1]] !== undefined) {
        const { [m[1]]: _drop, ...rest } = row;
        r = await post(rest);
        if (r.ok) return res.status(200).json({ ok: true });
      }
      return res.status(500).json({ error: '저장에 실패했습니다' });
    }
    await notify(req, {
      subject: `새 가입 신청 · ${ROLE_KO[row.role] || row.role}`,
      rows: [
        ['역할', ROLE_KO[row.role] || row.role],
        ['성함', row.name || '-'],
        ['연락처', mask(row.phone)],
        ['사무소 · 물건', row.office || row.addr || '-'],
        ['등록번호 · 사업자', row.reg_no || row.biz_no || '-'],
        ['이메일', row.email || '-'],
      ],
      link: '/#/ops/live',
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: '저장 중 문제가 생겼습니다' });
  }
}
