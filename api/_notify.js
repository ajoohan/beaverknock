/* 새 접수 알림 — 들어온 걸 알아야 움직인다.
 *
 * api/ 안에 두고 이름을 _ 로 시작한다. 그러면 라우트가 되지도 않고
 * 정적 파일로 서빙되지도 않는다. lib/ 에 두면 웹으로 그대로 열린다.
 *
 * 원칙 둘.
 *  ① 알림 때문에 접수가 실패하면 안 된다. 메일이 안 가도 조건은 저장된다.
 *  ② 메일은 가장 허술한 통로다. 이름과 지역까지만 담고 연락처는 가린다.
 *     전체는 운영 화면에서 암호를 넣고 본다.
 *
 * 필요한 환경변수
 *   RESEND_API_KEY   Resend API 키
 *   ALERT_TO         받을 주소 (없으면 beaverknock@gmail.com)
 *   ALERT_FROM       보내는 주소 (없으면 인증된 도메인)
 *   ALERT_SITE       운영 화면 주소 (없으면 요청 host 로)
 */

const mask = p => {
  const n = String(p || '').replace(/-/g, '');
  return n.length >= 10 ? n.replace(/^(01[016789])([0-9]{3,4})([0-9]{4})$/, '$1-****-$3') : n;
};

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* 2.5초 안에 안 되면 포기한다. 접수를 붙잡아 두지 않는다. */
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise(r => setTimeout(() => r({ skipped: 'timeout' }), ms))]);

export async function notify(req, opts) {
  /* 알림은 어떤 경우에도 던지지 않는다. 이미 저장된 접수가 500 으로 보이면 안 된다. */
  try { return await send(req, opts); } catch (e) { return { skipped: 'error', detail: e && e.message }; }
}

async function send(req, { subject, rows, link }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: 'no key' };

  const to   = process.env.ALERT_TO   || 'beaverknock@gmail.com';
  const from = process.env.ALERT_FROM || '비버노크 <noreply@rawpick.co.kr>';
  const host = process.env.ALERT_SITE
    || `https://${req.headers['x-forwarded-host'] || req.headers.host || 'beaverknockkorea.vercel.app'}`;

  const body = rows.map(([k, v]) =>
    `<tr><td style="padding:7px 14px 7px 0;color:#857F76;font-size:13px;white-space:nowrap">${esc(k)}</td>` +
    `<td style="padding:7px 0;color:#1F1D1A;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join('');

  const html = `<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;padding:26px 22px">
    <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#3D3F8F">BEAVER KNOCK</div>
    <h1 style="margin:8px 0 18px;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#1F1D1A">${esc(subject)}</h1>
    <table style="border-collapse:collapse;width:100%">${body}</table>
    <a href="${host}${link}" style="display:inline-block;margin-top:22px;padding:12px 22px;border-radius:10px;
      background:#3D3F8F;color:#fff;font-size:14px;font-weight:700;text-decoration:none">운영 화면에서 보기</a>
    <p style="margin:18px 0 0;font-size:11.5px;line-height:1.7;color:#857F76">
      연락처는 가려서 보냅니다. 전체 내용은 운영 화면에서 암호를 넣고 확인하세요.</p>
  </div>`;

  try {
    const r = await withTimeout(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `[비버노크] ${subject}`, html }),
    }), 2500);
    if (r && r.skipped) return r;
    if (r.ok) return { ok: true };
    /* Resend 가 거절한 이유를 그대로 살린다 - 도메인 미인증인지 키가 틀렸는지 갈린다 */
    const t = await r.text().catch(() => '');
    return { skipped: `send failed ${r.status}`, detail: t.slice(0, 160) };
  } catch (e) {
    return { skipped: 'error' };
  }
}

export { mask };
