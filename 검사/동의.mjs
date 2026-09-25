/* 동의 — 나중에 "받았는가" 를 물으면 대답할 수 있어야 하는 기록.
   필수(약관·개인정보)와 선택(광고 수신)은 법이 갈라 놓은 것이라 섞으면 안 되고,
   **언제** 동의했는지가 남아야 한다. true/false 로만 두면 철회한 것인지
   처음부터 안 한 것인지도 구분되지 않는다(0023).
   (2026-09-24 에 constest 15건이 임시 폴더 청소로 사라져 다시 썼다) */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const res = () => ({ code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } });
const 사용자 = { id:'11111111-2222-3333-4444-555555555555', email:'a@b.c' };

/* bk_consent 를 흉내 낸다. `있던행` 을 바꿔 가며 '두 번째 저장' 을 재현한다. */
let 있던행 = null, 쓴행 = null, 표없음 = false;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify(사용자), { status:200 });
  if (u.includes('bk_consent')) {
    if (표없음) return new Response('{"message":"relation \\"public.bk_consent\\" does not exist"}', { status:404 });
    if (m === 'POST') { 쓴행 = JSON.parse(opt.body); return new Response('', { status:201 }); }
    return new Response(JSON.stringify(있던행 ? [있던행] : []), { status:200 });
  }
  return new Response('[]', { status:200 });
};

const { default: 내정보 } = await import(길.api('my.js'));
const 부르기 = async body => { 쓴행 = null; const r = res();
  await 내정보({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40), 'user-agent':'node-test' },
    socket:{ remoteAddress:'10.1.2.3' }, body }, r); return r; };

/* ── 필수는 필수다 ── */
ok((await 부르기({ what:'consent', set:{ terms:false, privacy:true } })).code === 400,
   '약관에 동의하지 않으면 저장하지 않는다');
ok((await 부르기({ what:'consent', set:{ terms:true, privacy:false } })).code === 400,
   '개인정보 처리방침에 동의하지 않으면 저장하지 않는다');
ok((await 부르기({ what:'consent', set:{} })).code === 400, '빈 동의는 저장하지 않는다');
ok(쓴행 === null, '막혔을 때는 아무것도 쓰지 않는다');

/* ── 처음 동의 ── */
있던행 = null;
let r = await 부르기({ what:'consent', set:{ terms:true, privacy:true, marketing:false } });
ok(r.code === 200, `처음 동의가 저장된다 (${r.code})`);
ok(!!쓴행.terms_at && !!쓴행.privacy_at, '필수 둘의 시각이 적힌다');
ok(쓴행.marketing_at === null, '광고 수신은 안 했으면 null - 필수와 섞지 않는다');
ok(!!쓴행.marketing_off_at, '거절한 시각도 남긴다 - 안 한 것과 거둔 것을 구분하려면 필요하다');
ok(쓴행.user_id === 사용자.id, '계정에 붙는다');
ok(typeof 쓴행.ua === 'string', '어떤 기기에서 했는지도 남긴다');
ok(!('ip_hash' in 쓴행) || typeof 쓴행.ip_hash === 'string', 'IP 는 날것으로 담지 않는다');

/* ── 광고 수신만 나중에 바꾼다 ── 여기가 이 검사의 핵심이다.
   필수 동의 시각이 지금으로 밀리면 **'언제 동의했는가' 에 답할 수 없게 된다.** */
const 처음 = '2026-09-01T00:00:00.000Z';
있던행 = { user_id:사용자.id, terms_at:처음, privacy_at:처음,
           marketing_at:null, marketing_off_at:처음, created_at:처음 };
r = await 부르기({ what:'consent', set:{ terms:true, privacy:true, marketing:true } });
ok(r.code === 200, '광고 수신을 켜는 저장이 된다');
ok(쓴행.terms_at === 처음,   `약관 동의 시각이 그대로다 - ${쓴행.terms_at}`);
ok(쓴행.privacy_at === 처음, '개인정보 동의 시각도 그대로다');
ok(쓴행.marketing_at && 쓴행.marketing_at !== 처음, '광고 수신 시각은 지금으로 새로 적힌다');
ok(쓴행.marketing_off_at === null, '켰으면 철회 시각은 지운다');

/* ── 켜 두었다가 거둔다 ── 그때가 진짜 철회 시각이다 */
있던행 = { ...있던행, marketing_at:처음, marketing_off_at:null };
r = await 부르기({ what:'consent', set:{ terms:true, privacy:true, marketing:false } });
ok(쓴행.marketing_at === null, '거두면 광고 수신 시각을 지운다');
ok(쓴행.marketing_off_at && 쓴행.marketing_off_at !== 처음, '철회 시각은 **거둔 지금**이다');
ok(쓴행.terms_at === 처음, '이때도 필수 동의 시각은 그대로다');

/* ── 계속 거절인 채로 다시 저장 ── 거절한 시각이 밀리지 않아야 한다 */
const 거절한날 = '2026-09-05T00:00:00.000Z';
있던행 = { ...있던행, marketing_at:null, marketing_off_at:거절한날 };
r = await 부르기({ what:'consent', set:{ terms:true, privacy:true, marketing:false } });
ok(쓴행.marketing_off_at === 거절한날,
   `거절 상태 그대로 저장해도 거절 시각이 안 밀린다 - ${쓴행.marketing_off_at}`);

/* ── 표가 아직 없을 때 ── 동의 화면에 갇혀 서비스를 못 쓰는 것이 더 나쁘다 ── */
표없음 = true;
r = await 부르기({ what:'consent' });
ok(r.code === 200 && r.body.ready === false,
   "표가 없으면 막지 않고 'ready:false' 로 답한다 - 동의 화면에 갇히면 아무것도 못 한다");
r = await 부르기({ what:'consent', set:{ terms:true, privacy:true } });
ok(r.code === 503 && /0023/.test(r.body.error || ''),
   `표가 없는데 저장하려 하면 무엇이 필요한지 말한다 - "${r.body.error}"`);
표없음 = false;

/* ── 조건 접수 쪽 필수 동의 ── 화면만 막으면 막은 게 아니다 ── */
const dj = 길.js();
const 서버 = (await import('node:fs')).readFileSync(
  new URL(길.api('demand.js')), 'utf8');
ok(/b\.agree_third_party !== true \|\| b\.agree_multi_alert !== true/.test(서버),
   '서버가 조건 접수의 필수 동의 둘을 직접 확인한다');
ok(/agree_marketing: b\.agree_marketing === true/.test(서버),
   '광고 수신은 보내온 그대로만 참이 된다 - 기본값으로 켜지지 않는다');
ok(!/agree_marketing:\s*true\b/.test(서버), '광고 수신을 서버가 임의로 켜지 않는다');

/* ── 화면 쪽 ── 필수를 풀면 접힌 것이 다시 펼쳐져야 한다 ── */
ok(/d\.a1 && d\.a2 && !S\.showAgree/.test(dj),
   '필수 둘을 다 해야 동의 칸이 접힌다 - 안 한 것을 접어두면 숨기는 것이다');
ok(/광고/.test(dj) && /선택/.test(dj), '광고 수신을 선택이라고 밝힌다');

/* ── 연결을 끊으면 동의 기록도 함께 지운다 ── (2026-09-25 대표 결정)
   bk_consent 에는 동의 시각과 함께 **어떤 기기에서 했는지(ua)·IP 해시**가 있다.
   연결이 끊어진 뒤에는 들고 있을 근거가 없다 - 더 처리할 것이 없으니
   동의를 증명할 일도 없다. 끊었다는 **사실**은 열람 기록에 남는다. */
const kjs = (await import('node:fs')).readFileSync(
  new URL(길.api('auth/kakao/unlink.js')), 'utf8');
ok(/sbUrl\('bk_consent', `user_id=eq\.\$\{u\.id\}`\)/.test(kjs),
   '연결 해제 때 그 계정의 동의 기록을 지운다');
ok(kjs.indexOf("bk_consent") < kjs.indexOf("admin('users/'"),
   '계정을 지우기 **전에** 지운다 - 계정이 먼저 사라지면 어느 행인지 못 찾는다');
ok(/does not exist\|PGRST205/.test(kjs.slice(kjs.indexOf('bk_consent'), kjs.indexOf('bk_consent')+900)),
   '0023 을 아직 안 돌린 환경이면 넘어간다 - 동의 기록 하나 때문에 계정 삭제가 막히면 안 된다');
ok(/동의 기록 \$\{동의\}건 삭제/.test(kjs),
   '몇 건을 지웠는지 열람 기록에 남긴다 - 그것이 지웠다는 근거다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
