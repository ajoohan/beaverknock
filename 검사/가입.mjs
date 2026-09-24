/* 파트너 가입과 자격 — **손님 조건 전문이 걸린 문**이다.
   승인된 파트너는 손님이 적어둔 조건을 통째로 본다. 그래서 '누가 열 수 있는가' 는
   화면이 아니라 서버가 정해야 한다.
   ⚠ 2026-09-24 확인 - 서버가 화면이 보내온 `reg_verified:true` 를 **그대로 믿고**
   있었다. 화면을 거치지 않고 그 한 줄만 넣으면 승인된 파트너가 됐다.
   (agtest 9 · approvetest 11 이 임시 폴더 청소로 사라져 다시 쓰면서 나왔다) */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';
delete process.env.GG_API_KEY;          /* 네트워크를 타지 않는다 - 전국 명부만 본다 */
delete process.env.PORTONE_LIVE;

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const { checkShape, lookupReg, regOpens } = await import(길.api('agent-verify.js'));

/* ── 등록번호 생김새 ── 틀린 번호로 문을 두드리는 것부터 막는다 ── */
ok(!checkShape('').ok,            '빈 번호는 통과하지 못한다');
ok(!checkShape('12').ok,          '숫자가 세 자리도 안 되면 통과하지 못한다');
ok(!checkShape('4'.repeat(31)).ok, '너무 길면 통과하지 못한다');
ok(!checkShape('41450@2019#00217').ok, '쓸 수 없는 문자가 있으면 통과하지 못한다');
/* **일부러 느슨하다.** 1980~90년대에 낸 사무소는 '가3665-4' 처럼 전혀 다르게
   생겼다 - 신형만 받으면 오래된 중개사가 자기 진짜 번호를 넣고도 막힌다.
   그래서 형식으로는 가리지 않고 **조회로 가린다**(그 조회를 이제 서버가 한다). */
ok(checkShape('12345').ok && checkShape('12345').form === 'legacy',
   "옛 번호 꼴은 통과시킨다 - 형식이 아니라 조회로 가린다");
ok(checkShape('가3665-4').ok, "'가3665-4' 같은 옛 번호도 통과시킨다");
ok(!checkShape('41450-1970-00217').ok, '등록연도가 1980년보다 이르면 막는다');
ok(!checkShape(`41450-${new Date().getFullYear()+1}-00217`).ok, '아직 오지 않은 연도는 막는다');
const 좋은꼴 = checkShape('41450-2019-00217');
ok(좋은꼴.ok, `제대로 된 번호는 통과한다 - ${JSON.stringify(좋은꼴.value)}`);
ok(좋은꼴.form === 'modern' && 좋은꼴.year === 2019, `신형 번호는 연도까지 읽는다 - ${좋은꼴.year}`);
ok(typeof checkShape('12').reason === 'string' && checkShape('12').reason.length > 4,
   `막을 때는 까닭을 말한다 - "${checkShape('12').reason}"`);

/* ── 서버가 직접 대조한다 ── 여기가 이 검사의 핵심이다 ── */
const 없는번호 = await lookupReg('41450-2019-99999');
ok(없는번호.ok, '형식이 맞으면 대조까지 간다');
ok(없는번호.hit === null, '명부에 없으면 못 찾았다고 한다');
ok(!regOpens(없는번호), '**못 찾은 번호로는 문을 열지 않는다**');
ok(!regOpens(await lookupReg('12345')), '옛 번호 꼴이어도 명부에 없으면 열지 않는다');
ok(!regOpens(null) && !regOpens(undefined), '아무것도 없으면 열지 않는다');
/* 찾았지만 영업 중이 아니면 - 등록은 있지만 지금은 아니다 */
ok(!regOpens({ ok:true, hit:{ office:'○○공인중개사' }, state:'폐업' }), '폐업한 곳은 열지 않는다');
ok(!regOpens({ ok:true, hit:{ office:'○○공인중개사' }, state:'휴업' }), '휴업한 곳은 열지 않는다');
ok(regOpens({ ok:true, hit:{ office:'○○공인중개사' }, state:'영업중' }), '영업 중이면 연다');
ok(regOpens({ ok:true, hit:{ office:'○○공인중개사' }, state:null }),
   '상태가 안 적힌 명부 줄도 연다 - 없는 것을 폐업으로 읽지 않는다');

/* ── 가입 ── 화면이 뭐라고 보내든 서버가 본 것만 남는다 ── */
const res = () => ({ code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } });
let 쓴행 = null, 이미있음 = null;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'u-1', email:'a@b.c' }), { status:200 });
  if (u.includes('bk_agent')) {
    if (m === 'POST') { 쓴행 = JSON.parse(opt.body); return new Response(JSON.stringify([{ id:'a9' }]), { status:201 }); }
    if (m === 'PATCH'){ 쓴행 = JSON.parse(opt.body); return new Response('', { status:204 }); }
    return new Response(JSON.stringify(이미있음 ? [이미있음] : []), { status:200 });
  }
  return new Response('[]', { status:200 });
};
const { default: 가입 } = await import(길.api('agent.js'));
const 부르기 = async body => { 쓴행 = null; const r = res();
  await 가입({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40), 'user-agent':'node-test' },
    socket:{ remoteAddress:'10.9.9.' + Math.floor(Math.random()*200) },
    body:{ elapsed: 9000, website: '', ...body } }, r); return r; };

/* 값 검사 */
ok((await 부르기({ role:'nope', name:'한상혁', phone:'01012345678' })).code === 400, '역할이 없으면 막는다');
ok((await 부르기({ role:'agent', name:'한', phone:'01012345678' })).code === 400, '이름이 한 글자면 막는다');
ok((await 부르기({ role:'agent', name:'한상혁', phone:'0212345678' })).code === 400, '휴대폰이 아니면 막는다');
ok((await 부르기({ role:'agent', name:'한상혁', phone:'01012345678', reg_no:'41450@2019#00217' })).code === 400,
   '적어 보낸 등록번호에 쓸 수 없는 문자가 있으면 막는다');
/* 소유자·시행사는 확인할 실마리가 있어야 한다 */
ok((await 부르기({ role:'owner', owner_type:'corp', name:'한상혁', phone:'01012345678' })).code === 400,
   '법인인데 법인명이 없으면 막는다');
ok((await 부르기({ role:'owner', owner_type:'corp', name:'한상혁', phone:'01012345678', corp_name:'플러스토닉' })).code === 400,
   '법인등록번호도 사업자등록번호도 없으면 막는다');
ok((await 부르기({ role:'owner', owner_type:'trustor', name:'한상혁', phone:'01012345678', corp_name:'○○개발' })).code === 400,
   '위탁자인데 신탁사가 없으면 막는다');
/* 덫(honeypot)과 너무 빠른 제출 */
ok((await 부르기({ role:'agent', name:'한상혁', phone:'01012345678', website:'x' })).body.ok === true,
   '덫에 걸린 요청은 조용히 성공한 척한다 - 무엇이 막았는지 알려주지 않는다');
ok(쓴행 === null, '덫에 걸리면 아무것도 쓰지 않는다');
const 빠름 = await 가입 && (await 부르기({ role:'agent', name:'한상혁', phone:'01012345678', elapsed:100 }));
ok(빠름.code === 429, '사람이 낼 수 없는 속도면 막는다');

/* ⚠ 여기가 문이다 - 화면이 '확인했다' 고 우겨도 서버가 안 믿어야 한다 */
const 우기기 = await 부르기({ role:'agent', name:'한상혁', phone:'01012345678',
  office:'없는공인중개사사무소', reg_no:'41450-2019-99999', reg_verified:true });
ok(우기기.code === 200, '신청 자체는 접수된다 - 자격만 아직 아니다');
ok(쓴행 && 쓴행.status === 'new',
   `**reg_verified:true 를 보내도 승인되지 않는다** - status=${쓴행 && 쓴행.status}`);
ok(쓴행 && 쓴행.reg_verified === false,
   `표에도 '확인됨' 으로 남지 않는다 - reg_verified=${쓴행 && 쓴행.reg_verified}`);

/* 번호를 아예 안 적으면 - 가입은 되고 자격은 나중에 */
const 번호없이 = await 부르기({ role:'agent', name:'한상혁', phone:'01012345678' });
ok(번호없이.code === 200, '등록번호 없이도 가입은 된다 - 가입은 역할과 연락처까지다');
ok(쓴행 && 쓴행.status === 'new', '다만 자격은 열리지 않는다');

/* 소유자는 등록번호가 없다 - 확인할 실마리가 갖춰지면 열린다 */
const 소유자 = await 부르기({ role:'owner', owner_type:'individual', name:'한상혁', phone:'01012345678' });
ok(소유자.code === 200 && 쓴행 && 쓴행.status === 'approved', '개인 소유자는 바로 열린다');
ok(쓴행.reg_verified === false, '소유자에게는 등록번호 확인 표시를 붙이지 않는다');

/* ── 명부가 이기는 칸과 지는 칸 ──
   상호는 '누구인가' 라서 명부가 이긴다. 주소는 연락에 쓰는 값이라 적어 보낸 것이
   이긴다 - 경기 실시간 명부가 주는 주소는 '덕풍동' 한 마디뿐이라, 명부를 먼저
   쓰면 중개사님이 주소 검색으로 고른 정확한 도로명을 덮어쓴다. (2026-09-24 코드리뷰) */
const ajs = (await import('node:fs')).readFileSync(new URL(길.api('agent.js')), 'utf8');
ok(/office:\s+str\(\(look && look\.hit && look\.hit\.office\) \|\| b\.office/.test(ajs),
   '상호는 명부가 먼저다');
ok(/addr:\s+str\(b\.addr \|\| \(look && look\.hit && look\.hit\.addr\)/.test(ajs),
   '**주소는 적어 보낸 것이 먼저다** - 명부가 먼저면 도로명이 동 이름으로 덮인다');
ok(/if \(str\(b\.addr\)\)\s+patch\.addr/.test(ajs), '자격 화면에서도 같은 순서다');

/* ── 자격 따로 받기 (what:'verify') ── 이미 가입한 사람이 번호를 들고 온다 ── */
이미있음 = { id:'a1', user_id:'u-1', role:'agent', status:'new', reg_verified:false };
const 자격우기기 = await 부르기({ what:'verify', reg_no:'41450-2019-99999', reg_verified:true });
ok(자격우기기.code === 400,
   `**자격 화면에서도 우겨서 열 수 없다** - "${자격우기기.body && 자격우기기.body.error}"`);
ok(쓴행 === null, '막혔으면 표를 고치지도 않는다');
const 꼴틀림 = await 부르기({ what:'verify', reg_no:'41450@2019#00217' });
ok(꼴틀림.code === 400, '자격 화면도 생김새부터 본다');
const 옛번호 = await 부르기({ what:'verify', reg_no:'12345' });
ok(옛번호.code === 400, '옛 번호 꼴도 명부에 없으면 열어주지 않는다 - 생김새로는 가리지 않는다');
이미있음 = { id:'a1', user_id:'u-1', role:'agent', status:'approved' };
const 이미열림 = await 부르기({ what:'verify', reg_no:'41450-2019-00217' });
ok(이미열림.code === 200 && 이미열림.body.already === true, '이미 열린 분은 그대로 둔다');

/* ── 화면 쪽 ── 막는 일을 화면에만 맡기지 않는다 ── */
const js = 길.js();
ok(/need_login/.test(js), '로그인이 필요하다는 답을 화면이 알아듣는다');
ok(/need_idv/.test(js),   '본인확인이 필요하다는 답도 알아듣는다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
