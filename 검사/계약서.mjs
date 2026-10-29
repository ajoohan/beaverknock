/* 중개사 계약서 (2026-10-29).
   ── 왜 있나 ──
   ① 주민등록번호는 어디에도 저장되면 안 된다. 화면이 칸을 안 만들어도, 특약 글 속에 적거나
      바로 찔러 넣는 길이 있다 - 서버가 모양을 보고 거절해야 한다.
   ② 날인본은 고치지도 지우지도 못한다. 서버는 '작성 중' 인 것만 고치고, 지문은 서버가 DB 의 doc 으로 낸다.
   ③ 문서는 조항을 빼면 번호가 당겨진다. 다른 조항을 가리키는 말이 엉뚱한 번호를 가리키면 안 된다.
   ④ 금액은 숫자와 한글이 같은 말을 해야 한다. 잔금은 보증금에서 계약금·중도금을 뺀 값이다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const C = await import(길.api('_contract.js'));
const html = 길.html(), js = 길.js();

/* ── ① 저장 전 확인 ── */
{
  const 문서 = (o = {}) => ({ schema: 'bk-contract/1', form: 'home-lease', property: { road: '경기도 하남시 미사강변대로 220' }, specials: [], ...o });
  ok(C.docCheck('home-lease', 문서()) === null, '바른 계약서는 통과한다');
  ok(/양식/.test(C.docCheck('car-lease', 문서({ form: 'car-lease' })) || ''), '모르는 양식은 거절한다');
  ok(/형식/.test(C.docCheck('home-lease', 문서({ schema: 'bk-contract/0' })) || ''), '스키마 판이 다르면 거절한다(새로고침 안내)');
  ok(/맞지 않/.test(C.docCheck('home-lease', 문서({ form: 'shop-lease' })) || ''), 'form 과 doc.form 이 다르면 거절한다');
  ok(/주민등록번호/.test(C.docCheck('home-lease', 문서({ parties: { lessor: { name: '홍길동 900101-1234567' } } })) || ''), '주민번호(하이픈)를 거절한다');
  ok(/주민등록번호/.test(C.docCheck('home-lease', 문서({ specials: ['임차인 9001011234567 은 …'] })) || ''), '특약 글 속의 주민번호(붙여 쓴 것)도 거절한다');
  ok(/주민등록번호/.test(C.docCheck('home-lease', 문서({ x: { y: ['외국인 900101 - 5234567'] } })) || ''), '깊은 곳·공백 섞인 외국인등록번호도 거절한다');
  ok(C.docCheck('home-lease', 문서({ parties: { lessor: { phone: '010-1234-5678' } }, deal: { deposit: 150000000 } })) === null,
     '전화번호·금액은 주민번호로 잘못 잡지 않는다');
  ok(C.docCheck('home-lease', 문서({ specials: ['생년월일 900101 확인'] })) === null, '생년월일 6자리만은 막지 않는다');
  ok(/너무 깁/.test(C.docCheck('home-lease', 문서({ specials: ['가'.repeat(30000)] })) || ''), '64KB 를 넘으면 거절한다');
  ok(C.지문({ a: 1, b: { c: [1, 2], d: '가' } }) === C.지문({ b: { d: '가', c: [1, 2] }, a: 1 }) && /^[0-9a-f]{64}$/.test(C.지문({})),
     '지문은 키 순서와 상관없이 같다 (SHA-256)');
}

/* ── ② 서버 갈래를 실제로 돌린다 (DB 는 가로챈다) ── */
{
  const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r; };
  let 불린 = [];
  let 답 = () => new Response('[]', { status: 200 });
  globalThis.fetch = async (u, o = {}) => { 불린.push({ u: String(u), m: o.method || 'GET', b: o.body }); return 답(u, o); };
  process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
  const agent = { id: '11111111-1111-1111-1111-111111111111', role: 'agent' };
  const user = { id: '22222222-2222-2222-2222-222222222222' };
  const doc = { schema: 'bk-contract/1', form: 'home-lease', property: { road: '하남시' }, specials: [] };
  const 돌려 = async (b, a = agent) => { const res = 응답(); 불린 = []; const 처리 = await C.contractRoute({}, res, a, user, b); return { 처리, res }; };

  ok((await 돌려({ what: 'mine' })).처리 === false, "계약서가 아닌 요청은 건드리지 않고 넘긴다");
  ok((await 돌려({ what: 'contracts' }, { ...agent, role: 'owner' })).res.code === 403, '소유자·시행사는 쓸 수 없다(403)');
  ok((await 돌려({ what: 'contracts' }, { ...agent, status: 'new' })).res.code === 200, '승인 전 중개사도 쓴다');

  답 = () => new Response(JSON.stringify([{ id: '33333333-3333-3333-3333-333333333333', updated_at: 't' }]), { status: 201 });
  let { res } = await 돌려({ what: 'contract-save', form: 'home-lease', doc });
  ok(res.code === 200 && 불린[0].m === 'POST' && JSON.parse(불린[0].b).agent_id === agent.id && JSON.parse(불린[0].b).agent_user === user.id,
     '새 계약서는 내 agent_id 로 넣는다');
  ({ res } = await 돌려({ what: 'contract-save', form: 'home-lease', doc: { ...doc, specials: ['900101-1234567'] } }));
  ok(res.code === 400 && 불린.length === 0, '주민번호가 있으면 DB 에 닿기 전에 거절한다');

  ({ res } = await 돌려({ what: 'contract-save', id: '33333333-3333-3333-3333-333333333333', form: 'home-lease', doc }));
  ok(불린[0].m === 'PATCH' && /agent_id=eq\.1111/.test(불린[0].u) && /status=eq\.draft/.test(불린[0].u), '고칠 때는 내 것·작성 중인 것만 고친다');
  답 = () => new Response('[]', { status: 200 });
  ({ res } = await 돌려({ what: 'contract-save', id: '33333333-3333-3333-3333-333333333333', form: 'home-lease', doc }));
  ok(res.code === 409, '날인본(0행)이면 409 - 새 판을 만들라고 한다');

  /* 확정: DB 에 있는 doc 으로 지문을 낸다 - 화면이 보낸 값은 쓰지 않는다 */
  const db도c = { ...doc, property: { road: 'DB 에 저장된 주소' } };
  답 = (u, o) => (o.method || 'GET') === 'GET'
    ? new Response(JSON.stringify([{ id: 'x', status: 'draft', doc: db도c }]), { status: 200 })
    : new Response(JSON.stringify([{ sealed_at: 'now' }]), { status: 200 });
  ({ res } = await 돌려({ what: 'contract-seal', id: '33333333-3333-3333-3333-333333333333', sha256: 'f'.repeat(64), doc }));
  const 보낸 = JSON.parse(불린[1].b);
  ok(res.code === 200 && 보낸.status === 'sealed' && 보낸.sha256 === C.지문(db도c) && res.body.sha256 === C.지문(db도c),
     '확정은 DB 의 doc 으로 서버가 지문을 낸다 (화면이 보낸 지문·doc 은 무시)');
  ok(/status=eq\.draft/.test(불린[1].u), '확정도 작성 중인 것만 바꾼다');
  답 = () => new Response(JSON.stringify([{ id: 'x', status: 'sealed', doc: db도c }]), { status: 200 });
  ok((await 돌려({ what: 'contract-seal', id: '33333333-3333-3333-3333-333333333333' })).res.code === 409, '이미 날인본이면 다시 확정하지 않는다');

  답 = () => new Response('[]', { status: 200 });
  ({ res } = await 돌려({ what: 'contract-del', id: '33333333-3333-3333-3333-333333333333' }));
  ok(불린[0].m === 'DELETE' && /status=eq\.draft/.test(불린[0].u) && res.code === 409, '지우기는 작성 중인 것만 - 날인본이면 409');

  답 = () => new Response(JSON.stringify([{ id: 'old', form: 'home-lease', title: 't', doc: db도c, proposal_id: null }]), { status: 200 });
  ({ res } = await 돌려({ what: 'contract-revise', id: '33333333-3333-3333-3333-333333333333' }));
  ok(JSON.parse(불린[1].b).prev_id === 'old' && JSON.parse(불린[1].b).doc.property.road === 'DB 에 저장된 주소', '새 판은 앞 판을 그대로 베끼고 prev_id 로 잇는다');

  답 = () => new Response('{"code":"PGRST205","message":"Could not find the table bk_contract"}', { status: 404 });
  ({ res } = await 돌려({ what: 'contracts' }));
  ok(res.code === 503 && res.body.need === '0031', '표가 아직 없으면 503 · 0031 마이그레이션 필요를 알린다');
  ok((await 돌려({ what: 'contract', id: 'abc' })).res.code === 400, '번호 모양이 아니면 DB 에 묻지 않는다');
}

/* ── feed.js 에 붙은 자리 ── */
{
  const feed = fs.readFileSync(new URL('../api/feed.js', import.meta.url), 'utf8');
  const i계약 = feed.indexOf('contractRoute(req, res, chk.agent, user, b)'), i가입 = feed.indexOf("if (chk.none)"), i훑기 = feed.indexOf('if (!canBrowse(chk.agent))');
  ok(i계약 > i가입 && i계약 < i훑기, '계약서 갈래는 가입 확인 뒤, 목록 거르기 앞에 있다 - 승인 전 중개사도 닿는다');
}

/* ── 마이그레이션 ── */
{
  const sql = fs.readFileSync(new URL('../../beaverknock-app/supabase/migrations/0031_contract.sql', import.meta.url), 'utf8');
  ok(/enable row level security/.test(sql) && !/create policy/i.test(sql), '표는 RLS 를 켜고 정책을 두지 않는다 - 서버만 닿는다');
  ok(/before update or delete on public\.bk_contract/.test(sql) && /old\.status = 'sealed'/.test(sql), '날인본은 DB 트리거가 고침·지움을 막는다');
  ok(/old\.status = 'sealed'\s+and exists \(select 1 from public\.bk_agent a where a\.id = old\.agent_id\)/.test(sql),
     '중개사 계정이 지워지는 연쇄 삭제는 막지 않는다 - 막으면 탈퇴·파기 자체가 실패한다');
  ok(!/rrn|jumin|주민등록번호\s+text/i.test(sql), '주민번호 칸이 없다');
}

/* ── ③④ 화면 문서 ── */
const 시작 = js.indexOf('/* ══════════ 계약서 (2026-10-29)'), 끝 = js.indexOf('/* ── 화면: 목록 ── */');
const 몸 = js.slice(시작, 끝);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const 모듈 = new Function('S', 'esc', 'apiFetch', '세션있음', 'render', 'toast',
  `${몸}\nreturn { 한글금액, 금액글, ctNewDoc, ctDocHTML, ctBalance, CT_HOME_CLAUSES, CT_SPECIALS };`);
const S = { agent: { office: '비버공인중개사사무소', name: '한상혁', reg_no: '41450-2024-00001', addr: '하남시 미사대로 550', phone: '031-000-0000' } };
const M = 모듈(S, esc, () => {}, () => false, () => {}, () => {});
{
  /* 계약서는 '일천만원정' 처럼 '일' 을 붙여 적는다 - 앞에 글자를 덧붙여 금액을 바꾸지 못하게 */
  ok(M.한글금액(150000000) === '일억오천만' && M.한글금액(1000) === '일천' && M.한글금액(10000) === '일만' && M.한글금액(0) === '',
     '한글 금액: 일억오천만 · 일천 · 일만 ("일" 을 붙인다) · 0 은 빈칸');
  ok(M.한글금액(102030405) === '일억이백삼만사백오' && M.한글금액(1200000000000) === '일조이천억',
     '한글 금액: 사이에 0 이 있어도 · 조 단위도');
  ok(M.금액글(5000000) === '금 오백만원정(₩5,000,000)', '금액 표기는 "금 …원정(₩…)"');
  ok(M.ctBalance({ deposit: 300000000, down: 30000000, mid: 100000000 }) === 170000000 && M.ctBalance({ deposit: 1, down: 5 }) === 0,
     '잔금 = 보증금 - 계약금 - 중도금 (음수면 0)');

  const d = M.ctNewDoc('home-lease');
  ok(d.schema === 'bk-contract/1' && d.broker.office === '비버공인중개사사무소' && d.broker.regNo === '41450-2024-00001',
     '새 계약서는 스키마 판이 붙고 중개사무소 칸이 가입 정보로 채워진다');
  ok(!/rrn|jumin|idno|account|계좌/i.test(JSON.stringify(d)), '새 계약서 데이터에 주민번호·계좌 칸이 없다');
  ok(['road','jibun','admCd','bun','ji','mount'].every(k => k in d.property), '소재지는 법정동코드·본번·부번·산까지 담을 자리가 있다');

  d.deal = { type: 'monthly', deposit: 10000000, down: 1000000, mid: 0, rent: 500000, rentDay: '25' };
  /* 당사자 칸을 채워 둔다 - 비어 있으면 다른 값이 주민번호 칸에 새어 들어가도 똑같이 빈칸으로 보인다 */
  d.parties = { lessor: { name: '김임대', phone: '010-1111-2222', addr: '서울 강남구' }, lessee: { name: '이임차', phone: '010-3333-4444', addr: '하남시' } };
  const h = M.ctDocHTML(d);
  ok(/제3조\(입주 전 수리\)/.test(h) && /제4조\(임차주택의 사용·관리·수선\)/.test(h), '고른 조항은 3조부터 번호가 붙는다(1·2조는 표)');
  ok(/임차인이 2기의 차임액에 이르도록 차임을 연체하거나 제4조 제1항/.test(h), '"{{조:use}}" 는 그 조항의 지금 번호로 바뀐다');
  d.clauses[0].on = false;
  const h2 = M.ctDocHTML(d);
  ok(/제3조\(임차주택의 사용·관리·수선\)/.test(h2) && /연체하거나 제3조 제1항/.test(h2) && !/입주 전 수리/.test(h2),
     '조항을 빼면 번호가 당겨지고, 가리키는 번호도 같이 바뀐다');
  ok(/금 구백만원정\(₩9,000,000\)/.test(h2) && /금 오십만원정\(₩500,000\)/.test(h2) && /매월 25일/.test(h2), '잔금·월세가 숫자와 한글로 함께 나온다');
  ok((h2.match(/주민등록번호<\/th><td><span class="ct-blank" style="min-width:140px"><\/span><\/td>/g) || []).length === 2
     && /김임대/.test(h2) && /010-3333-4444/.test(h2),
     '임대인·임차인 주민등록번호 칸은 늘 빈칸으로 인쇄된다(다른 칸을 채워도)');
  ok(/입금계좌: <span class="ct-blank"/.test(h2), '입금계좌도 빈칸으로 인쇄된다');
  d.specials = ['<script>alert(1)</script>'];
  ok(!/<script>/.test(M.ctDocHTML(d)) && /&lt;script&gt;/.test(M.ctDocHTML(d)), '특약 글은 이스케이프된다');
  d.deal.type = 'jeonse';
  ok(!/차임\(월세\)/.test(M.ctDocHTML(d)), '전세면 월세 줄이 없다');
  ok(M.CT_HOME_CLAUSES.length >= 10 && M.CT_SPECIALS.length >= 10, '기본 조항 열 개 이상 · 특약 모음 열 개 이상');
  ok(!/\d{6}\s*-\s*[1-8]\d{6}/.test(JSON.stringify(M.CT_SPECIALS) + JSON.stringify(M.CT_HOME_CLAUSES)), '기본 문구에 주민번호 모양이 없다');
}

/* ── 약관 · 처리방침 ── */
{
  const 약관 = fs.readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
  const 방침 = fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  ok(/계약서 양식과 작성 · 인쇄 도구<\/b>는 작성을 돕기 위한 참고 자료/.test(약관) && /11월 5일 적용/.test(약관),
     '약관: 양식·도구만 제공하고 내용·신고 책임은 작성자 - 7일 전 게시(11/5 적용)');
  ok(/중개사 계약서 작성 도구<\/dt>/.test(방침) && /주민등록번호와 계좌번호는 받지 않습니다/.test(방침) && /파트너 계정이 지워질 때까지/.test(방침),
     '처리방침: 받는 것 · 받지 않는 것(주민번호·계좌) · 보관 기간을 적었다');
}

/* ── 화면 붙은 자리 ── */
{
  ok(/@media print\{[\s\S]*@page\{size:A4/.test(html) && /html\.printing-ct body > \*:not\(#ctPrint\)\{display:none!important\}/.test(html),
     '인쇄는 A4 · 문서만 찍는다(앱은 감춘다)');
  ok(/\$\{own\?'':`<a data-go="#\/partner\/contracts"/.test(js), '위 메뉴의 계약서 탭은 소유자·시행사에게 없다');
  ok(/\.\.\.\(ownerSide\(\)\?\[\]:\[\['#\/partner\/contracts','계약서','ct'\]\]\)/.test(js), '휴대폰 아래 탭도 중개사에게만 - 다섯 칸을 넘지 않는다');
  ok(/p\.status==='selected' && !ownerSide\(\) \? `<button class="btn pri sm" data-act="ct-from"/.test(js), '연결된 제안에만 "계약서 만들기" 가 있다');
  ok(/ADDR\.for === 'ct-addr' && CT\.doc[\s\S]{0,200}admCd: a\.admCd/.test(js), '주소 검색으로 고르면 법정동코드까지 담는다');
  ok(/if\(k\.startsWith\('ct'\) && ctInput\(el, k\)\) return;/.test(js), '계약서 칸은 글자마다 다시 그리지 않는다');
  ok(/저장하지 않은 고침이 있습니다/.test(js) && /addEventListener\('beforeunload'/.test(js), '저장하지 않고 떠나면 묻는다(화면 이동·창 닫기)');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
