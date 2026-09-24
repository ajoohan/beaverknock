/* 중개대상물 표시·광고 명시사항 — 적게 하는 것으로 끝이 아니다.
   중개사가 적은 것이 **손님 화면까지 닿아야** 표시한 것이다.
   0021 이 칸을 만들었지만, 칸이 생긴 것과 값이 지나가는 것은 다르다 -
   이 프로젝트에서 세 번(입주시기·연식·동) 그 사이로 샜다.
   그래서 화면 → 서버 → 표 → 손님 화면까지 한 줄로 따라간다.
   (2026-09-24 에 adtest 18건이 임시 폴더 청소로 사라져 다시 썼다) */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const res = () => ({ code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } });
let 보낸행 = null;
const 흉내 = 표 => async (url, opt = {}) => {
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

/* 중개사가 명시사항을 빠짐없이 적은 모양 */
const 명시 = { dir:'남동', dirBase:'거실 기준',
  feeBasis:'최근 3개월 평균', feeType:'관리규약에 따라 부과',
  feeItems:'수도료·청소비 포함 / 전기·가스 별도',
  note:'남향 거실이라 오후까지 볕이 듭니다', moveIn:'즉시' };

/* ── ① 매물에 남는가 ── */
globalThis.fetch = 흉내('bk_listing');
const { default: 피드 } = await import(길.api('feed.js'));
const r1 = res();
await 피드({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.1.2.5' },
  body:{ what:'listing-add', listing:{ kind:'home', name:'미사강변 ○○아파트', dong:'미사1동',
    deal:'월세', dep:100000000, rent:650000, fee:120000, area:59.94, areaSup:84.97,
    rooms:3, baths:2, htype:'아파트', floorNo:'12', approved:'2016.06.24', ...명시 } } }, r1);

ok(r1.code === 201, `매물이 등록된다 (${r1.code})`);
const L = 보낸행 || {};
ok(L.dir === '남동',                        `매물에 방향이 남는다 - ${L.dir}`);
ok(L.dir_base === '거실 기준',              `**어디를 기준으로 잰 방향인지**도 남는다 - ${L.dir_base}`);
ok(L.fee_basis === '최근 3개월 평균',        `관리비 산정 기준이 남는다 - ${L.fee_basis}`);
ok(L.fee_type === '관리규약에 따라 부과',     `관리비 부과 방식이 남는다 - ${L.fee_type}`);
ok(String(L.fee_items).includes('전기·가스 별도'), '관리비 포함 비목이 글 그대로 남는다');
ok(L.note === 명시.note,                    '매물 특징이 글 그대로 남는다');
ok(L.move_in === '즉시',                    `입주 가능시기가 남는다 - 전에는 '협의' 로 고정이었다`);
ok(L.approved === '2016.06.24',             '사용승인일도 남는다 (0026)');

/* ── ② 제안에 실려 나가는가 ── 손님이 보는 것은 이쪽이다 */
보낸행 = null;
globalThis.fetch = 흉내('bk_proposal');
const { default: 제안 } = await import(길.api('proposal.js'));
const r2 = res();
await 제안({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
  socket:{ remoteAddress:'10.1.2.6' },
  body:{ demand_id:'11111111-2222-3333-4444-555555555555',
    addr:'경기도 하남시 미사강변대로 220', bname:'미사강변 ○○아파트',
    dep:100000000, rent:650000, fee:120000, area_sup:84.97, area:59.94, rooms:'3', baths:'2',
    dir:'남동', dir_base:'거실 기준', fee_basis:'최근 3개월 평균',
    fee_type:'관리규약에 따라 부과', fee_items:명시.feeItems, note:명시.note,
    floor_mode:'정확한 층', floor_no:'12', move_in:'즉시', park:'전용주차시설',
    approved:'2016.06.24', photos:2, msg:'…' } }, r2);

ok(r2.code === 201, `제안이 접수된다 (${r2.code})`);
const P = 보낸행 || {};
for (const [칸, 값] of [['dir','남동'], ['dir_base','거실 기준'],
                        ['fee_basis','최근 3개월 평균'], ['fee_type','관리규약에 따라 부과'],
                        ['note', 명시.note], ['move_in','즉시'], ['approved','2016.06.24']])
  ok(P[칸] === 값, `제안에 ${칸} 이 실린다 - ${JSON.stringify(P[칸])}`);
ok(String(P.fee_items).includes('전기·가스 별도'), '제안에 관리비 포함 비목이 실린다');
ok(P.park === '전용주차시설', `주차장 표기가 실린다 - ${P.park}`);

/* ── ③ 손님 화면까지 닿는가 ── 여기가 '표시했다' 의 끝이다 */
const js = 길.js();
/* 서버 행 → 손님이 보는 제안 */
const 옮김 = js.slice(js.indexOf('function propFromRow(p){'), js.indexOf('function propFromRow(p){') + 1600);
for (const [읽는것, 나오는것] of [['p.dir_base','dirBase'], ['p.fee_basis','feeBasis'],
                                  ['p.fee_items','feeItems'], ['p.note','note'], ['p.dir','dir']])
  ok(옮김.includes(읽는것) && 옮김.includes(나오는것 + ':'),
     `서버의 ${읽는것} 이 손님 쪽 ${나오는것} 으로 옮겨진다`);
/* 그리고 실제로 그려지는가 */
ok(/kv\('방향', `\$\{p\.dir\}\$\{p\.dirBase\?` \(\$\{p\.dirBase\}\)`:''\}`\)/.test(js)
   || (/kv\('방향'/.test(js) && /p\.dirBase/.test(js)),
   '손님 화면이 방향을 **기준까지 함께** 그린다');
ok(/kv\('관리비 기준', p\.feeBasis\)/.test(js), '손님 화면이 관리비 기준을 그린다');
ok(/kv\('관리비 포함', p\.feeItems\)/.test(js), '손님 화면이 관리비 포함 비목을 그린다');
ok(/p\.note \? `<div class="card pad">/.test(js), '손님 화면이 매물 특징을 따로 한 칸으로 보여준다');

/* ── ④ 보기 밖의 값을 지어내지 않는가 ── */
const 밑 = js.slice(js.indexOf('const DIRS'), js.indexOf('const MOVEIN'));
ok(/DIR_BASE = \['거실 기준','안방 기준','주된 출입구 기준'\]/.test(밑),
   '방향 기준은 법이 말하는 셋뿐이다');
ok(/'표시하지 않음'/.test(밑), "관리비 기준에 '표시하지 않음' 이 있다 - 모르면 모른다고 적을 수 있어야 한다");
ok(/'확인불가'/.test(밑),     "관리비 부과방식에 '확인불가' 가 있다");

/* ── ⑤ 상가는 업종·설비 칩을 쓰지 않는다 (0021 ④⑤ · 0027) ── */
ok(!/data-act="lbiz"/.test(js) && !/data-act="lfac"/.test(js),
   '매물 등록에 업종·설비 칩이 없다 - 매물 특징에 글로 적는다');
ok(/어떤 업종이 되는 자리인지/.test(js),
   '상가 매물 특징 칸 아래에 업종을 적어 달라는 안내가 있다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
