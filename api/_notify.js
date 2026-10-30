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

/* 글꼴은 본고딕 계열 하나로 - 애플은 Apple SD Gothic Neo, 안드로이드는 Noto Sans CJK(본고딕), 윈도우는 맑은 고딕.
 * 받는 분 기기에 Pretendard 가 깔려 있으면 그것을 먼저 쓴다.
 * 전에는 사이트의 Pretendard 파일을 웹 글꼴로 불렀는데, 그 파일이 9월 화면 글자만 담은 634자 축소판이라
 * 애플 메일에서 없는 글자가 다른 글꼴로 섞여 그려졌다(2026-10-30 '폰트 가독성'). 사이트는 이제 조각 92개로
 * 나눠 필요한 것만 받는데, 메일에 그 선언 92줄(약 50KB)을 넣으면 Gmail 이 102KB 에서 메일을 자른다 - 메일은 웹 글꼴을 쓰지 않는다.
 * 표 칸과 단추에도 따로 적는다. 아웃룩은 표 안으로 글꼴을 물려주지 않는다.
 *
 * 윈도우 아웃룩(워드 엔진)에는 맑은 고딕을 따로 못 박는다([if mso]) - 목록의 앞 글꼴이 없으면 Times New Roman 으로 떨어지기도 한다. */
const FONT = "'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo'," +
  "'Noto Sans KR','Noto Sans CJK KR','Source Han Sans KR','Malgun Gothic',sans-serif";
const fontFace = () =>
  "<!--[if mso]><style>body,div,table,td,h1,p,a{font-family:'Malgun Gothic',sans-serif!important}</style><![endif]-->";

/* 메일 속 주소(단추 링크·글꼴 파일)의 앞부분. ALERT_SITE 를 먼저 본다.
 * 없으면 요청 머리의 host 를 쓰되, 도메인 모양일 때만 받는다 - 머리값이 그대로 HTML·CSS 안에
 * 들어가므로 따옴표·괄호·꺾쇠가 섞이면 메일이 깨진다.
 * ALERT_SITE 는 https:// 를 빼고 넣어도 받는다. 그래도 주소 모양이 아니면 버리되, 왜 버렸는지
 * 로그에 한 번 남긴다 - 조용히 넘어가면 링크가 엉뚱한 주소로 나가도 설정 탓인 줄 모른다. */
const DOMAIN = /^[a-z0-9.-]+(:\d+)?$/i;
let 주소경고 = false;
function siteOf(req) {
  const raw = String(process.env.ALERT_SITE || '').trim().replace(/\/+$/, '');
  if (raw) {
    const env = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (DOMAIN.test(env.replace(/^https?:\/\//i, ''))) return env;
    if (!주소경고) { 주소경고 = true; console.warn('[notify] ALERT_SITE 가 주소 모양이 아니라 쓰지 않습니다', raw.slice(0, 80)); }
  }
  const h = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '')
    .split(',')[0].trim();
  return `https://${DOMAIN.test(h) ? h : 'beaverknock.co.kr'}`;
}

const NOTE = '연락처는 가려서 보냅니다. 전체 내용은 운영 화면에서 암호를 넣고 확인하세요.';
const CTA = '운영 화면에서 보기';

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
  const host = siteOf(req);

  const body = rows.map(([k, v]) =>
    `<tr><td style="font-family:${FONT};padding:7px 14px 7px 0;color:#6B6A7D;font-size:13px;white-space:nowrap">${esc(k)}</td>` +
    `<td style="font-family:${FONT};padding:7px 0;color:#1D1C2A;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join('');

  const html = `${fontFace(host)}<div style="font-family:${FONT};max-width:520px;margin:0 auto;padding:26px 22px">
    <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#4F52D1">BEAVER KNOCK</div>
    <h1 style="margin:8px 0 18px;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#1D1C2A">${esc(subject)}</h1>
    <table style="border-collapse:collapse;width:100%">${body}</table>
    <a href="${host}${link}" style="font-family:${FONT};display:inline-block;margin-top:22px;padding:12px 24px;border-radius:999px;
      background:#4F52D1;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${esc(cta || CTA)}</a>
    <p style="margin:18px 0 0;font-size:11.5px;line-height:1.7;color:#6B6A7D">
      ${esc(note || NOTE)}</p>
  </div>`;

  /* 글자판도 직접 만든다. 맡겨 두면 HTML 에서 뽑아내는데, 그때 <style> 안의 글꼴 선언이
     HTML 을 끈 메일 앱이나 잠금화면 미리보기 첫 줄에 섞여 나올 수 있다.
     빈 값은 HTML 쪽 esc() 와 같이 빈칸으로 - 'undefined' 가 찍히면 안 된다. */
  const text = [subject, '', ...rows.map(([k, v]) => `${k ?? ''}: ${v ?? ''}`), '',
    `${cta || CTA}: ${host}${link}`, '', note || NOTE].join('\n');

  return { from, to: [to], subject: `[비버노크] ${subject}`, html, text };
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

/* 금액은 2026-09-21 부터 원 단위다(SQL 0024). 화면의 won() 과 같은 규칙으로 적는다 -
   메일과 화면이 다른 말을 하면 어느 쪽이 맞는지 알 수 없게 된다. */
export function won(w) {
  const n = Math.round(Number(w) || 0);
  if (!n) return '0';
  const eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4;
  const out = [];
  if (eok) out.push(eok.toLocaleString() + '억');
  if (man) out.push(man.toLocaleString() + '만');
  if (rest) out.push(rest.toLocaleString());
  return out.join(' ');
}
