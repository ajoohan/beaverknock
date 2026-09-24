/* 연락처 — 서비스가 손님에게 한 약속이 걸린 경계.
   "연결을 누르면 **그때** 서로 연락처가 오갑니다."
   누르기 전에 한 글자라도 새면 그 약속이 거짓이 된다. 되돌릴 수도 없다.
   그래서 세 갈래를 다 본다 - 수요 목록 · 중개사의 제안 목록 · 손님의 제안함.
   그리고 **누가 '연결' 을 누를 수 있는가**까지. (2026-09-24) */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const res = () => ({ code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } });

const 손님이름 = '한상혁', 손님번호 = '01012345678';
const 조건 = { id:'11111111-2222-3333-4444-555555555555', kind:'home', dongs:['미사1동'],
  deal:'월세', dep:100000000, rent:650000, slots:5, slots_left:4, returned:false,
  name:손님이름, phone:손님번호, user_id:'손님계정' };

/* 서버가 어떤 칸을 골라 오는지도 재야 한다 - 안 고른 칸은 샐 수가 없다 */
let 고른칸 = [];
const 새는가 = 몸 => {
  const s = JSON.stringify(몸 ?? '');
  return s.includes(손님번호) || s.includes('010-1234-5678') || s.includes(손님이름);
};

/* 제안 id 는 UUID 다 - 아무 글자나 주면 **그 앞에서** 400 으로 막혀,
   정작 재려던 '남의 조건은 못 건드린다' 에 닿지 못한다. */
const 제안ID = '99999999-8888-7777-6666-555555555555';
let 제안상태 = 'sent', 쓴것 = null, 파트너상태 = 'approved';
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'중개사계정', email:'a@b.c' }), { status:200 });
  if (u.includes('bk_agent')) return new Response(JSON.stringify([{ id:'a1', user_id:'중개사계정', role:'agent',
    status:파트너상태, office:'미사중앙', name:'김중개', phone:'01099998888',
    scope_regions:['미사1동'], scope_kinds:['home','shop','office','storage'], scope_set:true }]), { status:200 });
  if (u.includes('bk_demand')) {
    const sel = decodeURIComponent(u).match(/select=([^&]+)/);
    if (sel) 고른칸.push(sel[1]);
    /* 골라 온 칸만 돌려준다 - 실제 DB 가 하는 일을 그대로 흉내 내야
       '안 골랐으니 안 샌다' 를 재는 의미가 있다. */
    const cols = sel ? sel[1].split(',') : Object.keys(조건);
    const row = {}; for (const c of cols) if (c in 조건) row[c] = 조건[c];
    if (!('id' in row)) row.id = 조건.id;
    return new Response(JSON.stringify([row]), { status:200 });
  }
  if (u.includes('bk_proposal')) {
    if (m === 'PATCH') { 쓴것 = JSON.parse(opt.body); return new Response(JSON.stringify([{ id:'p1' }]), { status:200 }); }
    return new Response(JSON.stringify([{ id:제안ID, demand_id:조건.id, agent_id:'a1',
      status:제안상태, connected_at: 제안상태 === 'accepted' ? '2026-09-24T00:00:00Z' : null,
      created_at:'2026-09-20T00:00:00Z', bname:'○○아파트', addr:'경기도 하남시 미사강변대로 220',
      dep:100000000, rent:650000, fee:120000 }]), { status:200 });
  }
  return new Response('[]', { status:200 });
};
const { default: 피드 } = await import(길.api('feed.js'));
const 피드부르기 = async body => { const r = res();
  await 피드({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
    socket:{ remoteAddress:'10.3.3.3' }, body }, r); return r; };

/* ── ① 수요 목록 ── 여기에는 애초에 이름·연락처를 **골라 오지도 않는다** ── */
고른칸 = [];
let r = await 피드부르기({ what:'feed' });
ok(r.code === 200, `수요 목록이 열린다 (${r.code})`);
ok(!새는가(r.body), '**수요 목록에 손님 이름도 번호도 없다**');
const 수요select = 고른칸.find(s => s.includes('dongs')) || '';
ok(수요select && !/\bname\b/.test(수요select) && !/\bphone\b/.test(수요select),
   '이름·연락처는 DB 에서 **골라 오지도 않는다** - 안 가져온 것은 샐 수가 없다');

/* ── ② 자격 전인 파트너 ── 목록은 보되 요약만 본다 ── */
파트너상태 = 'new';
r = await 피드부르기({ what:'feed' });
ok(r.code === 200, '자격 전에도 목록은 본다 - 막아두면 인증할 이유가 안 생긴다');
ok(!새는가(r.body), '자격 전에도 연락처는 당연히 없다');
const 가린줄 = (r.body.rows || [])[0];
ok(!가린줄 || 가린줄.locked === true, '자격 전에는 잠긴 요약으로만 보인다');
ok(!가린줄 || 가린줄.memo === undefined, '자격 전에는 손님이 적은 메모가 안 보인다');
파트너상태 = 'approved';

/* ── ③ 중개사의 제안 목록 ── 연결 전에는 손님이 누구인지 나오지 않는다 ── */
제안상태 = 'sent';
r = await 피드부르기({ what:'mine' });
ok(r.code === 200, `보낸 제안 목록이 열린다 (${r.code})`);
ok(!새는가(r.body), '**연결 전에는 손님 이름도 번호도 안 나간다**');
const 보냄 = (r.body.rows || [])[0] || {};
ok(보냄.cust === null && 보냄.cphone === null, `연결 전 cust·cphone 이 비어 있다 - ${JSON.stringify([보냄.cust, 보냄.cphone])}`);
ok(보냄.dongs === '미사1동', '어느 동네인지는 보여준다 - 제안하려면 알아야 한다');

제안상태 = 'read';
r = await 피드부르기({ what:'mine' });
ok(!새는가(r.body), "손님이 **열어보기만** 했을 때도 안 나간다 - '읽음' 은 연결이 아니다");

제안상태 = 'rejected';
r = await 피드부르기({ what:'mine' });
ok(!새는가(r.body), "'관심 없음' 일 때도 안 나간다");

제안상태 = 'accepted';
r = await 피드부르기({ what:'mine' });
const 연결됨 = (r.body.rows || [])[0] || {};
ok(연결됨.cust === 손님이름 && 연결됨.cphone === 손님번호,
   `**연결한 뒤에야 나간다** - ${연결됨.cust} · ${연결됨.cphone}`);
ok(!!연결됨.connected_at, '언제 연결했는지도 함께 남는다 - 개인정보 제공은 시점이 곧 근거다');

/* ── ④ 누가 '연결' 을 누를 수 있는가 ── 중개사가 스스로 열 수 없어야 한다 ── */
const { default: 제안 } = await import(길.api('proposal.js'));
제안상태 = 'sent'; 쓴것 = null;
const pr = res();
/* 이 요청의 계정은 '중개사계정' 이다. 조건의 주인은 '손님계정' 이라 맞지 않는다 -
   bk_demand 조회에 user_id 조건이 걸려 있어 빈 결과가 와야 한다. */
globalThis.fetch = (orig => async (url, opt = {}) => {
  const u = String(url);
  if (u.includes('bk_demand') && /user_id=eq\./.test(decodeURIComponent(u))
      && !decodeURIComponent(u).includes('user_id=eq.손님계정')) {
    return new Response('[]', { status:200 });           /* 남의 조건이다 */
  }
  return orig(url, opt);
})(globalThis.fetch);

await 제안({ method:'PATCH', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.3.3.4' }, body:{ id:제안ID, status:'accepted' } }, pr);
ok(pr.code === 403,
   `**중개사가 스스로 '연결' 로 바꿀 수 없다** (${pr.code}) - "${pr.body && pr.body.error}"`);
ok(쓴것 === null, '막혔으면 표를 고치지도 않는다 - 연결 시각이 생기지 않는다');

/* ── ⑤ 손님 쪽 제안함 ── 연결 전에는 중개사 연락처도 안 나간다 (양방향이다) ── */
const js = 길.js();
const myjs = (await import('node:fs')).readFileSync(new URL(길.api('my.js')), 'utf8');
ok(/contact: p\.status === 'accepted' \? \(contact\[p\.agent_id\] \|\| null\) : null/.test(myjs),
   '손님 화면도 연결된 제안에만 중개사 연락처를 싣는다 - 약속은 양쪽 모두에게다');
ok(/status === 'accepted'/.test(myjs), '그 판단을 서버가 한다');

/* ── ⑥ 손님이 바꿀 수 있는 상태는 정해져 있다 ── */
const pjs = (await import('node:fs')).readFileSync(new URL(길.api('proposal.js')), 'utf8');
const mine = pjs.match(/const MINE = \[([^\]]+)\]/);
ok(!!mine, '손님이 바꿀 수 있는 상태 목록이 따로 있다');
ok(mine && !/sent/.test(mine[1]), "손님이 '보냄' 으로 되돌릴 수는 없다");
ok(/user_id: 'eq\.' \+ user\.id/.test(pjs),
   '상태를 바꾸기 전에 **그 조건이 내 것인지** 서버가 확인한다');

/* ── ⑦ 화면 쪽 ── 약속을 글로도 말한다 ── */
ok(/연결을 누르면 그때 서로 연락처가 오갑니다/.test(js), '첫 화면이 그 약속을 글로 적어 둔다');
/* 화면 글은 줄이 바뀌어 있다 - 공백을 넘겨 가며 본다 */
ok(/연결된 뒤에\s+직접 알려주시면 됩니다/.test(js), '제안 화면도 같은 말을 한다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
