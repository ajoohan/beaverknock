/* 운영 화면 열람 기록.
 *
 * 조건에는 이름과 연락처가 들어 있다. 그것을 누가 언제 열어 봤는지가
 * 남지 않으면, 암호가 새도 계정이 잘못 쓰여도 알 길이 없다.
 *
 * 원칙 둘.
 *  ① 기록 때문에 조회가 실패하면 안 된다. 못 남겨도 운영자는 일을 한다.
 *  ② 그래도 반드시 기다렸다 보낸다. 서버리스는 응답과 함께 프로세스를
 *     접기 때문에, 띄워만 두고 가면 그 기록은 사라진다.
 */

import crypto from 'node:crypto';
import { sbHeaders, sbUrl } from './_auth.js';

const clientIp = req =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  || req.socket?.remoteAddress || '';

const ipHash = (ip, salt) =>
  crypto.createHash('sha256').update(String(ip) + '|' + salt).digest('hex').slice(0, 32);

export async function logOps(req, user, { action, reveal = false, count = null, detail = null }) {
  try {
    const key = process.env.BK_SECRET_KEY;
    if (!process.env.BK_URL || !key) return { skipped: 'no env' };

    const row = {
      user_id: user && user.id ? user.id : null,
      email:   user && user.email ? String(user.email).slice(0, 200) : null,
      action:  String(action).slice(0, 40),
      reveal:  !!reveal,
      count:   Number.isFinite(count) ? count : null,
      detail:  detail ? String(detail).slice(0, 200) : null,
      ip_hash: ipHash(clientIp(req), key),
      ua:      String(req.headers['user-agent'] || '').slice(0, 200),
    };

    const r = await fetch(sbUrl('bk_ops_log'), {
      method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => '');
    /* 표가 아직 없으면 조용히 넘어간다 - 마이그레이션 전에 배포될 수 있다 */
    if (/relation .* does not exist|PGRST205/i.test(t)) return { skipped: 'no table' };
    console.error('[opslog]', r.status, t.slice(0, 160));
    return { skipped: 'failed' };
  } catch (e) {
    return { skipped: 'error', detail: e && e.message };
  }
}
