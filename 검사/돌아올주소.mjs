/* 네이버 로그인이 돌아올 주소 — 여기로 **세션이 실려 온다.**
   `redirect_to` 가 바깥에서 지은 주소가 되면, 로그인한 사람의 토큰이
   그 주소로 간다. Vercel 이 아는 도메인으로만 라우팅하고 Supabase 도
   허용 목록과 대조하니 지금 새는 자리는 아니지만, **기대 둘이 동시에 깨지면
   그대로 뚫리는** 모양이라 여기서 한 번 더 가른다. (2026-09-24 코드리뷰) */
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

delete process.env.BK_SITE;
const { origin } = await import(길.api('auth/naver/start.js'));
const 주소 = (host, fwd) => origin({ headers: fwd ? { 'x-forwarded-host': fwd, host } : { host } });

/* ── 아는 집 ── 그대로 쓴다 ── */
ok(주소('beaverknock.co.kr') === 'https://beaverknock.co.kr', '표준 주소는 그대로');
ok(주소('www.beaverknock.co.kr') === 'https://www.beaverknock.co.kr', 'www 도 그대로');
ok(주소('beaverknock-abc123.vercel.app') === 'https://beaverknock-abc123.vercel.app',
   '미리보기 배포도 그대로 - 여기서 막으면 배포 전 확인을 못 한다');
ok(주소('localhost:3000') === 'http://localhost:3000', '로컬은 http 로');
ok(주소('BEAVERKNOCK.CO.KR') === 'https://beaverknock.co.kr', '대문자로 와도 같은 집이다');

/* ── 모르는 집 ── 표준 주소로 되돌린다 ── */
const 남의집 = [
  'evil.example.com',
  'beaverknock.co.kr.evil.com',          /* 앞부분만 흉내 낸 것 */
  'evil.com/beaverknock.co.kr',
  'vercel.app',                          /* 점 앞이 비었다 */
  'a.b.vercel.app',                      /* 한 단계 더 판 것 */
  'localhost.evil.com',
  '',
];
for (const h of 남의집)
  ok(주소(h) === 'https://' + 'beaverknock.co.kr',
     `'${h || '(빈칸)'}' 은 안 받는다 → ${주소(h)}`);

/* x-forwarded-host 가 host 를 이긴다 - 그쪽도 같은 규칙을 받아야 한다 */
ok(주소('beaverknock.co.kr', 'evil.example.com') === 'https://beaverknock.co.kr',
   'x-forwarded-host 로 바꿔치기해도 안 받는다');
ok(주소('evil.example.com', 'beaverknock.co.kr') === 'https://beaverknock.co.kr',
   'x-forwarded-host 가 아는 집이면 그것을 쓴다');
/* 프록시가 여럿이면 쉼표로 이어 온다 - 맨 앞만 본다 */
ok(주소('x', 'beaverknock.co.kr, evil.example.com') === 'https://beaverknock.co.kr',
   '쉼표로 이어 와도 맨 앞만 본다');

/* ── 못을 박아두면 그것이 이긴다 ── 도메인을 옮길 때 코드를 안 고친다 ── */
process.env.BK_SITE = 'https://new.example.com/';
ok(주소('beaverknock.co.kr') === 'https://new.example.com',
   'BK_SITE 를 두면 그것이 이긴다 (끝의 / 는 뗀다)');
delete process.env.BK_SITE;

/* ── 프로토콜은 헤더에서 받지 않는다 ──
   x-forwarded-proto 를 믿으면 http 로 되돌려 세션이 평문으로 오갈 수 있다. */
const src = (await import('node:fs')).readFileSync(new URL(길.api('auth/naver/start.js')), 'utf8');
ok(!/x-forwarded-proto/.test(src),
   'x-forwarded-proto 를 믿지 않는다 - 아는 집이면 https 인 것을 우리가 안다');

/* ── state 는 매번 새로 나고, 돌아올 때 대조한다 ── */
ok(/randomBytes\(16\)/.test(src), 'state 는 매번 새로 난다');
ok(/HttpOnly; Secure; SameSite=Lax/.test(src), 'state 쿠키는 HttpOnly·Secure·SameSite');
ok(/Max-Age=600/.test(src), 'state 는 10분만 산다');
const cb = (await import('node:fs')).readFileSync(new URL(길.api('auth/naver/callback.js')), 'utf8');
ok(/jar\[STATE_COOKIE\] !== state/.test(cb), '돌아올 때 쿠키와 대조한다 (CSRF)');
ok(cb.indexOf('jar[STATE_COOKIE] !== state') < cb.indexOf('oauth2.0/token'),
   '**대조를 먼저 하고** 그다음에 토큰을 받으러 간다');
ok(/Max-Age=0/.test(cb), '끝나면 state 쿠키를 지운다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
