/* 알림 메일 — 들어온 걸 알아야 움직인다.
 *
 * 받는 사람은 둘이다.
 *   운영자 - 새 접수가 들어왔다 (기본)
 *   손님   - 내 조건에 제안이 왔다 (to 를 넘기면)
 * 손님 쪽이 없으면 서비스가 성립하지 않는다. 걸어두고 잊는 서비스인데
 * 제안이 온 걸 알려주지 않으면, 자리가 다 차고 조건이 만료될 때까지 모른다.
 *
 * api/ 안에 두고 이름을 _ 로 시작한다. 그러면 라우트가 되지도 않고
 * 정적 파일로 서빙되지도 않는다. lib/ 에 두면 웹으로 그대로 열린다.
 *
 * 원칙 둘.
 *  ① 알림 때문에 접수가 실패하면 안 된다. 메일이 안 가도 조건은 저장된다.
 *  ② 메일은 가장 허술한 통로다. 지역과 값까지만 담고 연락처·소재지는 뺀다.
 *     전체는 로그인해서(운영자는 암호를 넣고) 화면에서 본다.
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

/* 한 통의 모양을 만든다. 한 통을 보낼 때도, 여러 통을 묶어 보낼 때도 이걸 쓴다. */
function build(req, { subject, rows, link, to: toArg, cta, note }) {
  const to   = toArg || process.env.ALERT_TO || 'beaverknock@gmail.com';
  const from = process.env.ALERT_FROM || '비버노크 <noreply@rawpick.co.kr>';
  const host = process.env.ALERT_SITE
    || `https://${req.headers['x-forwarded-host'] || req.headers.host || 'beaverknockkorea.vercel.app'}`;

  const body = rows.map(([k, v]) =>
    `<tr><td style="padding:7px 14px 7px 0;color:#6E6859;font-size:13px;white-space:nowrap">${esc(k)}</td>` +
    `<td style="padding:7px 0;color:#1F1D1A;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join('');

  const html = `<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;padding:26px 22px">
    <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#3D3F8F">BEAVER KNOCK</div>
    <h1 style="margin:8px 0 18px;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#1F1D1A">${esc(subject)}</h1>
    <table style="border-collapse:collapse;width:100%">${body}</table>
    <a href="${host}${link}" style="display:inline-block;margin-top:22px;padding:12px 22px;border-radius:10px;
      background:#3D3F8F;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${esc(cta || '운영 화면에서 보기')}</a>
    <p style="margin:18px 0 0;font-size:11.5px;line-height:1.7;color:#6E6859">
      ${esc(note || '연락처는 가려서 보냅니다. 전체 내용은 운영 화면에서 암호를 넣고 확인하세요.')}</p>
  </div>`;

  return { from, to: [to], subject: `[비버노크] ${subject}`, html };
}

async function send(req, opts) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: 'no key' };

  try {
    const r = await withTimeout(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(build(req, opts)),
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

/* 여러 사람에게 같은 알림을 보낼 때.
 *
 * 전에는 사람마다 fetch 를 하나씩 띄워 Promise.all 로 한꺼번에 던졌다.
 * Resend 는 초당 2건이 기본 한도라 서른 통을 동시에 던지면 대부분 429 로
 * 거절당한다. 그런데 실패를 조용히 삼키고 있어서, 알림이 안 갔다는 사실을
 * 아무도 몰랐다.
 *
 * 배치 주소는 한 요청에 100통까지 받는다. 요청이 하나면 한도에 걸릴 일이 없다.
 * 돌려주는 값으로 몇 통이 나갔는지 부르는 쪽에서 알 수 있게 한다.
 */
export async function notifyMany(req, list) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: 'no key', sent: 0 };
  const mails = (list || []).slice(0, 100).map(o => build(req, o));
  if (!mails.length) return { ok: true, sent: 0 };

  try {
    const r = await withTimeout(fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(mails),
    }), 4000);
    if (r && r.skipped) return { ...r, sent: 0 };
    if (r.ok) return { ok: true, sent: mails.length };
    const t = await r.text().catch(() => '');
    console.error('[notify] 묶음 발송 실패', r.status, t.slice(0, 200));
    return { skipped: `batch failed ${r.status}`, sent: 0 };
  } catch (e) {
    console.error('[notify] 묶음 발송 오류', e && e.message);
    return { skipped: 'error', sent: 0 };
  }
}

export { mask };
