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

export function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
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
