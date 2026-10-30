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

/* ── 같은 번호의 신청이 다른 계정에 있을 때 (2026-10-30) ──
   대표님: "인증하고 신청했는데 왜 또 가입절차가 나오지?" - 카카오로 신청하고 네이버로 들어오면
   '이미 신청하셨습니다' 만 듣고 이 계정은 파트너가 아니어서 가입 화면을 맴돌았다. */
{
  let 내것 = null, 그것 = null, 고친 = null;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url), m = (opt.method || 'GET').toUpperCase();
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'u-2', email:'n@b.c' }), { status:200 });
    if (u.includes('bk_agent')) {
      if (m === 'POST') return new Response('{"code":"23505","message":"duplicate key value violates unique constraint \\"bk_agent_uniq\\""}', { status:409 });
      if (m === 'PATCH') { 고친 = { url: u, body: JSON.parse(opt.body) }; return new Response(null, { status:204 }); }
      /* 계정 확인은 같은 토큰이면 앞 시험의 답(u-1)을 기억해 둘 수 있다 - 어느 계정이든 '이 계정' 으로 본다 */
      if (/user_id=eq.u-/.test(u)) return new Response(JSON.stringify(내것 ? [내것] : []), { status:200 });
      if (u.includes('phone=eq.')) return new Response(JSON.stringify(그것 ? [그것] : []), { status:200 });
    }
    return new Response('[]', { status:200 });
  };
  const { signIdv } = await import(길.api('_idv.js'));
  /* 본인확인 없이(시험 창구) - 손으로 적은 번호로는 남의 신청을 가져올 수 없다 */
  그것 = { id:'a7', name:'한상혁', user_id:'u-1' };
  const 손으로 = await 부르기({ role:'agent', name:'한상혁', phone:'01012345678' });
  ok(손으로.body.already === true && 손으로.body.why === 'phone' && 고친 === null,
     '**본인확인 없이 적은 번호로는 다른 계정의 신청을 옮기지 않는다** - 남의 번호로 승인된 신청을 가져갈 수 있다');
  /* 실계약 본인확인 - 이름·번호가 같으면 같은 사람이다 */
  process.env.PORTONE_LIVE = '1';
  const 표 = signIdv({ name:'한상혁', phone:'01012345678', at: Date.now(), live: true });
  const 이음 = await 부르기({ role:'agent', name:'아무개', phone:'01099999999', idv_token: 표 });
  ok(이음.code === 200 && 이음.body.linked === true && 고친 && /^u-\d$/.test(고친.body.user_id) && /id=eq\.a7/.test(고친.url),
     '본인확인한 이름·번호가 이전 신청과 같으면 그 신청을 지금 계정으로 잇는다');
  고친 = null; 그것 = { id:'a7', name:'김철수', user_id:'u-1' };
  const 다른이름 = await 부르기({ role:'agent', phone:'01012345678', idv_token: 표 });
  ok(다른이름.body.why === 'phone' && 고친 === null, '번호가 같아도 이름이 다르면 잇지 않는다');
  내것 = { id:'a3' };
  const 계정에있음 = await 부르기({ role:'agent', phone:'01012345678', idv_token: 표 });
  ok(계정에있음.body.why === 'account' && 고친 === null,
     '이 계정에 이미 신청이 있으면 어느 인덱스에 걸렸든 "이 계정으로 이미 신청" 이다');
  delete process.env.PORTONE_LIVE;
}

/* ── 화면 쪽 ── 막는 일을 화면에만 맡기지 않는다 ── */
const js = 길.js();
ok(/S\.form\.jLinked = !!j\.linked/.test(js), '화면이 "이전 신청을 이었다" 는 답을 알아듣는다');
ok(/f\.jSent==='already' && f\.jWhy!=='account' \? `[\s\S]{0,400}data-act="logout" data-v="login"/.test(js),
   '다른 계정에 걸린 신청이면 파트너 화면 단추 대신 "다른 방법으로 로그인" 을 준다 - 파트너 화면은 가입으로 되돌아온다');
ok(/const 못읽음 = ok && j\.note === 'lookup-failed';\s*S\.agentKnown = !!ok && !못읽음;/.test(js),
   '서버가 파트너 표를 못 읽었으면(lookup-failed) "파트너 아님" 으로 단정하지 않는다 - 가입으로 튕기지 않게');
ok(/need_login/.test(js), '로그인이 필요하다는 답을 화면이 알아듣는다');
ok(/need_idv/.test(js),   '본인확인이 필요하다는 답도 알아듣는다');
/* ── 들어오는 길 (2026-10-30 대표님 "마이페이지로 가는건 어디있고" · "파트너 로그인으로 가는것도 없고") ── */
ok(js.includes("w==='enter' ? partner + enter"), '첫 화면 상단바에 파트너 로그인과 손님 로그인이 함께 있다');
ok(js.includes("줄('#/account', '마이페이지'") && js.includes('${파트너줄(줄)}'), '이름 메뉴에 마이페이지와 파트너 자리가 있다');
ok(js.includes("V['#/account'] = () =>") && js.includes("h==='#/account'"), '마이페이지 화면이 있고, 로그인이 필요한 화면으로 묶였다');
ok(/data-act="acc-mkt"/.test(js) && /case 'acc-mkt'/.test(js), '마이페이지에서 광고성 정보 수신을 바로 끈다');
ok(/data-act="login-as" data-v="guest"/.test(js) && /data-act="login-as" data-v="partner"/.test(js) && /case 'login-as'/.test(js),
   '로그인 화면에서 손님·파트너를 오갈 수 있다 - 전에는 파트너로만 바꿀 수 있었다');
ok(js.includes(`<a data-go="#/account">\${dzIco('user')}<span>마이페이지</span>`), '파트너 왼쪽 메뉴의 마이페이지는 마이페이지로 간다(전에는 활동 설정으로 갔다)');

/* ── 로그인 열쇠 갱신 (2026-10-30 대표님 "계약서 다 작성하고 저장 눌렀는데 로그인하라고 떠") ──
   열쇠는 1시간이면 끝나는데 갱신을 페이지 열 때만 했다. 오래 쓰다 저장하면 401 이 났다. */
{
  const 뽑기 = head => { const i = js.indexOf(head); let d = 0;
    for(let j = js.indexOf('{', i); j < js.length; j++){ if(js[j]==='{') d++; else if(js[j]==='}'){ d--; if(!d) return js.slice(i, j+1); } } };
  const 만들기 = (첫세션, 서버) => {
    const 기록 = { 갱신: 0, 보낸열쇠: [] };
    let 저장 = 첫세션;
    const store = { get: () => 저장, set: v => { 저장 = v; } };
    const refreshSession = async sess => { 기록.갱신++; await new Promise(r => setTimeout(r, 5));
      if(sess.refresh_token === '죽은것'){ 저장 = null; return null; }
      const next = { access_token: '새열쇠' + 기록.갱신, refresh_token: 'r' + 기록.갱신, expires_at: Math.floor(Date.now()/1000) + 3600 };
      저장 = next; return next; };
    const fetch = async (path, o) => { const t = (o.headers.Authorization || '').replace('Bearer ', ''); 기록.보낸열쇠.push(t);
      return { status: 서버(t), ok: 서버(t) === 200 }; };
    const apiFetch = new Function('store', 'refreshSession', 'fetch',
      `let 갱신중 = null;\n${뽑기('function 열쇠갱신(sess){')}\n${뽑기('async function apiFetch(path, opts){')}\nreturn apiFetch;`)(store, refreshSession, fetch);
    return { apiFetch, 기록, store };
  };
  const 지금초 = () => Math.floor(Date.now()/1000);
  /* ① 곧 끝날 열쇠는 보내기 전에 바꾼다 */
  { const m = 만들기({ access_token: '헌열쇠', refresh_token: 'r0', expires_at: 지금초() + 10 }, t => t.startsWith('새열쇠') ? 200 : 401);
    const r = await m.apiFetch('/api/feed', { method: 'POST', body: '{}' });
    ok(r.status === 200 && m.기록.갱신 === 1 && m.기록.보낸열쇠.join() === '새열쇠1', '곧 끝날 열쇠는 보내기 전에 새로 받는다 - 끝난 열쇠로 저장하지 않는다'); }
  /* ② 시계가 어긋나 아직 남았다고 봤는데 서버가 401 이면 한 번 바꿔 다시 보낸다 */
  { const m = 만들기({ access_token: '헌열쇠', refresh_token: 'r0', expires_at: 지금초() + 3000 }, t => t === '헌열쇠' ? 401 : 200);
    const r = await m.apiFetch('/api/feed', { method: 'POST', body: '{"what":"contract-save"}' });
    ok(r.status === 200 && m.기록.갱신 === 1 && m.기록.보낸열쇠.join() === '헌열쇠,새열쇠1', '401 이 오면 열쇠를 한 번 바꿔 같은 요청을 다시 보낸다'); }
  /* ③ 동시에 여러 요청이 와도 갱신은 한 번 - refresh_token 은 한 번 쓰면 바뀐다 */
  { const m = 만들기({ access_token: '헌열쇠', refresh_token: 'r0', expires_at: 지금초() - 5 }, t => t.startsWith('새열쇠') ? 200 : 401);
    const rs = await Promise.all([1,2,3].map(() => m.apiFetch('/api/my', { method: 'POST', body: '{}' })));
    ok(rs.every(r => r.status === 200) && m.기록.갱신 === 1, '동시에 세 요청이 와도 갱신은 한 번만 한다 - 같은 refresh_token 을 두 번 쓰면 하나가 거절된다'); }
  /* ④ 갱신마저 거절되면(정말 끝난 로그인) 원래 401 을 돌려준다 - 그때는 로그인하라고 하는 것이 맞다 */
  { const m = 만들기({ access_token: '헌열쇠', refresh_token: '죽은것', expires_at: 지금초() + 3000 }, () => 401);
    const r = await m.apiFetch('/api/feed', { method: 'POST', body: '{}' });
    ok(r.status === 401 && m.기록.보낸열쇠.length === 1 && m.store.get() === null, '갱신도 거절되면 401 그대로 - 같은 요청을 끝없이 다시 보내지 않는다'); }
  /* ⑤ 로그인 전이면 갱신하지 않는다 */
  { const m = 만들기(null, () => 401);
    const r = await m.apiFetch('/api/feed', { method: 'POST', body: '{}' });
    ok(r.status === 401 && m.기록.갱신 === 0, '로그인 전 요청은 갱신을 시도하지 않는다'); }
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
