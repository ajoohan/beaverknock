/* 네이버 로그인 마무리 — 네이버 프로필을 Supabase 계정과 세션으로 바꾼다.
 *
 * 흐름
 *   1. state 확인 (쿠키와 대조)
 *   2. code → 네이버 액세스 토큰
 *   3. 토큰 → 네이버 프로필 (이메일·이름)
 *   4. 그 이메일의 Supabase 계정을 만든다. 이미 있으면 있는 대로 쓴다.
 *   5. 매직링크를 발급해 브라우저를 그 링크로 넘긴다
 *      → Supabase 가 세션을 만들어 우리 도메인으로 되돌려 준다.
 *        돌아오는 주소 모양이 구글과 같아서 페이지 쪽 코드를 새로 쓸 필요가 없다.
 *
 * 필요한 환경변수
 *   NAVER_CLIENT_ID · NAVER_CLIENT_SECRET · BK_URL · BK_SECRET_KEY
 */

import { STATE_COOKIE, origin } from './start.js';

const cookies = req => Object.fromEntries(
  String(req.headers.cookie || '').split(';').map(c => {
    const i = c.indexOf('=');
    return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }).filter(([k]) => k)
);

const clearState = res =>
  res.setHeader('Set-Cookie',
    `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

/* 실패해도 사람에게는 로그인 화면으로 돌려보낸다 — 흰 화면에 영문 오류를 남기지 않는다 */
function bail(req, res, msg) {
  clearState(res);
  res.writeHead(302, {
    Location: `${origin(req)}/#error=naver&error_description=${encodeURIComponent(msg)}`,
  });
  res.end();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const { NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, BK_URL, BK_SECRET_KEY } = process.env;
  const missing = ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'BK_URL', 'BK_SECRET_KEY']
    .filter(k => !process.env[k]);
  if (missing.length) return bail(req, res, `서버 설정이 빠졌습니다 (${missing.join(', ')})`);

  const jar = cookies(req);
  const { code, state, error, error_description } = req.query || {};

  if (error) return bail(req, res, error_description || '네이버에서 로그인이 취소되었습니다');
  if (!code || !state) return bail(req, res, '인증 응답이 올바르지 않습니다');
  if (!jar[STATE_COOKIE] || jar[STATE_COOKIE] !== state) {
    return bail(req, res, '인증 요청이 만료되었습니다. 다시 시도해 주세요');
  }

  try {
    /* ── 2. 액세스 토큰 ── */
    const tokUrl = 'https://nid.naver.com/oauth2.0/token'
      + '?grant_type=authorization_code'
      + `&client_id=${encodeURIComponent(NAVER_CLIENT_ID)}`
      + `&client_secret=${encodeURIComponent(NAVER_CLIENT_SECRET)}`
      + `&code=${encodeURIComponent(code)}`
      + `&state=${encodeURIComponent(state)}`;
    const tok = await (await fetch(tokUrl)).json();
    if (!tok.access_token) return bail(req, res, tok.error_description || '네이버 토큰을 받지 못했습니다');

    /* ── 3. 프로필 ── */
    const me = await (await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: 'Bearer ' + tok.access_token },
    })).json();
    const p = me?.response;
    if (!p?.id) return bail(req, res, '네이버 프로필을 받지 못했습니다');
    if (!p.email) return bail(req, res, '이메일 제공에 동의해 주셔야 로그인할 수 있습니다');

    const email = String(p.email).toLowerCase();
    const name = p.name || p.nickname || email.split('@')[0];

    const admin = {
      apikey: BK_SECRET_KEY,
      Authorization: 'Bearer ' + BK_SECRET_KEY,
      'Content-Type': 'application/json',
    };

    /* ── 4. 계정을 만든다. 이미 있으면 그대로 쓴다.
           목록 조회로 먼저 찾지 않는다 — 조회 파라미터는 버전마다 다르고,
           '이미 있음' 응답이 훨씬 확실한 신호다. ── */
    const mk = await fetch(`${BK_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: admin,
      body: JSON.stringify({
        email, email_confirm: true,
        user_metadata: { name, full_name: name, provider: 'naver', naver_id: p.id },
      }),
    });
    if (!mk.ok) {
      const t = await mk.text();
      const already = mk.status === 422 || /already|registered|exists|duplicate/i.test(t);
      if (!already) return bail(req, res, '계정을 만들지 못했습니다: ' + t.slice(0, 90));
    }

    /* ── 5. 세션으로 바꿔 넘긴다 ── */
    const link = await (await fetch(`${BK_URL}/auth/v1/admin/generate_link`, {
      method: 'POST', headers: admin,
      body: JSON.stringify({ type: 'magiclink', email, options: { redirect_to: `${origin(req)}/` } }),
    })).json().catch(() => ({}));
    const hashed = link.hashed_token || link.properties?.hashed_token;
    if (!hashed) return bail(req, res, '세션을 만들지 못했습니다');

    clearState(res);
    /* 돌아오는 주소 모양은 구글과 같다 — 페이지 쪽 readAuthRedirect 가 그대로 받는다 */
    res.writeHead(302, {
      Location: `${BK_URL}/auth/v1/verify?token=${encodeURIComponent(hashed)}`
        + `&type=magiclink&redirect_to=${encodeURIComponent(origin(req) + '/')}`,
    });
    res.end();
  } catch (e) {
    return bail(req, res, '네이버 로그인 중 문제가 생겼습니다');
  }
}
