/* 호수는 손님에게 가지 않는다 — 되돌릴 수 없는 규칙이라 서버까지 눌러 본다.
   동은 보인다(같은 단지라도 동에 따라 조망·소음·동선이 다르다).
   호는 **특정 세대를 지목하는 값**이라 연결 전에 나갈 이유가 없다. 연락처와 같다.
   ⚠ 화면에서 감추는 것으로는 부족하다 - 조건 번호만 알고 바로 찔러 넣는 길이 있다.
   그래서 **서버가 아예 안 싣는 것**을 확인한다. (0025 · 다시 씀 2026-09-24) */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

let 보낸행 = null;
const 흉내 = (표) => async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'u-1', email:'a@b.c' }), { status:200 });
  if (u.includes('bk_agent')) return new Response(JSON.stringify([{ id:'a1', user_id:'u-1', role:'agent',
    status:'approved', office:'미사중앙', reg_no:'41450-2019-00217',
    scope_regions:['하남시'], scope_kinds:['home','shop','office','storage'], scope_set:true }]), { status:200 });
  if (u.includes('bk_demand')) return new Response(JSON.stringify([{ id:'11111111-2222-3333-4444-555555555555',
    kind:'home', slots:5, slots_left:5, dongs:['미사1동'], deal:'월세', dep:100000000, rent:650000,
    name:'한상혁', phone:'01012345678' }]), { status:200 });
  if (u.includes(표) && m === 'POST') { 보낸행 = JSON.parse(opt.body); return new Response(JSON.stringify([{ id:'x9' }]), { status:201 }); }
  return new Response('[]', { status:200 });
};
const res = () => ({ code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } });

/* ── ① 제안 ── 화면이 호를 보내더라도 서버가 안 실어야 한다 ── */
globalThis.fetch = 흉내('bk_proposal');
const { default: 제안 } = await import(길.api('proposal.js'));
const r1 = res();
await 제안({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.1.2.3' },
  body:{ demand_id:'11111111-2222-3333-4444-555555555555', addr:'경기도 하남시 미사강변대로 220',
    bname:'미사강변 ○○아파트', dep:100000000, rent:650000, fee:120000,
    area_sup:84.97, area:59.94, rooms:'3', baths:'2', dir:'남동', dir_base:'거실 기준',
    floor_mode:'정확히', floor_no:'12', fee_basis:'최근 3개월 평균', fee_type:'확인불가',
    move_in:'즉시', park:'가능', photos:0, msg:'…',
    /* 여기가 핵심이다 - 화면이 호를 보내도 */
    bdong:'101', ho:'1203', htype:'아파트' } }, r1);

ok(r1.code === 201, `제안이 접수된다 (${r1.code})`);
ok(보낸행 !== null, '제안 행이 실제로 나갔다');
ok(!('ho' in 보낸행), '**제안 행에 호가 없다** - 화면이 보내도 서버가 버린다');
ok(보낸행.bdong === '101', `동은 그대로 간다 - ${보낸행.bdong}`);
ok(보낸행.htype === '아파트', `주택 유형도 간다 - ${보낸행.htype}`);
ok(!JSON.stringify(보낸행).includes('1203'), '행 어디에도 호수 숫자가 없다');

/* ── ② 매물 ── 매물에는 호를 받아 둔다(중개사·운영자만 본다) ── */
보낸행 = null;
globalThis.fetch = 흉내('bk_listing');
const { default: 피드 } = await import(길.api('feed.js'));
const r2 = res();
await 피드({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.1.2.4' },
  body:{ what:'listing-add', listing:{ kind:'home', name:'미사강변 ○○아파트', dong:'미사1동',
    deal:'월세', dep:100000000, rent:650000, area:59.94, areaSup:84.97, rooms:3, baths:2,
    htype:'아파트', bdong:'101', ho:'1203', floorNo:'12', moveIn:'즉시' } } }, r2);

ok(r2.code === 201, `매물이 등록된다 (${r2.code})`);
ok(보낸행 && 보낸행.ho === '1203', `매물에는 호를 받아 둔다 - ${보낸행 && 보낸행.ho} (어느 집인지 헷갈리지 않으시도록)`);
ok(보낸행 && 보낸행.bdong === '101', '매물에 동도 받아 둔다');

/* ── ③ 화면 쪽 ── 제안으로 넘어가는 길에 호가 실리지 않는가 ── */
const js = 길.js();
/* 물건에서 제안으로 불러오는 자리 */
const 불러오기 = js.slice(js.indexOf("case 'propose-with'"), js.indexOf("case 'propose-with'") + 1400);
ok(!/lho\s*:/.test(불러오기) && !/pho\s*:/.test(불러오기),
   '물건에서 제안으로 불러올 때 호를 들고 가지 않는다 - 들고만 있어도 언젠가 섞인다');
/* 제안 payload */
const 보내기 = js.slice(js.indexOf("apiFetch('/api/proposal'"), js.indexOf("apiFetch('/api/proposal'") + 1600);
ok(!/\bho\s*:/.test(보내기), '제안 payload 에 호 칸이 없다');
/* 제안 화면에 호를 적는 칸이 아예 없어야 한다 */
ok(!/data-in="pho"/.test(js) && !/data-in="ho"/.test(js), '제안 화면에 호를 적는 칸이 없다');
/* 매물 등록에는 있어야 한다 - 그리고 안 보인다고 말해 주어야 한다 */
ok(/data-in="lho"/.test(js), '매물 등록에는 호 칸이 있다');
ok(/호 <span class="opt">손님에게는 보이지 않습니다<\/span>/.test(js),
   '매물 등록의 호 칸이 **손님에게 보이지 않는다고 말해 준다**');

/* ── ④ 손님이 보는 제안 화면에 호가 그려지지 않는가 ── */
ok(!/p\.ho\b/.test(js), '손님 제안 화면이 호를 그리지 않는다');
ok(/p\.bdong/.test(js), '손님 제안 화면은 동은 그린다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
