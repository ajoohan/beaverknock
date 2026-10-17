/* 카카오 알림톡 — 받은 제안을 카톡으로도 알린다 (2026-10-17).
 *
 * 메일만으로는 늦게 본다. 걸어두고 잊는 서비스라, 제안이 와도 메일함을 안 열면
 * 자리가 차고 조건이 만료될 때까지 모른다. 휴대폰 번호는 본인확인으로 이미 받았다.
 *
 * 발송은 솔라피(SOLAPI, 주식회사 누리고)가 맡는다. 카카오톡 채널 '비버노크' 와
 * 심사를 통과한 템플릿이 있어야 나간다 - 둘 다 솔라피 콘솔에서 만든다.
 * 템플릿 원문은 docs 가 아니라 할일.md 에 있다(심사 통과본과 글자 하나까지 같아야 한다).
 *
 * 원칙은 메일(_notify.js)과 같다.
 *  ① 알림 때문에 제안이 실패하면 안 된다. 던지지 않고, 2.5초가 넘으면 포기한다.
 *  ② 연락처·소재지·사무소 이름은 담지 않는다. 자세한 것은 로그인해서 본다.
 *
 * 환경변수 (값은 대표님이 Vercel 에 직접 넣는다 - 하나라도 비면 조용히 건너뛴다)
 *   SOLAPI_API_KEY        솔라피 콘솔 > 개발/연동 > API Key
 *   SOLAPI_API_SECRET     같은 곳의 API Secret
 *   SOLAPI_PFID           카카오 채널 연동 후 받는 pfId (KA01PF…)
 *   SOLAPI_TPL_PROPOSAL   '새 제안 도착' 템플릿 ID (KA01TP…) - 심사 통과 뒤에 넣는다
 *   SOLAPI_FROM           솔라피에 등록한 발신번호 (예 07041050678)
 */
import crypto from 'node:crypto';

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise(r => setTimeout(() => r({ skipped: 'timeout' }), ms))]);

/* 휴대폰 번호만 보낸다 - 하이픈·공백을 걷고 010 으로 시작하는 10~11자리만 */
export const 휴대폰 = p => {
  const n = String(p || '').replace(/[^0-9]/g, '');
  return /^01[016789][0-9]{7,8}$/.test(n) ? n : null;
};

/* 솔라피 인증 머리 - API Secret 으로 (시각+소금) 을 서명한다. Secret 자체는 보내지 않는다 */
export function 솔라피머리(key, secret, now = new Date(), salt = crypto.randomBytes(16).toString('hex')) {
  const date = now.toISOString();
  const signature = crypto.createHmac('sha256', secret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

/* 알림톡 한 통. 템플릿의 #{변수} 를 vars 로 채운다. 어떤 경우에도 던지지 않는다. */
export async function alimtalk({ to, template, vars }) {
  try {
    const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
    const pfId = process.env.SOLAPI_PFID, templateId = template;
    if (!key || !secret || !pfId || !templateId) return { skipped: 'no key' };
    const 번호 = 휴대폰(to);
    if (!번호) return { skipped: 'no phone' };

    const message = {
      to: 번호,
      kakaoOptions: {
        pfId, templateId,
        variables: Object.fromEntries(Object.entries(vars || {}).map(([k, v]) => [`#{${k}}`, String(v ?? '').slice(0, 60)])),
        /* 알림톡이 안 가면 문자로 대신 보내지 않는다 - 문자는 건당 요금이 따로 들고, 메일이 이미 간다 */
        disableSms: true,
      },
    };
    const from = String(process.env.SOLAPI_FROM || '').replace(/[^0-9]/g, '');
    if (from) message.from = from;

    const r = await withTimeout(fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { Authorization: 솔라피머리(key, secret), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }), 2500);
    if (r && r.skipped) return r;
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => '');
    /* 솔라피가 거절한 이유를 남긴다 - 템플릿 불일치인지 채널 미연동인지 갈린다. 번호는 남기지 않는다 */
    console.error('[alimtalk]', r.status, t.slice(0, 160));
    return { skipped: `send failed ${r.status}` };
  } catch (e) {
    return { skipped: 'error', detail: e && e.message };
  }
}
