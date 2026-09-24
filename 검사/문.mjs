/* 문 — 운영 화면과 본인확인.
   운영 화면은 **전체 계정의 메일 주소**와 중개사 이름·연락처를 내보낸다.
   본인확인은 로그인 없이 열려 있고, 한 번 부를 때마다 우리 열쇠로 포트원을
   두드린다. 둘 다 '누가 들어올 수 있는가' 를 서버가 정해야 하는 자리다.
   ⚠ 2026-09-24 확인 - 시험 기간에는 **명단에 없는 계정이 암호 없이** 들어왔다.
   까닭으로 적힌 말은 '명단을 통과한 사람만 여기까지 온다' 였는데,
   그 손님(guest)은 바로 그 명단을 건너뛴 경로였다. */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.BK_OPS_PASS = '진짜암호';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const A = await import(길.api('_auth.js'));

/* 로그인한 '아무개' - 가입만 하면 누구나 이 자리에 설 수 있다 */
const 나그네 = { id: 'u-아무개', email: 'stranger@example.com' };
const 대표 = { id: 'u-대표', email: 'boss@plustonic.com' };
/* ⚠ userFrom 은 **토큰으로 캐시한다.** 신분을 바꿔 가며 재려면 토큰도 바꿔야
   한다 - 같은 토큰을 돌려 쓰면 처음 붙은 사람이 끝까지 따라다닌다.
   (여기서 세 번 헛디뎠다) */
let 누구 = 나그네;
globalThis.fetch = async u => String(u).includes('/auth/v1/user')
  ? (누구 ? new Response(JSON.stringify(누구), { status: 200 })
          : new Response('{}', { status: 401 }))
  : new Response('[]', { status: 200 });
let 표번호 = 0;
const req = () => ({ headers: { authorization: 'Bearer ' + String(++표번호).padStart(40, 'y') },
                     socket: { remoteAddress: '1.2.3.4' } });

const 문 = async (명단, 기간) => {
  process.env.BK_OPS_USERS = 명단 || '';
  if (기간) process.env.BK_OPS_OPEN_UNTIL = 기간; else delete process.env.BK_OPS_OPEN_UNTIL;
  const g = await A.opsAccount(req());
  return { 막힘: g.error ? g.code : null, member: !!g.member, guest: !!g.guest,
           암호: g.error ? null : A.opsNeedsPass(g) };
};
const 내일 = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const 어제 = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

/* ── 명단이 비어 있을 때 ── 암호가 유일한 문이다 ── */
let g = await 문('', null);
ok(g.암호 === true, '명단이 비어 있으면 암호를 묻는다 - 그 하나를 놓치면 그냥 열린다');
g = await 문('', 내일);
ok(g.암호 === true, '명단이 비어 있으면 **기간이 열려 있어도** 암호를 묻는다');

/* ── 명단이 있을 때 ── */
누구 = 나그네;
g = await 문('boss@plustonic.com', null);
ok(g.막힘 === 403, '명단 밖 계정은 막힌다 (403)');

누구 = 대표;
g = await 문('boss@plustonic.com', null);
ok(g.member === true && g.암호 === false,
   '명단에 든 계정은 암호를 안 묻는다 - 대표님이 직접 적어 넣은 계정이라 로그인이 더 강한 문이다');

/* ⚠ 여기가 이 검사의 핵심 ⚠ */
누구 = 나그네;
g = await 문('boss@plustonic.com', 내일);
ok(g.guest === true, '시험 기간이면 명단 밖 계정도 들이기는 한다 (손님)');
ok(g.암호 === true,
   '**그 손님에게는 암호를 묻는다** - 가입만 한 사람에게 전체 계정 메일을 열어주면 안 된다');

g = await 문('boss@plustonic.com', 어제);
ok(g.막힘 === 403, '기간이 지나면 서버가 스스로 닫는다 - 닫는 일을 사람에게 맡기지 않는다');

/* ── 열어두는 기간에도 한도가 있다 ── 잊혀진 문은 반년씩 열려 있다 ── */
process.env.BK_OPS_OPEN_UNTIL = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
ok(A.opsOpenUntil() === null, '30일 넘게 앞을 적으면 무시한다 - 그런 값은 대개 오타다');
process.env.BK_OPS_OPEN_UNTIL = '아무말';
ok(A.opsOpenUntil() === null, '날짜가 아니면 열리지 않는다');
process.env.BK_OPS_OPEN_UNTIL = 내일;
ok(typeof A.opsOpenUntil() === 'number', '제대로 된 날짜는 읽는다');
delete process.env.BK_OPS_OPEN_UNTIL;

/* ── 로그인하지 않은 요청 ── 암호를 시험할 기회조차 주지 않는다 ── */
누구 = null;
g = await 문('boss@plustonic.com', 내일);
ok(g.막힘 === 401, '로그인 안 한 요청은 401 - 암호를 시험해 볼 기회를 주지 않는다');

/* ── 본인확인 ── 로그인 없이 열린 문이라 빗장이 필요하다 ── */
const ijs = (await import('node:fs')).readFileSync(new URL(길.api('idv.js')), 'utf8');
ok(/function tooMany\(req\)/.test(ijs),
   '본인확인에 빗장이 있다 - 한 번 부를 때마다 우리 열쇠로 포트원을 두드린다');
ok(/if \(tooMany\(req\)\) \{[\s\S]{0,120}429/.test(ijs), '넘치면 429 로 돌려보낸다');
/* 'tooMany(req)' 는 함수를 **정의하는** 자리에도 있다 - 부르는 자리를 찾아야 한다 */
ok(ijs.indexOf('!/^[A-Za-z0-9_-]+$/.test(id)') < ijs.indexOf('if (tooMany(req))'),
   '생김새를 본 **뒤에** 센다 - 오타로 되돌아온 것까지 세면 잘못 누른 분이 잠긴다');
ok(/j\.status !== 'VERIFIED'/.test(ijs),
   '브라우저 말을 믿지 않고 포트원에 다시 물어 통과했는지 본다');
ok(ijs.indexOf("j.status !== 'VERIFIED'") < ijs.indexOf('claimOnce(id)'),
   '통과한 것을 확인한 **다음에** 번호를 잡는다 - 실패한 시도까지 태우면 다시 못 받는다');
ok(/이미 사용된 본인확인입니다/.test(ijs),
   '같은 거래번호로 두 번 표를 끊어주지 않는다 - 주소창에 그대로 남는 값이다');
ok(!/console\.(log|error)\([^)]*\b(ci|di)\b/.test(ijs), 'CI·DI 는 로그에도 남기지 않는다');

/* ── 표(token) ── 서명과 유효기간 ── */
const I = await import(길.api('_idv.js'));
const 표 = I.signIdv({ name: '한상혁', phone: '01012345678', birth: '19850101' });
ok(!!I.readIdv(표), '제대로 끊은 표는 읽힌다');
ok(I.readIdv(표 + 'x') === null, '뒤에 한 글자만 붙여도 읽히지 않는다');
ok(I.readIdv(표.replace(/\.[^.]+$/, '.AAAA')) === null, '서명을 갈아끼우면 읽히지 않는다');
ok(I.readIdv('아무말') === null, '표가 아닌 것은 읽히지 않는다');
ok(I.readIdv(null) === null && I.readIdv(undefined) === null, '없는 표도 읽히지 않는다');
/* 이름이나 번호가 빠진 표는 쓸모가 없다 - 그것 때문에 끊는 표다 */
ok(I.readIdv(I.signIdv({ name: '한상혁' })) === null, '번호가 없는 표는 읽히지 않는다');
ok(I.readIdv(I.signIdv({ phone: '01012345678' })) === null, '이름이 없는 표는 읽히지 않는다');
/* 30분 */
const 옛표 = I.signIdv({ name: '한상혁', phone: '01012345678' });
const 진짜Now = Date.now;
Date.now = () => 진짜Now() + 31 * 60 * 1000;
ok(I.readIdv(옛표) === null, '30분이 지난 표는 읽히지 않는다');
Date.now = 진짜Now;
ok(!!I.readIdv(옛표), '시간을 되돌리면 다시 읽힌다 - 막은 것은 시간이지 표가 아니다');
/* 다른 열쇠로 끊은 표 */
const 본래열쇠 = process.env.BK_SECRET_KEY;
process.env.BK_SECRET_KEY = 'z'.repeat(40);
ok(I.readIdv(표) === null, '다른 열쇠로는 읽히지 않는다');
process.env.BK_SECRET_KEY = 본래열쇠;

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
