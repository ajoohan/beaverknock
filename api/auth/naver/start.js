/* 네이버 로그인 시작 — 네이버 인증 화면으로 넘긴다.
 *
 * 네이버는 Supabase 가 기본으로 제공하지 않는다(구글·카카오는 제공한다).
 * 그래서 인증 왕복을 여기서 직접 돌리고, 마지막에 Supabase 세션으로 바꿔 넘긴다.
 * 돌아갈 화면은 페이지가 sessionStorage 에 남겨 둔다 — 구글과 같은 방식이다.
 *
 * 필요한 환경변수
 *   NAVER_CLIENT_ID       네이버 개발자센터 애플리케이션의 Client ID
 *   NAVER_CLIENT_SECRET   같은 곳의 Client Secret
 */

import crypto from 'node:crypto';

export const STATE_COOKIE = 'bk_nv_state';

/* ── 돌아올 주소는 **아는 집만** ──
   전에는 `x-forwarded-host` 를 그대로 믿었다. 그 헤더는 요청하는 쪽이 붙이는
   값이고, 이 주소로 **세션이 실려 돌아온다**(verify 의 redirect_to).
   지금 당장 새는 자리는 아니다 - Vercel 은 아는 도메인으로만 라우팅하고
   Supabase 도 redirect_to 를 허용 목록과 대조한다. 다만 **기대 둘이 동시에
   깨지면 그대로 뚫리는** 모양이라, 여기서 한 번 더 가른다.
   네이버에 등록한 콜백 주소는 어차피 하나뿐이라, 모르는 집이면 표준 주소로
   되돌려도 잃는 것이 없다.
   BK_SITE 를 두면 그것이 이긴다 - 도메인을 옮길 때 코드를 안 고쳐도 된다. */
const CANON = 'beaverknock.co.kr';
const SITE_OK = h =>
  h === CANON || h === 'www.' + CANON
  || /^[a-z0-9-]+\.vercel\.app$/.test(h)          /* 미리보기 배포 */
  || /^localhost(:\d+)?$/.test(h);

export function origin(req) {
  const pin = String(process.env.BK_SITE || '').trim().replace(/\/+$/, '');
  if (pin) return pin;
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase();
  const host = SITE_OK(raw) ? raw : CANON;
  return `${/^localhost/.test(host) ? 'http' : 'https'}://${host}`;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const { NAVER_CLIENT_ID } = process.env;
  if (!NAVER_CLIENT_ID) {
    res.writeHead(302, {
      Location: `${origin(req)}/#error=naver&error_description=`
        + encodeURIComponent('네이버 로그인이 아직 설정되지 않았습니다'),
    });
    return res.end();
  }

  /* CSRF 방지 — 돌아올 때 이 값이 그대로인지 본다 */
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie',
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  const redirectUri = `${origin(req)}/api/auth/naver/callback`;
  const url = 'https://nid.naver.com/oauth2.0/authorize'
    + '?response_type=code'
    + `&client_id=${encodeURIComponent(NAVER_CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${state}`;

  res.writeHead(302, { Location: url });
  res.end();
}
