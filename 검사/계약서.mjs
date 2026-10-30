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
const html = 길.html(), js = 길.js(), css = 길.css();

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
  /* 2026-10-29 리뷰: 다른 구분자·전각 숫자·숫자 값·키로 넣으면 빠져나갔다 */
  const 막힘 = o => /주민등록번호/.test(C.docCheck('home-lease', 문서(o)) || '');
  ok(막힘({ specials: ['900101.1234567'] }) && 막힘({ specials: ['900101-1 234567'] }) && 막힘({ specials: ['９００１０１－１２３４５６７'] })
     && 막힘({ specials: ['900101—2345678'] }) && 막힘({ n: 9001011234567 }) && 막힘({ x: { '9001011234567': 1 } }),
     '점·공백 쪼개기·전각 숫자·em dash·숫자 값·키로 넣은 주민번호도 거절한다');
  ok(C.docCheck('home-lease', 문서({ specials: ['연락처 010-1234-5678, 010-9876-5432', '보증금 1,500,000 / 2,000,000 원', '2026-10-29 14:30 잔금',
       '임대인 연락처 010-1234-5678, 25일까지', '010-2345-6789\n12. 잔금은', '01012345678 / 25'] })) === null
     && C.docCheck('home-lease', 문서({ specials: ['9913011234567'] })) === null,
     '전화번호 둘 · 금액 나열 · 날짜시각 · 13월 같은 말 안 되는 생년월일은 잡지 않는다');
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
  /* 읽은 뒤 다른 창의 저장이 끼어들면 지문과 잠기는 doc 이 어긋난다 - 읽은 updated_at 그대로일 때만 잠근다 */
  답 = (u, o) => (o.method || 'GET') === 'GET'
    ? new Response(JSON.stringify([{ id: 'x', status: 'draft', doc: db도c, updated_at: '2026-10-29T03:00:00.123456+00:00' }]), { status: 200 })
    : new Response('[]', { status: 200 });
  ({ res } = await 돌려({ what: 'contract-seal', id: '33333333-3333-3333-3333-333333333333' }));
  ok(불린[1].u.includes('updated_at=eq.2026-10-29T03%3A00%3A00.123456%2B00%3A00') && res.code === 409 && /다시 열어/.test(res.body.error),
     '확정은 읽었을 때의 updated_at 이 그대로일 때만 잠근다(+ 는 %2B 로) - 그 사이 저장됐으면 409');

  /* 연결된 제안은 내 제안일 때만 잇는다 */
  const 제안 = '44444444-4444-4444-4444-444444444444';
  답 = u => /bk_proposal/.test(u) ? new Response('[]', { status: 200 }) : new Response(JSON.stringify([{ id: 'n', updated_at: 't' }]), { status: 201 });
  ({ res } = await 돌려({ what: 'contract-save', form: 'home-lease', doc, proposal_id: 제안 }));
  ok(/bk_proposal\?.*agent_id=eq\.1111/.test(불린[0].u) && JSON.parse(불린[1].b).proposal_id === null, '남의 제안 번호면 잇지 않는다(null)');
  답 = u => /bk_proposal/.test(u) ? new Response(JSON.stringify([{ id: 제안 }]), { status: 200 }) : new Response(JSON.stringify([{ id: 'n', updated_at: 't' }]), { status: 201 });
  ({ res } = await 돌려({ what: 'contract-save', form: 'home-lease', doc, proposal_id: 제안 }));
  ok(JSON.parse(불린[1].b).proposal_id === 제안, '내 제안이면 잇는다');
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
/* 확인·설명서 모듈 - 표(EX_SPEC)와 그리기. 작성 화면 함수(exChips 아래)는 빼고 꺼낸다 */
const 확시작 = js.indexOf('/* ══════════ 중개대상물 확인·설명서 [Ⅰ]~[Ⅳ]'), 확끝 = js.indexOf('/* ── 작성 화면 ── 같은 표에서 칸을 만든다 */');
const 확몸 = js.slice(확시작, 확끝);
const 신시작 = js.indexOf('/* ══════════ 거래신고 도우미'), 신끝 = js.indexOf('/* 계약서 입력 - 글자마다');
const 신몸 = js.slice(신시작, 신끝);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const 모듈 = new Function('S', 'esc', 'apiFetch', '세션있음', 'render', 'toast',
  `${몸}\n${확몸}\n${신몸}\nreturn { rpItems, rp기한, rp대상, rpHTML, RP_직접, 한글금액, 금액글, ctNewDoc, ctDocHTML, ctBalance, CT_HOME_CLAUSES, CT_SPECIALS, CT_FORMS, exNewDoc, exDocHTML, EX_SPEC, EX_FORMS, exFormFor,
  CT, ctSave, ctLoadList, ctOpen, exSwitch, exKeys, exLost, ctTitle, ct신고, ct군, ctClauseSet, ctSpecialSet, CT_CATS, ctFieldRows,
  ct일정목록, ct알림설정, ct영업일째, ct영업일전, CT_공휴일 };`);
const S = { route: '#/x', agent: { office: '비버공인중개사사무소', name: '한상혁', reg_no: '41450-2024-00001', addr: '하남시 미사대로 550', phone: '031-000-0000' } };
const M = 모듈(S, esc, () => {}, () => false, () => {}, () => {});

/* ── 저장·열기·목록 - 서버 답을 흉내 내 실제로 돌린다 (2026-10-29 리뷰) ── */
{
  let api = () => Promise.reject(new Error('x'));
  globalThis.location = { hash: '' }; globalThis.history = { replaceState() {} };
  const M2 = 모듈(S, esc, (...a) => api(...a), () => true, () => {}, () => {});
  const C2 = M2.CT, 답 = (o, s = 200) => Promise.resolve(new Response(JSON.stringify(o), { status: s }));
  const id = '33333333-3333-3333-3333-333333333333';
  C2.doc = M2.ctNewDoc('home-lease'); C2.id = id; C2.row = { id, status: 'draft' }; C2.rev = 5; C2.dirty = true; C2.list = [];
  api = () => { C2.rev++; return 답({ ok: true, id, updated_at: 't2' }); };   /* 답이 오기 전에 한 글자 더 쳤다 */
  ok(await M2.ctSave(true) === false && C2.dirty === true, '저장하는 사이 고친 게 있으면 "저장됨" 으로 바꾸지 않는다 (확정도 멈춘다)');
  api = () => 답({ ok: true, id, updated_at: 't3' });
  ok(await M2.ctSave(true) === true && C2.dirty === false && C2.list.length === 1 && C2.list[0].id === id && C2.list[0].status === 'draft',
     '고친 게 없으면 저장됨 · 목록을 비우지 않고 바로 반영한다 (같은 제안으로 초안이 또 생기지 않게)');

  C2.list = null; C2.loading = false; C2.failAt = 0;
  api = () => 답({ error: '잠시 문제' }, 502);
  await M2.ctLoadList();
  ok(C2.list === null && C2.err === '잠시 문제', '목록 불러오기가 실패하면 빈 목록(0건)으로 두지 않는다');
  let 불림 = 0; api = () => { 불림++; return 답({ ok: true, rows: [{ id: 'a' }] }); };
  await M2.ctLoadList();
  ok(불림 === 0, '실패 뒤 30초는 그릴 때마다 다시 묻지 않는다');
  await M2.ctLoadList(true);
  ok(불림 === 1 && C2.list.length === 1 && C2.err === '', '다시 불러오기는 바로 묻고, 되면 오류를 지운다');

  location.hash = '#/partner/contract/B'; C2.id = null; C2.doc = null;
  api = () => 답({ ok: true, row: { id: 'A', doc: { form: 'home-lease' } } });
  M2.ctOpen('A'); await new Promise(r => setTimeout(r, 20));
  ok(C2.id === null && C2.doc === null, 'A 를 연 뒤 B 로 옮겼으면 늦게 온 A 답으로 화면을 덮지 않는다');
}

/* 확인·설명서 서식 바꾸기 - 새 서식에 없는 칸은 지운다 */
{
  const d = M.exNewDoc(null, 'explain-biz');
  d.house = '공업용'; d.deal = '그 밖의 경우'; d.ex.guard = '있음'; d.ex.mgr = '자체관리'; d.ex.price = 500000000;
  M.exSwitch(d, 'explain-land');
  ok(d.form === 'explain-land' && !('guard' in d.ex) && !('mgr' in d.ex) && d.house === '' && d.deal === '' && d.ex.price === 500000000,
     '비주거용 → 토지: 토지 서식에 없는 칸(경비실·관리주체)·머리 선택지는 지우고 금액은 둔다');
  ok(Object.keys(M.EX_FORMS).every(f => M.exKeys(f).has('ex.price')) && M.exKeys('explain-home').has('ex.feeTotal') && !M.exKeys('explain-biz').has('ex.feeTotal'),
     '거래예정금액은 네 서식 모두 쓴다(바꿔도 남는다) · 관리비(feeTotal)는 주거용에만 있다');
  const e = M.exNewDoc(null, 'explain-home'); e.deal = '임대';
  M.exSwitch(e, 'explain-biz');
  ok(e.deal === '임대', '새 서식에도 있는 선택지는 그대로 둔다');
}
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

/* ── 상가건물 임대차 · 부동산 매매 (2026-10-29 두 번째 묶음) ── */
{
  ok(C.CT_FORMS.join() === Object.keys(M.CT_FORMS).join(), '서버가 받는 양식과 화면의 양식이 같다 (주택임대차·상가건물 임대차·매매)');
  ok(C.docCheck('sale', { schema: 'bk-contract/1', form: 'sale', property: {}, specials: [] }) === null
     && C.docCheck('shop-lease', { schema: 'bk-contract/1', form: 'shop-lease', property: {}, specials: [] }) === null, '서버가 두 양식을 받는다');

  /* 다른 조항을 가리키는 말이 실제 있는 조항으로 이어지는가 - 셋 다 */
  for (const [k, F] of Object.entries(M.CT_FORMS)) {
    if (F.explain) continue;                 /* 법정 서식 - 조항이 없다(아래 따로 본다) */
    const ids = new Set(F.clauses.map(c => c.id));
    const 가리킴 = F.clauses.flatMap(c => [...c.text.matchAll(/\{\{조:([a-z]+)\}\}/g)].map(m => m[1]));
    ok(가리킴.every(id => ids.has(id)) && new Set(F.clauses.map(c => c.id)).size === F.clauses.length,
       `${F.ko}: 조항 번호 가리킴이 모두 있는 조항이다 · 조항 이름이 겹치지 않는다`);
    /* 처음 셋은 열 개 이상, 2026-10-30 에 넣은 양식은 세 개 이상(자주 쓰는 특약은 내 문구함으로 채운다) */
    const 최소 = ['home-lease', 'shop-lease', 'sale'].includes(k) ? 10 : 3;
    ok(!/\d{6}\s*-\s*[1-8]\d{6}/.test(JSON.stringify(F.specials) + JSON.stringify(F.clauses)) && F.specials.length >= 최소, `${F.ko}: 특약 모음 ${최소}개 이상 · 주민번호 모양 없음`);
  }

  const 가게 = M.ctNewDoc('shop-lease');
  ok(가게.deal.type === 'monthly' && 가게.deal.vat === '별도' && 'use' in 가게.property && 가게.parties.lessor && 가게.parties.lessee,
     '상가: 늘 월세 · 부가세 별도가 기본 · 용도(업종) 칸 · 임대인/임차인');
  가게.deal = { ...가게.deal, deposit: 30000000, down: 3000000, rent: 2000000, rentDay: '5' };
  가게.property.use = '일반음식점';
  const g = M.ctDocHTML(가게);
  ok(/상 가 건 물 임 대 차 계 약 서/.test(g) && /3기의 차임액/.test(g) && /전체 임대차기간이 10년/.test(g) && /100분의 5/.test(g),
     '상가: 3기 연체 해지 · 10년 갱신 · 5% 증액 상한');
  ok(/권리금 회수기회 보호/.test(g) && /금 이백만원정\(₩2,000,000\)\(부가가치세 별도\)/.test(g) && /용도\(업종\)<\/th><td colspan="5">일반음식점/.test(g),
     '상가: 권리금 조항 · 차임 부가세 표시 · 업종 줄');
  ok(!/선순위 확정일자/.test(g) && /상가건물 임대차보호법 제10조 계약갱신요구권/.test(g), '상가: 선순위 확정일자 줄은 없고, 갱신 근거는 상가건물 임대차보호법');

  const 매 = M.ctNewDoc('sale', { deal: { price: 900000000 }, lessee: { name: '박매수', phone: '010-5555-6666' } });
  ok(매.deal.price === 900000000 && !('kind' in 매) && 매.parties.seller && 매.parties.buyer.name === '박매수',
     '매매: 매매대금 칸 · 계약 종류 없음 · 비버노크 손님은 매수인 자리로');
  매.deal = { ...매.deal, down: 90000000, mid: 300000000, midDate: '2026-11-20', balanceDate: '2026-12-30' };
  const m = M.ctDocHTML(매);
  ok(/부 동 산 매 매 계 약 서/.test(m) && /매도인과 매수인은 아래 표시 부동산에 관하여 다음과 같이 매매계약을 맺는다/.test(m), '매매: 제목·머리말');
  ok(/금 오억일천만원정\(₩510,000,000\)/.test(m) && /제2조\(소유권 이전 등\)[^<]*<\/b>[^<]*2026년 12월 30일에 인도한다/.test(m),
     '매매: 잔금 = 매매대금 - 계약금 - 중도금 · 인도일을 비우면 잔금일');
  ok(/계약금을 손해배상의 기준으로 본다/.test(m) && /계약 체결일부터 30일 안에 부동산 거래신고/.test(m) && /대지권<\/th>/.test(m),
     '매매: 계약금 손해배상 기준 · 거래신고 30일 조항 · 대지권 줄');
  ok(!/임차할 부분/.test(m) && !/보증금/.test(m) && (m.match(/주민등록번호<\/th><td><span class="ct-blank" style="min-width:140px"><\/span><\/td>/g) || []).length === 2
     && /<th rowspan="2" class="w">매도인<\/th>/.test(m) && /<th rowspan="2" class="w">매수인<\/th>/.test(m),
     '매매: 임차·보증금 말이 없고, 매도인·매수인 서명 칸 · 주민번호는 둘 다 빈칸');
  {
    const 식 = (js.match(/const form = (r\.deal[^;]*);/) || [])[1];
    const 고름 = 식 && new Function('r', 'return ' + 식);
    ok(고름 && 고름({ kind:'home', deal:'매매' }) === 'sale' && 고름({ kind:'shop', deal:'매매' }) === 'sale' && 고름({ kind:'land', deal:'매매' }) === 'sale'
       && 고름({ kind:'home', deal:'월세' }) === 'home-lease' && 고름({ kind:'shop', deal:'월세' }) === 'shop-lease' && 고름({ deal:'전세' }) === 'home-lease',
       '제안에서 열면 손님 조건으로 양식을 고른다 (매매는 유형과 상관없이 매매, 주거 임대 → 주택, 그 밖 임대 → 상가)');
  }
}

/* ── 중개대상물 확인·설명서[Ⅰ] 주거용 (별지 제20호서식, 2024. 7. 2. 개정) ── */
{
  ok(확시작 > 0 && 확끝 > 확시작, '확인·설명서 모듈을 찾았다');
  /* 서식의 번호 항목 ①~⑮ 가 빠짐없이, 차례대로 있다 */
  const 머리 = M.EX_SPEC.filter(s => s.h).map(s => s.h);
  const 번호 = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮'.split('');
  const 붙은 = 머리.map(h => h[0]).filter(c => 번호.includes(c));
  ok(붙은.join('') === 번호.join(''), `서식의 항목 ①~⑮ 가 빠짐없이 차례대로 있다 (${붙은.join('')})`);
  ok(M.EX_SPEC.filter(s => s.g).map(s => s.g).join('|') === 'Ⅰ. 개업공인중개사 기본 확인사항|Ⅱ. 개업공인중개사 세부 확인사항|Ⅲ. 중개보수 등에 관한 사항',
     '큰 묶음 Ⅰ·Ⅱ·Ⅲ 이름이 서식과 같다');
  const 값들 = JSON.stringify(M.EX_SPEC);
  ok(['등기권리증','확정일자 부여현황','전입세대확인서','국세납세증명서','지방세납세증명서'].every(x => 값들.includes(`"${x}"`)), '근거자료 선택지(등기권리증 … 지방세납세증명서)');
  ok(['임대인 자료 제출','열람 동의','임차인 권리 설명','확인(확인서류 첨부)','미확인(열람ㆍ교부 신청방법 설명)','장기일반민간임대주택','계약갱신 요구권 행사 여부'].every(x => 값들.includes(x)),
     '④ 임대차 확인사항 - 확정일자·체납정보·전입세대·민간임대·갱신요구권');
  ok(['단독경보형감지기','지역난방','사용연한','확인불가','프로판가스','중개보조원 신분고지 여부'].every(x => 값들.includes(x)), '⑪ 시설물 · ⑭ 현장안내의 서식 칸');
  ok(['전기료','수도료','가스사용료','난방비','인터넷 사용료','TV 수신료'].every(x => 값들.includes(`"${x}"`)) && 값들.includes('관리규약에 따라 부과'), '⑥ 관리비 비목·부과방식');

  const 계 = M.ctNewDoc('sale', { deal: { price: 700000000 } });
  계.property = { ...계.property, road: '서울 송파구 올림픽로 300', admCd: '1171010100', landCat: '대', bldArea: '84.97' };
  계.parties.seller = { name: '김매도', phone: '010-1', addr: '서울' };
  const e = M.exNewDoc({ ...계, __id: 'c-1' });
  ok(e.form === 'explain-home' && e.deal === '매매ㆍ교환' && e.ex.price === 700000000 && e.property.admCd === '1171010100' && e.parties.a.name === '김매도' && e.contractId === 'c-1',
     '계약서에서 만들면 거래 형태·거래예정금액·소재지(법정동코드)·당사자를 옮기고 어느 계약서에서 왔는지 남긴다');
  const 임 = M.exNewDoc({ ...M.ctNewDoc('home-lease'), deal: { type: 'monthly', deposit: 20000000, rent: 700000, fee: 120000 } });
  ok(임.deal === '임대' && 임.ex.price === 20000000 && 임.ex.feeTotal === 120000, '임대차 계약서에서 만들면 임대 · 거래예정금액은 보증금 · 관리비를 옮긴다');
  ok(M.ctNewDoc('explain-home').form === 'explain-home' && !('clauses' in M.ctNewDoc('explain-home')), '양식 표에서 확인·설명서를 고르면 확인·설명서로 만든다');

  e.house = '공동주택'; e.ex.docs = ['등기사항증명서', '그 밖의 자료']; e.ex.docsEtc = '관리비 고지서';
  e.ex.violation = '적법'; e.ex.nimby = '있음'; e.ex.nimbyWhat = '변전소 600m'; e.ex.fee = 3000000; e.ex.cost = 50000;
  e.parties.a.birth = '1970-01-01';
  const h = M.ctDocHTML(e);
  ok(/별지 제20호서식\] &lt;개정 2026\. 8\. 11\.&gt;/.test(h) && /중개대상물 확인ㆍ설명서\[Ⅰ\] \(주거용 건축물\)/.test(h), '머리에 서식 근거와 개정일이 찍힌다');
  ok(/\[√\]공동주택/.test(h) && /\[&nbsp;&nbsp;\]단독주택/.test(h) && /\[√\]매매ㆍ교환/.test(h), '고른 것은 [√], 안 고른 것은 [ ]');
  ok(/\[√\]그 밖의 자료 \(관리비 고지서\)/.test(h) && /\[√\]있음 \(종류 및 위치: 변전소 600m\)/.test(h), '고른 선택지 뒤 글칸이 붙는다 (그 밖의 자료 · 종류 및 위치)');
  ok(/3,050,000 원/.test(h), '⑮ 계 = 중개보수 + 실비');
  ok((h.match(/<th>생년월일<\/th>/g) || []).length === 2 && !/주민등록번호/.test(h) && /1970-01-01/.test(h), '당사자 칸은 서식대로 생년월일 - 주민등록번호 칸이 없다');
  ok((h.match(/개업<br>공인중개사/g) || []).length === 2 && /손해배상책임 보장 증명서류/.test(h), '개업공인중개사 서명란 둘(공동중개) · 수령 확인 문구');
  ok((h.match(/\(서명 또는 날인\)/g) || []).length >= 6, '④ 설명 확인 서명 넷 + 거래당사자 둘');
  ok(C.docCheck('explain-home', { schema: 'bk-contract/1', form: 'explain-home', property: {}, parties: { a: { birth: '700101' } } }) === null,
     '서버가 확인·설명서를 받는다 · 생년월일 6자리는 막지 않는다');
  ok(/case 'ct-explain':[\s\S]{0,200}계약서를 먼저 저장해 주세요/.test(js), '계약서에서 확인·설명서로 갈 때 저장 안 한 고침이 있으면 먼저 저장하게 한다');

  /* 2026. 8. 11. 개정 - 신탁원부 · 신탁등기 · 공동담보 · 공동관리비 · 사용량 확인 비목 · 갱신요구권이 ② 로 */
  const 권리 = M.EX_SPEC.find(s => s.h === '② 권리관계'), 임대 = M.EX_SPEC.find(s => s.h === '④ 임대차 확인사항');
  ok(값들.includes('"신탁원부"') && 값들.includes('"공부(公簿)상 지목"'), '[Ⅰ] 2026. 8. 11.: 근거자료에 신탁원부 · "공부(公簿)상 지목"');
  ok(권리.rows.map(r => r.l).join('|').includes('신탁등기 여부|공동담보 여부|계약갱신 요구권 행사 여부')
     && JSON.stringify(권리).includes('서류 확인(첨부)') && !JSON.stringify(임대).includes('계약갱신'),
     '[Ⅰ] 2026. 8. 11.: ② 에 신탁등기·공동담보·계약갱신요구권(서류 확인) - ④ 에서는 빠졌다');
  ok(값들.includes('공동관리비 금액: 총') && 값들.includes('사용량 또는 비용 확인가능 비목:'), '[Ⅰ] 2026. 8. 11.: ⑥ 공동관리비 · 사용량 확인 비목');

  /* [Ⅱ] [Ⅲ] [Ⅳ] - 번호가 빠짐없이 차례대로 · 서식마다 다른 칸 */
  const 끝번호 = { 'explain-biz': '⑪', 'explain-land': '⑨', 'explain-etc': '⑧' };
  for (const [k, n] of Object.entries(끝번호)) {
    const E = M.EX_FORMS[k], 머 = E.spec.filter(s => s.h).map(s => s.h[0]).filter(c => 번호.includes(c));
    ok(머.join('') === 번호.slice(0, 번호.indexOf(n) + 1).join(''), `${E.h1}: 항목 ①~${n} 차례대로 (${머.join('')})`);
    ok(E.spec.filter(s => s.g).length === 3 && /별지 제20호의[234]서식\] <개정 20(21\. 12\. 31|20\. 10\. 27)\.>/.test(E.law), `${E.h1}: Ⅰ·Ⅱ·Ⅲ 묶음 · 서식 번호와 개정일`);
  }
  const 비 = JSON.stringify(M.EX_FORMS['explain-biz'].spec), 토 = JSON.stringify(M.EX_FORMS['explain-land'].spec), 입 = JSON.stringify(M.EX_FORMS['explain-etc'].spec);
  ok(비.includes('소방 · 소화전') && 비.includes('소방 · 비상벨') && !비.includes('단독경보형') && !비.includes('지역난방') && 비.includes('⑩ 벽면 및 바닥면') && !비.includes('도배'),
     '[Ⅱ] 비주거용: 소방은 소화전·비상벨 · 지역난방 없음 · 벽면 및 바닥면(도배 없음)');
  ok(비.includes('해당사항 없음') && 비.includes('확인(확인서류 첨부)') && !비.includes('교육시설') && !비.includes('신탁원부'), '[Ⅱ] 민간임대 해당사항 없음 · 갱신요구권 · 교육시설 없음 · 신탁원부 없음');
  ok(!토.includes('건축물 ·') && 토.includes('비선호시설') && 토.includes('1천분의 9 이내에서 중개의뢰인과 개업공인중개사가 서로 협의하여 결정하며,') && 토.includes('※ 재산세는 6월 1일'),
     '[Ⅲ] 토지: 건축물 칸 없음 · 비선호시설 · 중개보수 1천분의 9 안내 · 재산세 안내');
  ok(입.includes('"입목","광업재단","공장재단"') && 입.includes('③ 재단목록 또는 입목의 생육상태') && 입.includes('④ 그 밖의 참고사항') && 입.includes('결정하며 부가가치세'),
     '[Ⅳ] 입목·재단: 대상물 종별 · 재단목록/생육상태 · 그 밖의 참고사항 · 안내문(쉼표 없음, 원문대로)');
  ok(M.EX_FORMS['explain-biz'].kinds.map(k => k[2].join('/')).join(' | ') === '업무용/상업용/공업용 | 매매ㆍ교환/임대/그 밖의 경우',
     '[Ⅱ] 머리 선택지: 업무용·상업용·공업용 / 매매ㆍ교환·임대·그 밖의 경우');

  /* 계약서에서 만들면 알맞은 서식으로 */
  ok(M.exFormFor({ form: 'shop-lease' }) === 'explain-biz' && M.exFormFor({ form: 'home-lease' }) === 'explain-home'
     && M.exFormFor({ form: 'sale', property: { bldUse: '아파트' } }) === 'explain-home' && M.exFormFor({ form: 'sale', property: { bldUse: '제1종 근린생활시설' } }) === 'explain-biz'
     && M.exFormFor({ form: 'sale', property: { landCat: '전', landArea: '300' } }) === 'explain-land',
     '계약서에서: 상가 → 비주거용 · 주택 → 주거용 · 매매는 건물 용도로 · 건물 없으면 토지');
  const 상 = M.ctDocHTML(M.exNewDoc({ ...M.ctNewDoc('shop-lease'), __id: 'x' }));
  ok(/중개대상물 확인ㆍ설명서\[Ⅱ\] \(비주거용 건축물\)/.test(상) && /\[√\]상업용/.test(상) && /\[√\]임대/.test(상) && !/주택 유형/.test(상), '상가 계약서에서 만든 비주거용 - 상업용·임대에 표시');
  ok(/case 'ex-form': if\(CT\.doc && EX_FORMS\[v\] && !\(CT\.row && CT\.row\.status === 'sealed'\)\)/.test(js), '서식 바꾸기는 날인본에서 막는다');
}

/* ── 거래신고 도우미 (2단계) - 별지 제1호서식(2026. 2. 6.) · 별지 제5호의2서식(2023. 12. 29.) ── */
{
  ok(신시작 > 0 && 신끝 > 신시작, '신고 도우미 모듈을 찾았다');
  const 매 = M.ctNewDoc('sale', { deal: { price: 900000000 } });
  Object.assign(매.property, { road: '서울 송파구 올림픽로 300', jibun: '서울 송파구 잠실동 40', bdNm: '잠실엘스', admCd: '1171010100', bldUse: '아파트', bldArea: '84.97' });
  매.deal = { ...매.deal, down: 90000000, mid: 300000000, midDate: '2026-11-20', balanceDate: '2026-12-30' };
  매.parties.seller = { name: '김매도', phone: '010-1111-2222', addr: '서울' }; 매.contractDate = '2026-10-29';
  const 줄 = M.rpItems(매);
  const 섹 = [...new Set(줄.map(r => r[0]))];
  ok(섹.join('|') === '① 매도인|② 매수인|개업공인중개사|④ 거래대상 종류|⑥ 소재지/지목/면적|⑧ 물건별 거래가격|⑨ 총 실제 거래가격|⑪ 계약의 조건 및 참고사항',
     '매매: 거래신고서 번호 순서대로 묶인다');
  const 값 = l => (줄.find(r => r[1] === l) || [])[2];
  ok(값('잔금') === '510,000,000원' && 값('합계') === '900,000,000원' && 값('계약 체결일') === '2026-10-29' && 값('잔금 지급일') === '2026-12-30',
     '매매: 합계·잔금(자동 계산)·계약 체결일·잔금 지급일');
  ok(값('소재지') === '서울 송파구 잠실동 40 잠실엘스' && 값('종류') === '토지 및 건축물 (아파트)' && 값('법정동코드') === '1171010100',
     '매매: 소재지는 지번+건물명 · 종류는 건물 용도로 · 법정동코드도 보여 준다');
  ok(줄.filter(r => /주민등록번호/.test(r[1])).every(r => r[2] === '' && r[3] === M.RP_직접) && 줄.filter(r => /주민등록번호/.test(r[1])).length === 2,
     '주민등록번호 칸은 값 없이 "신고 화면에서 직접 입력" 으로만');

  const 기 = M.rp기한({ contractDate: '2026-10-29' });
  ok(기.날 === '2026-11-28' && M.rp기한({}).날 === '', '신고 기한 = 계약일 + 30일 · 계약일이 없으면 계산하지 않는다');

  const 임 = M.ctNewDoc('home-lease');
  Object.assign(임.property, { road: '경기도 하남시 미사강변대로 220', bdNm: '미사강변푸르지오', part: '1203동 8층 802호', partArea: '59.92', bldUse: '공동주택(아파트)' });
  임.deal = { ...임.deal, type: 'monthly', deposit: 50000000, rent: 1200000 };
  임.period = { handover: '2026-12-01', to: '2028-11-30' }; 임.contractDate = '2026-10-29';
  const 임줄 = M.rpItems(임), 임값 = l => (임줄.find(r => r[1] === l) || [])[2];
  ok([...new Set(임줄.map(r => r[0]))].slice(0, 6).join('|') === '① 임대인|② 임차인|③ 임대 목적물 현황|④ 소재지(주소)|⑤ 임대 면적|⑥ 신규 계약',
     '임대차: 주택임대차계약신고서 번호 순서');
  ok(임값('종류') === '아파트' && 임값('동·층·호') === '1203동 8층 802호' && 임값('계약 기간') === '2026-12-01 ~ 2028-11-30' && 임값('월 차임') === '1,200,000원',
     '임대차: 종류(건물 용도에서) · 동층호 · 계약 기간 · 월 차임');
  임.kind = 'right';
  const 갱 = M.rpItems(임);
  ok(갱.some(r => r[0] === '⑦ 갱신 계약' && r[1] === '보증금') && (갱.find(r => r[1] === '행사 여부') || [])[2] === '행사'
     && 갱.some(r => /종전 임대료/.test(r[1]) && r[2] === ''), '임대차 갱신: ⑦ 갱신 계약 · ⑧ 갱신요구권 행사 · 종전 임대료는 직접');
  ok(/신고 대상일 가능성이 높습니다/.test(M.rp대상(임)) && /아닐 수 있습니다/.test(M.rp대상({ form: 'home-lease', deal: { type: 'jeonse', deposit: 50000000 } })),
     '임대차 신고 대상: 보증금 6천만 원 또는 월세 30만 원 초과면 "가능성 높음", 아니면 "아닐 수 있음"');
  /* 경계 - 월세만 크면 보증금 기준이 틀려도 같은 답이 나온다. 하나씩 따로 본다 */
  ok(/가능성이 높습니다/.test(M.rp대상({ form: 'home-lease', deal: { type: 'jeonse', deposit: 70000000 } }))
     && /아닐 수 있습니다/.test(M.rp대상({ form: 'home-lease', deal: { type: 'monthly', deposit: 60000000, rent: 300000 } }))
     && /가능성이 높습니다/.test(M.rp대상({ form: 'home-lease', deal: { type: 'monthly', deposit: 10000000, rent: 300001 } })),
     '경계: 전세 7천만 원은 대상 · 6천만 원·30만 원 딱 맞으면 아닐 수 있음 · 월세 30만 1원은 대상');
  const h = M.rpHTML(매);
  ok(/부동산거래계약신고서\(별지 제1호서식\)/.test(h) && /href="https:\/\/rtms\.molit\.go\.kr"/.test(h) && /data-act="rp-copy" data-v="510,000,000원"/.test(h),
     '도우미 화면: 서식 이름 · 부동산거래관리시스템 열기 · 칸마다 복사');
  ok(/ct신고\(doc\) && CT\.mode !== 'report'/.test(js) && M.ct신고({ form: 'shop-lease' }) === false && M.ct신고({ form: 'lease', sub: '상가' }) === false
     && M.ct신고({ form: 'lease', sub: '아파트' }) && M.ct신고({ form: 'sale', sub: '토지' }) && M.ct신고({ form: 'home-lease' }),
     '신고 도우미는 매매·주택 임대차에만 - 상가 임대차는 신고 대상이 아니다(부동산 임대차는 주거 세부 종류만)');
}

/* ── 신고 마침 · 신고 기한 알림 (2026-10-29) ── */
{
  const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r; };
  let 불린 = [], 답 = () => new Response('[]', { status: 200 });
  globalThis.fetch = async (u, o = {}) => { 불린.push({ u: String(u), m: o.method || 'GET', b: o.body }); return 답(u, o); };
  process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
  const agent = { id: '11111111-1111-1111-1111-111111111111', role: 'agent' }, user = { id: 'u' };

  답 = () => new Response(JSON.stringify([{ id: 'x' }]), { status: 200 });
  let res = 응답(); 불린 = [];
  await C.contractRoute({}, res, agent, user, { what: 'contract-reported', id: '33333333-3333-3333-3333-333333333333' });
  const 본 = JSON.parse(불린[0].b);
  ok(불린[0].m === 'PATCH' && /status=eq\.sealed/.test(불린[0].u) && /form=in\.\(sale,home-lease,lease\)/.test(불린[0].u) && Object.keys(본).join() === 'reported_at' && 본.reported_at,
     '신고 마침은 내 날인본 · 매매·주택임대차에만 · reported_at 한 칸만 바꾼다');
  res = 응답(); 불린 = [];
  await C.contractRoute({}, res, agent, user, { what: 'contract-reported', id: '33333333-3333-3333-3333-333333333333', on: false });
  ok(JSON.parse(불린[0].b).reported_at === null, '표시 취소는 reported_at 을 비운다');
  답 = () => new Response('[]', { status: 200 }); res = 응답();
  await C.contractRoute({}, res, agent, user, { what: 'contract-reported', id: '33333333-3333-3333-3333-333333333333' });
  ok(res.code === 409, '작성 중·상가·확인·설명서면 409 (0행)');

  /* 기한 = 계약일 다음 날부터 30일째, 한국 날짜로 */
  ok(C.신고남은날('2026-10-29', '2026-10-29').기한 === '2026-11-28' && C.신고남은날('2026-10-29', '2026-11-21').남음 === 7
     && C.신고남은날('2026-10-29', '2026-11-28').남음 === 0 && C.신고남은날('', '2026-10-29') === null, '신고 기한 = 계약일 + 30일 · 남은 날 계산');
  ok(C.한국오늘(Date.parse('2026-10-29T16:00:00Z')) === '2026-10-30' && C.한국오늘(Date.parse('2026-10-29T14:59:00Z')) === '2026-10-29',
     '오늘은 한국 날짜 - UTC 15시가 넘으면 다음 날');

  /* 예약 실행 - 비밀값 없으면 거절 */
  delete process.env.CRON_SECRET; res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer x' } }, res);
  ok(res.code === 401 && 불린.length === 0, 'CRON_SECRET 이 없으면 돌지 않는다');
  process.env.CRON_SECRET = 'cron-secret'; res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer 틀림' } }, res);
  ok(res.code === 401 && 불린.length === 0, '비밀값이 틀리면 돌지 않는다');

  /* 매일 아침 계약 일정 알림 (2026-10-30 - 신고 기한만 보내던 것을 일정 전체로) */
  const 오늘 = C.한국오늘(), 며칠전 = n => C.날더하기(오늘, -n), 며칠뒤 = n => C.날더하기(오늘, n);
  const 행 = [
    { id: 'a', agent_id: 'A1', agent_user: 'u1', form: 'sale', title: '잠실 아파트', status: 'sealed', reported_at: null, cd: 며칠전(23) },        // 신고 7일 전
    { id: 'b', agent_id: 'A1', agent_user: 'u1', form: 'home-lease', title: '미사 802호', status: 'sealed', reported_at: null, cd: 며칠전(30) },   // 신고 당일
    { id: 'c', agent_id: 'A2', agent_user: 'u2', form: 'sale', title: '알릴 날 아님', status: 'sealed', reported_at: null, cd: 며칠전(20) },       // 10일 전 - 안 보냄
    { id: 'd', agent_id: 'A3', agent_user: 'u3', form: 'sale', title: '계약일 없음', status: 'sealed', reported_at: null },
    { id: 'e', agent_id: 'A1', agent_user: 'u1', form: 'lease', sub: '아파트', title: '잔금 사흘 전', status: 'draft', cd: 며칠전(40), bd: 며칠뒤(3) },
    { id: 'f', agent_id: 'A1', agent_user: 'u1', form: 'sale', title: '새 판으로 바뀐 앞 판', status: 'sealed', reported_at: null, cd: 며칠전(23) },
    { id: 'g', agent_id: 'A1', agent_user: 'u1', form: 'sale', title: '작성 중인 새 판', status: 'draft', prev_id: 'f', cd: 며칠전(23) },
    { id: 'h', agent_id: 'A4', agent_user: 'u4', form: 'sale', title: '신고 마침', status: 'sealed', reported_at: '2026-10-01', cd: 며칠전(30) },
  ];
  const 중개사들 = { A1: { id: 'A1', name: '한상혁', phone: '010-1234-5678', settings: {} }, A2: { id: 'A2', name: '둘', phone: '' },
    A3: { id: 'A3', name: '셋', phone: '' }, A4: { id: 'A4', name: '넷', phone: '010-9999-0000' } };
  let 메일 = null, 카톡 = [];
  process.env.RESEND_API_KEY = 'test';
  Object.assign(process.env, { SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_PFID: 'KA01PF', SOLAPI_FROM: '01024153437', SOLAPI_TPL_SCHEDULE: 'KA01TP-SCHEDULE' });
  const 중개사답 = u => { const ids = (decodeURIComponent(u).match(/id=in\.\(([^)]*)\)/) || [, ''])[1].split(',');
    return new Response(JSON.stringify(ids.map(i => 중개사들[i]).filter(Boolean)), { status: 200 }); };
  답 = (u, o) => /bk_contract/.test(u) ? new Response(JSON.stringify(행), { status: 200 })
    : /bk_agent/.test(u) ? 중개사답(u)
    : /admin\/users\/u1/.test(u) ? new Response(JSON.stringify({ email: 'agent1@example.com' }), { status: 200 })
    : /resend\.com\/emails\/batch/.test(u) ? (메일 = JSON.parse(o.body), new Response('{}', { status: 200 }))
    : /api\.solapi\.com/.test(u) ? (카톡.push(JSON.parse(o.body).message), new Response('{}', { status: 200 }))
    : new Response('{}', { status: 404 });
  res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer cron-secret', host: 'beaverknock.co.kr' } }, res);
  const 주소 = decodeURIComponent(불린[0].u);
  ok(/form=not\.like\.explain\*/.test(주소) && 주소.includes(`created_at=gte.${C.날더하기(오늘, -400)}`) && /,track&/.test(주소) && /order=id/.test(주소)
     && /cd:doc->>contractDate/.test(주소) && /bd:doc->deal->>balanceDate/.test(주소),
     '확인·설명서를 뺀 400일 안의 계약서를 읽는다 - 일정 계산에 쓰는 날짜만 doc 에서 꺼낸다');
  ok(res.code === 200 && 메일 && 메일.length === 1 && 메일[0].to[0] === 'agent1@example.com' && /오늘 챙기실 계약 일정이 3건/.test(메일[0].subject)
     && 메일[0].html.includes('잠실 아파트') && 메일[0].html.includes('미사 802호') && 메일[0].html.includes('잔금 사흘 전')
     && !메일[0].html.includes('알릴 날 아님') && !메일[0].html.includes('새 판으로 바뀐 앞 판') && !메일[0].html.includes('작성 중인 새 판'),
     '메일은 중개사별 하루 한 통 - 신고 기한(날인본·신고 전) · 잔금 3일 전(작성 중도) · 새 판으로 바뀐 앞 판은 뺀다');
  ok(메일[0].html.includes('잔금안내(이체한도·준비서류) 전입니다') && /알림 설정/.test(메일[0].text), '잔금 알림에 잔금안내 여부 · 메일에 알림 설정 안내');
  ok(카톡.length === 3 && 카톡.every(m => m.to === '01012345678' && m.kakaoOptions.templateId === 'KA01TP-SCHEDULE')
     && 카톡.some(m => m.kakaoOptions.variables['#{일정}'] === '실거래신고 기한 7일 전' && m.kakaoOptions.variables['#{물건}'] === '잠실 아파트')
     && 카톡.some(m => m.kakaoOptions.variables['#{일정}'] === '임대차 신고 기한 당일')
     && 카톡.some(m => m.kakaoOptions.variables['#{일정}'] === '잔금 3일 전' && m.kakaoOptions.variables['#{확인}'] === '잔금안내(이체한도·준비서류) 전입니다')
     && 카톡.every(m => ['#{이름}', '#{일정}', '#{날짜}', '#{물건}', '#{확인}'].every(k => String(m.kakaoOptions.variables[k] || '').length))
     && res.body.카톡 === 3, '카카오 알림톡은 일정 하나에 한 통 - 템플릿 변수 다섯(이름·일정·날짜·물건·확인)을 다 채운다');

  /* 설정 - 카카오 끄기 · 잔금 항목 끄기 */
  중개사들.A1.settings = { alert: { kakao: false, off: ['balance'] } };
  메일 = null; 카톡 = []; res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer cron-secret', host: 'beaverknock.co.kr' } }, res);
  ok(카톡.length === 0 && 메일 && 메일.length === 1 && !메일[0].html.includes('잔금 사흘 전') && /2건/.test(메일[0].subject), '설정대로 - 카카오톡을 끄면 안 보내고, 끈 항목(잔금)은 메일에서도 뺀다');
  중개사들.A1.settings = {};
  delete process.env.SOLAPI_TPL_SCHEDULE; 카톡 = []; res = 응답();
  await C.reportDueCron({ headers: { authorization: 'Bearer cron-secret', host: 'beaverknock.co.kr' } }, res);
  ok(카톡.length === 0 && res.body.보냄 === 1, '심사 통과한 템플릿(SOLAPI_TPL_SCHEDULE)이 없으면 카카오톡은 건너뛰고 메일만');

  /* 0032 전 - track·settings 칸이 없으면 빼고 다시 읽는다 */
  let 첫번 = true;
  답 = (u, o) => /bk_contract/.test(u) ? (첫번 && /track/.test(u) ? (첫번 = false, new Response('{"code":"42703","message":"column bk_contract.track does not exist"}', { status: 400 })) : new Response(JSON.stringify(행), { status: 200 }))
    : /bk_agent/.test(u) ? (/settings/.test(u) ? new Response('{"code":"42703","message":"column bk_agent.settings does not exist"}', { status: 400 }) : 중개사답(u))
    : /admin\/users\/u1/.test(u) ? new Response(JSON.stringify({ email: 'agent1@example.com' }), { status: 200 })
    : /resend\.com\/emails\/batch/.test(u) ? (메일 = JSON.parse(o.body), new Response('{}', { status: 200 }))
    : new Response('{}', { status: 404 });
  메일 = null; res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer cron-secret', host: 'beaverknock.co.kr' } }, res);
  ok(res.code === 200 && 메일 && /3건/.test(메일[0].subject) && 불린.filter(x => /bk_contract/.test(x.u)).length === 2, '0032 전이어도 돈다 - track·settings 없이(설정은 모두 켬)');

  /* 1000건 넘게 걸리면 쪽으로 나눠 다 읽고, 알릴 중개사가 100명을 넘으면 100통씩 나눠 보낸다 */
  const 많은 = Array.from({ length: 1000 }, (_, i) => ({ id: 'm' + i, agent_id: 'A' + i, agent_user: 'u' + i, form: 'sale', status: 'sealed', title: 't' + i, cd: 며칠전(23) }));
  const 덤 = 많은.slice(0, 5).map(x => ({ ...x, id: x.id + 'b', agent_id: x.agent_id + 'b', agent_user: x.agent_user + 'b' }));
  const 묶음 = [];
  답 = (u, o) => /bk_contract/.test(u) ? new Response(JSON.stringify(/offset=0(&|$)/.test(u) ? 많은 : 덤), { status: 200 })
    : /bk_agent/.test(u) ? new Response(JSON.stringify((decodeURIComponent(u).match(/id=in\.\(([^)]*)\)/) || [, ''])[1].split(',').map(id => ({ id, name: 'n', phone: '' }))), { status: 200 })
    : /admin\/users\//.test(u) ? new Response(JSON.stringify({ email: 'a@example.com' }), { status: 200 })
    : /resend\.com\/emails\/batch/.test(u) ? (묶음.push(JSON.parse(o.body).length), new Response('{}', { status: 200 }))
    : new Response('{}', { status: 404 });
  process.env.CRON_SECRET = 'cron-secret'; process.env.RESEND_API_KEY = 'test';
  res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer cron-secret', host: 'beaverknock.co.kr' } }, res);
  ok(불린.filter(x => /bk_contract/.test(x.u)).length === 2 && res.body.대상 === 1005 && 불린.filter(x => /bk_agent/.test(x.u)).length === 11, '1000건이 차면 다음 쪽을 더 읽는다 · 중개사는 100명씩 묻는다');
  ok(묶음.length === 11 && 묶음.slice(0, 10).every(n => n === 100) && 묶음[10] === 5 && res.body.보냄 === 1005, '100통씩 나눠 보내 1005통 모두 보낸다');
  delete process.env.CRON_SECRET; delete process.env.RESEND_API_KEY;
  for (const k of ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PFID', 'SOLAPI_FROM', 'SOLAPI_TPL_SCHEDULE']) delete process.env[k];

  const 설정 = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  ok((설정.crons || []).some(c => c.path === '/api/feed?cron=report-due' && c.schedule === '0 0 * * *'), '예약 실행: 매일 UTC 0시(한국 9시) /api/feed?cron=report-due');
  const feed = fs.readFileSync(new URL('../api/feed.js', import.meta.url), 'utf8');
  ok(feed.indexOf("req.query.cron === 'report-due'") < feed.indexOf("if (req.method !== 'POST')"), '예약 실행 갈래는 POST 문 앞에 있다(GET 으로 온다)');
  ok(/case 'ct-reported':/.test(js) && /신고 안 한 날인본/.test(js) && /badge b-warn">신고 전/.test(js), '화면: 신고 마침 단추 · 목록 배지(신고 전/마침) · 대시보드 할 일');
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
  ok(/const 스스로 = CT\.건너뜀 === h; CT\.건너뜀 = null;\s*if\(!스스로 && S\.lastRoute && S\.lastRoute\.startsWith\('#\/partner\/contract\/'\) && h !== S\.lastRoute/.test(js)
     && /CT\.doc = exNewDoc\(원\);[\s\S]{0,400}CT\.dirty = true; CT\.mode = 원\.src \? 'edit' : 'scan'; ctGo\('#\/partner\/contract\/new'\)/.test(js),
     '다른 계약서로 옮겨 가도 묻는다 - 화면이 새 문서를 들고 가는 길(ctGo)만 묻지 않는다');
  ok(/function ctDirty\(\)\{ CT\.dirty = true; CT\.rev = \(CT\.rev \|\| 0\) \+ 1;/.test(js) && /CT\.dirty = true; CT\.rev = \(CT\.rev \|\| 0\) \+ 1;\n  \}/.test(js),
     '고칠 때마다 판 번호가 오른다(글자·주소 검색 모두)');
  ok(/h==='#\/partner\/proposals' && S\.agent && !ownerSide\(\)\) ctLoadList\(\)/.test(js) && /if\(!CT\.list\) await ctLoadList\(true\);/.test(js),
     '제안 화면에서도 계약서 목록을 받고, 모르면 받아 본 뒤에 만든다');
  /* 2026-10-29 대표님: Lounge 계약서처럼 - 왼쪽 입력 판 | 오른쪽 책상 위 A4, 칸은 값 길이만큼, 빽빽하게 */
  ok(/if\(!isMo\(\)\)\{\s*const 신고면[\s\S]{0,200}const 판 = CT\.mode === 'scan' && !잠김 \? ctScanHTML\(\) : CT\.mode === 'plan' && !F\.explain \? ctPlanHTML\(doc\) : 신고면 \? ctReportSide\(doc\) : \(잠김 \? '' : ctScanBanner\(\)\) \+ \(F\.explain \? exEditor\(doc\) \+[\s\S]{0,260}: ctFormHTML\(doc\)\);/.test(js)
     && /return ctDeskShell\(doc, 판, 신고면\);/.test(js) && /\$\{ctFormHTML\(doc\)\}/.test(js),
     'PC 는 입력 판 | 미리보기 한 화면(계약서·확인·설명서·신고 도우미 모두), 휴대폰은 같은 입력 구획을 카드로 쌓는다');
  ok(/<div class="ctx-desk" id="ctDesk"><div class="ct-sheet" id="ctPv">\$\{ctDocHTML\(doc\)\}<\/div><\/div>/.test(js)
     && /function ctDirty\(\)\{ CT\.dirty = true; CT\.rev = \(CT\.rev \|\| 0\) \+ 1; ctPvRefresh\(\);/.test(js),
     '미리보기는 늘 떠 있고, 칸을 고칠 때마다(잠깐 멈추면) 다시 그린다');
  ok(/\.ctx-body\{[^}]*grid-template-columns:minmax\(378px,450px\) minmax\(0,1fr\)/.test(css) && /\.ctx-scroll\{[^}]*overflow-y:auto/.test(css)
     && /\.ctx-side \.ct-grid\{grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/.test(css) && /const w = opt\.w \|\| \(opt\.wide \? 12 : money \|\| opt\.type === 'date' \? 4 : 6\);/.test(js),
     '입력 판은 고정 폭·안에서만 내려가고, 칸은 12칸 격자에서 값 길이만큼(금액·날짜 4칸, 주소 12칸)');
  ok(/\.ctx-side \.inp\{min-height:32px;height:32px/.test(css) && /\.ctx-side \.ct-sec\{padding:10px 0;gap:6px;/.test(css), '빽빽하게 - 칸 키 32px · 구획 위아래 10px');
  ok(/\.ctx-side \.ct-grid > :is\(\.w12,\.wide,\.ex-pick,\.ex-enote,p\)\{grid-column:1\/-1\}/.test(css) && /class="ct-f wide w12"><span class="lab">내용<\/span><textarea/.test(js),
     '긴 글 칸(확인·설명서 내용)은 판 폭을 다 쓴다 - 6칸으로 좁아지지 않게');
  ok(/\.btn\.tool\{background:var\(--white\);border-color:var\(--n300\);color:var\(--n900\)\}/.test(css) && /\.btn\[disabled\]\{[^}]*color:var\(--n500\)!important/.test(css),
     '단추 가독성 - 도구 단추는 흰 면·진한 글자(주 동작 보라와 갈림), 막힌 단추 글자는 n500(4.5:1)');
  /* 창이 낮으면 바깥이 스크롤돼 미리보기 머리(인쇄 단추 줄)가 위로 잘렸다 - 창 높이에 딱 맞추고 배지 줄은 머리 줄 안으로 */
  ok(/body:not\(\.mo\) \.ctx-scr \.ptop\{display:none\}/.test(css) && /body:not\(\.mo\) \.ctx-scr\{height:100vh;height:100dvh;overflow:hidden\}/.test(css)
     && /\.ctx\{[^}]*height:100dvh;/.test(css) && !/\.ctx\{[^}]*min-height:560px/.test(css) && !/margin-top:-28px/.test(css) && /<span class="ctx-badge">\$\{agentBadge\(\)\}<\/span>/.test(js),
     'PC 계약서 화면은 창 높이에 딱 맞는다(최소 높이·음수 여백 없음) - 바깥 스크롤로 미리보기 머리가 잘리지 않는다');
  /* 미리보기 - 상자 한 겹(바깥 흰 카드 없음), 도구 줄 단추가 줄 높이 안에(40px 단추가 46px 줄에서 잘려 보였다) */
  ok(/\.ctx-scr \.ctx-view\{gap:6px;background:transparent;border:0;border-radius:0;box-shadow:none;overflow:visible\}/.test(css)
     && /\.ctx-vh\{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;min-height:30px;padding:0 2px\}/.test(css) && /\.ctx-vh \.btn\.sm\{min-height:30px;/.test(css)
     && /\.ctx-vn\{[^}]*text-overflow:ellipsis\}/.test(css) && /\.ctx-desk \.ct-sheet\{margin:0 auto;padding:36px 50px;/.test(css),
     '미리보기는 책상 위 종이 한 장 · 도구 줄은 한 줄(설명이 먼저 줄어든다) · 화면용 종이 여백을 줄였다');
  /* 고른 칩에 마우스를 올리면 글자가 사라졌다 - hover 규칙이 .chip.on 을 이겨 옅은 바탕 + 흰 글자 */
  ok(/\.chip\.on:not\(:disabled\):hover\{background:var\(--ind700\);border-color:var\(--ind700\);color:#fff\}/.test(css)
     && css.indexOf('.chip.on:not(:disabled):hover') > css.indexOf('.chip:not(:disabled):hover'), '고른 칩은 마우스를 올려도 진한 보라 + 흰 글자 (뒤에 적어 이긴다)');
  /* 입력 판은 옆으로 밀리지 않는다 - 신고 도우미의 띄어쓰기 없는 긴 특약이 판을 1000px 넘게 밀었다 */
  ok(/\.ctx-scroll\{[^}]*overflow-y:auto;overflow-x:hidden;/.test(css) && /\.rp-row\{display:grid;grid-template-columns:minmax\(120px,190px\) minmax\(0,1fr\) auto;/.test(css)
     && /#app \.rp-v\{overflow-wrap:anywhere;min-width:0\}/.test(css) && /\.ctx-side \.ct-grid > \*, \.ctx-side \.ex-row > \*\{min-width:0;max-width:100%\}/.test(css),
     '입력 판 가로 스크롤 막음 · 신고 도우미 값은 어디서든 접힌다 · 칸은 판 폭을 넘지 않는다');
  /* 리뷰 3차 - 미리보기가 인쇄본과 갈라졌다(줄간격·본문 폭) */
  ok(/:where\(#app\) :where\(p,li,dd,blockquote\):where\(:not\(\[class\]\)\):where\(:not\(:is\(\.ctdoc,\.exdoc\) \*\)\)\{line-height:1\.65\}/.test(css),
     '문단 기본 줄간격은 클래스 없는 문단에만 · 계약서·확인·설명서 문서 안은 빼서 인쇄(1.6)와 같다');
  {
    /* 화면 종이 본문 폭 = 794 - 좌우 여백 × 2, 인쇄 본문 폭 = (210 - 13×2)mm */
    const 좌우 = +(css.match(/\.ctx-desk \.ct-sheet\{margin:0 auto;padding:\d+px (\d+)px;/) || [])[1];
    const 인쇄 = (210 - 2 * +(css.match(/@page\{size:A4;margin:\d+mm (\d+)mm\}/) || [])[1]) * 96 / 25.4;
    ok(좌우 && Math.abs((794 - 2 * 좌우) - 인쇄) <= 8, `화면 종이 본문 폭(${794 - 2 * 좌우}px)이 인쇄 본문 폭(${Math.round(인쇄)}px)과 8px 안 - 줄바꿈이 같다`);
  }
  ok(!/#app \.rp-v\{[^}]*break-all/.test(css), '신고 도우미 값은 어절 안을 끊지 않는다(넘칠 때만 끊는다)');
  /* 2026-10-29 리뷰 2차 */
  ok(/CT\.dirty = false; CT\.doc = null; CT\.id = null; CT\.row = null;/.test(js), '나가기를 고르면 버린 고침을 메모리에서도 버린다 - 다시 열면 서버 판');
  ok(/case 'ct-kind': if\(CT\.doc && !ctSealed\(\)\)/.test(js) && /case 'ct-vat': if\(CT\.doc && !ctSealed\(\)\)/.test(js) && /case 'ct-deal': if\(CT\.doc && !ctSealed\(\)\)/.test(js)
     && /'ct-kind', false, 잠김\)/.test(js) && /data-v="\$\{esc\(v\)\}" \$\{off\?'disabled':''\}/.test(js),
     '날인본은 칩(계약 종류·전월세·부가세)으로도 못 바꾼다 - 처리기도 막고 칩도 꺼 둔다');
  ok(/const 판 = CT\.rev \|\| 0;\s*CT\.saving = true; render\(\);/.test(js) && /if\(\(CT\.rev \|\| 0\) !== 판\)\{ const id = CT\.id; CT\.id = null; ctOpen\(id\);/.test(js),
     '확정하는 사이 적은 것이 있으면 확정 뒤 날인본을 다시 불러와 화면·인쇄를 날인본과 맞춘다');
  ok(/r\.proposal_id === v && r\.status === 'draft' && !\(CT_FORMS\[r\.form\] \|\| \{\}\)\.explain/.test(js), "제안의 '계약서 만들기' 는 확인·설명서 초안을 열지 않는다");
  ok(/F\.explain \? exEditor\(doc\) \+ \(잠김\|\|!CT\.id \? '' : `<button class="tapx" data-act="ct-del"/.test(js), 'PC 에서도 확인·설명서를 지울 수 있다');
  ok(/const 자리 = CT\.스크롤키 === 키 && CT\.스크롤문서 === doc \?/.test(js) && !/const 키 = \(CT\.id \|\| 'new'\)/.test(js), '스크롤 자리는 문서에 붙는다 - 처음 저장·확정해도 맨 위로 튀지 않는다');
  ok(/if\(새것 && \(location\.hash \|\| ''\)\.startsWith\('#\/partner\/contract\/'\)\) history\.replaceState/.test(js), '저장 중에 화면을 떠났으면 계약서 화면으로 끌고 오지 않는다');
  ok(/if\(n && !confirm\(/.test(js) && /서식을 바꾸면 새 서식에 없는 칸의 값은 지워집니다/.test(js), '서식 바꾸기 - 지워질 값이 있으면 먼저 묻고, 안내 문구도 동작과 같다');
  {
    const d = M.exNewDoc(null, 'explain-home'); d.property.bldUse = '아파트'; d.property.bldArea = '84'; d.ex.guard = '있음';
    const 잃음 = M.exLost(d, 'explain-land'); M.exSwitch(d, 'explain-land');
    ok(잃음 >= 2 && d.property.bldUse === '' && d.property.bldArea === '' && 'landCat' in d.property, '토지 서식으로 바꾸면 건물 칸도 지우고(지문에 안 남게), 지울 개수를 먼저 센다');
  }
  ok(/data-act="ct-reload">다시 불러오기/.test(js) && /case 'ct-reload': ctLoadList\(true\)/.test(js), '목록을 못 불러오면 "다시 불러오기" 가 있다');
  ok(/const 열람 = 진짜\.filter\(열람됨\)/.test(js) && /const viewed = P\.filter\(열람됨\)/.test(js) && /const 열람됨 = p => \['viewed','selected','rejected'\]/.test(js),
     '대시보드와 성과 화면이 같은 셈으로 열람을 센다(관심 없음도 연 것)');
  /* 메뉴가 여섯 칸이 되면서 1024px 에서 '로그아웃' 이 밖으로 밀렸고, 한 줄로만 묶자 800px 에서 줄 전체가 넘쳤다 */
  ok(/\.nav \.items a\{white-space:nowrap\}/.test(css) && /@media \(max-width:1279px\)\{ \.nav \.items a\{padding:8px 9px\} \.nav-office\{display:none\} \}/.test(css)
     && /@media \(max-width:1179px\)\{ \.nav \.items\{min-width:0;flex:1 1 auto;overflow-x:auto/.test(css),
     '좁은 데스크톱: 메뉴 글자는 안 접고, 1279px 이하는 칸을 줄이고 사무소 이름을 감추고, 1179px 이하는 메뉴 줄을 옆으로 민다');
  ok(/켜짐 = 줄 && 줄\.querySelector\('a\.on'\)[\s\S]{0,200}줄\.scrollLeft \+=/.test(js), '메뉴 줄이 밀려도 켜진 탭이 보이게 맞춘다');
  ok(/body\.mo \.ct-bar > div\{display:grid !important;grid-template-columns:repeat\(3,1fr\)/.test(css) && /body\.mo \.ct-long\{display:none\}/.test(css),
     '휴대폰 계약서 위 단추는 세 칸씩 · 긴 이름은 줄인다 (네 줄로 몰리지 않게)');
}

/* ── 계약서 종류 (2026-10-30 대표님 '계약서 종류 전체 목록') ── */
{
  ok(M.CT_CATS.map(c => c.ko).join() === '부동산,분양권,권리양도양수,표준임대차계약서,상가권리금계약서,상가임대차계약서,조합원입주권매매계약서,전대차계약서',
     '종류 여덟 가지 - 대표님이 준 순서 그대로');
  ok(M.CT_CATS[0].subs.join() === '아파트,주상복합,연립주택,다세대주택,다가구주택,다중주택,도시형생활주택,주택,오피스텔,원룸,상가,상가주택,상가건물,건물,사무실,토지,공장,창고,지식산업센터'
     && M.CT_CATS[0].deals.join() === '매매,전세,월세,연세', '부동산 - 세부 종류 열아홉 + 거래유형 매매·전세·월세·연세');
  ok(M.CT_CATS[1].subs.map(M.CT_CATS[1].name).join() === '분양권(아파트),분양권,분양권(오피스텔),분양권(주상복합),분양권(상가)' && !M.CT_CATS[1].deals,
     '분양권 - 세부 종류 다섯(거래유형 없음)');
  ok(M.CT_CATS[7].subs.map(M.CT_CATS[7].name).join() === '부동산전대차(주택),부동산전대차(상가)', '전대차 - 주택·상가 (+직접입력)');
  ok(/'__custom', '직접입력'/.test(js) && /data-in="ctp-custom"/.test(js), '세부 종류는 직접입력도 된다');

  /* 문서 이름이 고른 것을 따라간다 */
  const 아파트전세 = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트', deal: 'jeonse' });
  const 토지매매 = M.ctNewDoc('sale', null, { cat: 'realty', sub: '토지' });
  ok(M.ctTitle(아파트전세) === '부동산(아파트) 전세계약서' && M.ctTitle(토지매매) === '부동산(토지) 매매계약서'
     && M.ctTitle(M.ctNewDoc('presale', null, { cat: 'presale', sub: '' })) === '분양권 매매계약서'
     && M.ctTitle(M.ctNewDoc('sublease', null, { cat: 'sublease', sub: '상가' })) === '부동산전대차(상가) 계약서'
     && M.ctTitle(M.ctNewDoc('home-lease')) === '주택임대차계약서', '문서 이름 - 부동산(아파트) 전세계약서 · 부동산(토지) 매매계약서 · 분양권 매매계약서 …');
  아파트전세.deal.type = 'yearly';
  ok(M.ctTitle(아파트전세) === '부동산(아파트) 연세계약서', '거래유형을 바꾸면 이름도 바뀐다(연세)');
  ok(M.ctTitle({ form: 'lease', sub: '오피스텔', dt: 'monthly' }) === '부동산(오피스텔) 월세계약서', '목록 행(doc 없이 sub·dt 만)으로도 이름을 짓는다');

  /* 세부 종류로 법을 가른다 */
  ok(M.ct군({ form: 'lease', sub: '아파트' }) === 'home' && M.ct군({ form: 'lease', sub: '사무실' }) === 'shop' && M.ct군({ form: 'lease', sub: '토지' }) === 'gen'
     && M.ct군({ form: 'lease', sub: '상가주택' }) === 'shop', '주거 → 주택임대차보호법 · 상가·사무실 → 상가건물 임대차보호법 · 토지 → 민법');
  ok(아파트전세.clauses.some(c => c.id === 'renew' && /주택임대차보호법/.test(c.text))
     && M.ctNewDoc('lease', null, { cat: 'realty', sub: '사무실', deal: 'monthly' }).clauses.some(c => /상가건물 임대차보호법/.test(c.text))
     && !M.ctNewDoc('lease', null, { cat: 'realty', sub: '토지', deal: 'jeonse' }).clauses.some(c => c.id === 'renew'), '조항도 세부 종류에 맞춘다(토지는 갱신요구권 조항 없음)');

  /* 새 양식 일곱이 다 그려진다 - 빈 문서 · 값 넣은 문서 */
  for (const [form, cat, sub] of [['lease','realty','아파트'],['lease','realty','토지'],['sublease','sublease','주택'],['presale','presale','아파트'],['union','union',''],['rights','rights',''],['premium','premium','']]) {
    const d = M.ctNewDoc(form, null, { cat, sub, deal: form === 'lease' ? 'monthly' : undefined });
    let h = ''; try { h = M.ctDocHTML(d); } catch (e) { h = 'ERR ' + e.message; }
    ok(!h.startsWith('ERR') && h.includes('[특약사항]') && h.includes('개업<br>공인중개사') && !/undefined|NaN/.test(h),
       `${M.ctTitle(d)}: 빈 문서가 그려진다 (undefined·NaN 없음)`);
  }
  {
    const d = M.ctNewDoc('presale', null, { cat: 'presale', sub: '아파트' });
    Object.assign(d.deal, { orgPrice: 500000000, paid: 100000000, premium: 30000000, price: 130000000, down: 13000000 });
    d.property.bdNm = '미사 푸르지오'; d.property.part = '101동 1203호';
    const h = M.ctDocHTML(d);
    ok(h.includes('분양권(아파트) 매매계약서') && h.includes('[분양권의 표시]') && h.includes('미사 푸르지오') && h.includes('프리미엄') && h.includes('금 삼천만원정')
       && h.includes('제2조(권리의무의 승계)') && !h.includes('승계할 중도금 대출'), '분양권 - 표시 칸 · 금액 줄(넣은 것만) · 제2조 권리의무 승계');
  }
  {
    const d = M.ctNewDoc('sublease', null, { cat: 'sublease', sub: '주택', deal: 'monthly' });
    d.orig.lessor = '김임대'; d.orig.to = '2027-12-31';
    const h = M.ctDocHTML(d);
    ok(h.includes('[원 임대차계약의 표시]') && h.includes('김임대') && h.includes('전대인과 전차인은') && h.includes('제2조(전대차기간)') && h.includes('전차인에게 인도') && !h.includes('신규 계약'),
       '전대차 - 원 임대차 표 · 전대인/전차인 · 계약 종류 칸 없음');
  }
  {
    const d = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트', deal: 'yearly' });
    Object.assign(d.deal, { rent: 12000000, rentDay: '매년 3월 1일', rentWhen: '후불' });
    const h = M.ctDocHTML(d);
    ok(h.includes('차임(연세)') && h.includes('매년 3월 1일에 1년분을 한꺼번에 지급한다(후불)'), '연세 - 1년분 한꺼번에 · 선불/후불');
    const m = M.ctNewDoc('home-lease'); m.deal.type = 'monthly'; m.deal.rent = 500000; m.deal.rentDay = '25'; m.deal.rentWhen = '후불';
    ok(M.ctDocHTML(m).includes('매월 25일에 지급한다(후불)'), '월세 - 선불/후불을 고른 대로 적는다');
  }
  ok(/case 'ct-rentwhen'/.test(js) && /chipsHTML\(\['선불','후불'\]/.test(js), '월세·연세는 차임 지급을 선불/후불로 고른다');

  /* 조항은 빈칸이 있는 것만 고친다 */
  ok(js.includes('const ct빈칸조항 = t =>') && js.includes('고침 ? `<textarea class="inp"') && js.includes('<p class="ct-cltext">'), '조항 문구는 보여만 주고, 빈칸 (     ) 이 있는 조항만 고친다');

  /* 임대인 주소는 비워 둔다 · 사무소 주소는 가입 때 받은 것으로 */
  ok(js.includes("if(F.explain) 넣기(`parties.${갑}.addr`, 소유[0].addr);"), '서류를 읽어도 임대인·매도인 주소는 채우지 않는다(직접 적는다) - 확인·설명서는 그대로');
  ok(M.ctNewDoc('home-lease').broker.addr === '하남시 미사대로 550', '사무소 주소가 있으면 계약서에 자동으로 들어간다');
  S.agent.addr = '경기도 하남시 덕풍동';
  ok(M.ctNewDoc('home-lease').broker.addr === '', '명부의 동 이름 하나는 주소로 쓰지 않는다');
  S.agent.addr = '하남시 미사대로 550';
  ok(js.includes("addr: f['j-addr']||''") && js.includes('padding:11px 14px;background:var(--n50);border-radius:var(--r-sm);display:flex;align-items:center;gap:10px'), '자격 확인 단계에서 사무소 주소를 도로명으로 받는다');
  ok(/function accAddrHTML\(a\)/.test(js) && /what:'office-addr'/.test(js), '마이페이지에서 사무소 주소를 등록·변경한다');
  ok(js.includes('function ctAddrIn(path, label') && js.includes('ctAddrIn(`parties.${k}.addr`') && js.includes("ctAddrIn('broker.addr'")
     && /startsWith\('ct-a:'\) && CT\.doc/.test(js), '당사자·사무소 주소는 도로명 찾기로 고른다');

  /* 서류 발급 단계 */
  ok(/'세움터', 'https:\/\/www\.eais\.go\.kr'/.test(js) && /'인터넷등기소', 'https:\/\/www\.iros\.go\.kr'/.test(js) && /'토지이음', 'https:\/\/www\.eum\.go\.kr'/.test(js)
     && /\['bldx', '건축물대장 전유부'/.test(js), '서류 단계마다 발급 사이트로 바로 · 건축물대장은 표제부·전유부 둘');

  /* 목록 찾기 */
  ok(/data-in="ctq"/.test(js) && /function ctFilter\(rows\)/.test(js) && /data-act="ctq-st"/.test(js), '계약서 목록을 소재지·이름·종류·날짜로 찾는다 · 작성 중/날인본으로 거른다');
}

/* ── 갱신계약 - 원래 계약서는 그대로 (2026-10-30) ── */
{
  ok(/async function ctRenew\(id\)/.test(js) && /CT\.prevId = id/.test(js) && /prev_id: !CT\.id && CT\.prevId \? CT\.prevId : undefined/.test(js),
     '갱신계약은 지난 계약서를 불러와 새 계약서로 연다 - 저장하면 새 행(앞 계약서와 prev_id 로만 잇는다)');
  const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r; };
  let 불린 = [], 답 = () => new Response('[]', { status: 200 });
  globalThis.fetch = async (u, o = {}) => { 불린.push({ u: String(u), m: o.method || 'GET', b: o.body }); return 답(u, o); };
  const agent = { id: '11111111-1111-1111-1111-111111111111', role: 'agent' }, user = { id: 'u' };
  const 판 = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트', deal: 'jeonse' });
  답 = (u, o) => (o.method || 'GET') === 'GET' ? new Response('[{"id":"22222222-2222-2222-2222-222222222222"}]', { status: 200 }) : new Response('[{"id":"n","updated_at":"t"}]', { status: 200 });
  let res = 응답(); 불린 = [];
  await C.contractRoute({}, res, agent, user, { what: 'contract-save', form: 'lease', doc: 판, prev_id: '22222222-2222-2222-2222-222222222222' });
  const 넣음 = 불린.find(x => x.m === 'POST');
  ok(res.code === 200 && 넣음 && JSON.parse(넣음.b).prev_id === '22222222-2222-2222-2222-222222222222' && !불린.some(x => x.m === 'PATCH'),
     '갱신계약 저장 - 새 행으로 넣고 앞 계약서는 고치지 않는다');
  답 = (u, o) => (o.method || 'GET') === 'GET' ? new Response('[]', { status: 200 }) : new Response('[{"id":"n","updated_at":"t"}]', { status: 200 });
  res = 응답(); 불린 = [];
  await C.contractRoute({}, res, agent, user, { what: 'contract-save', form: 'lease', doc: 판, prev_id: '22222222-2222-2222-2222-222222222222' });
  ok(!('prev_id' in JSON.parse(불린.find(x => x.m === 'POST').b)), '남의 계약서 번호를 앞 계약서로 적어 와도 잇지 않는다');
  ok(/cat:doc->>cat,sub:doc->>sub,dt:doc->deal->>type,parties:doc->parties,renew:doc->renewOf/.test(fs.readFileSync(new URL('../api/_contract.js', import.meta.url), 'utf8')),
     '목록에 세부 종류·거래유형·당사자 이름이 함께 온다 - 찾기와 문서 이름에 쓴다');
}

/* ── 사무소 주소 저장 · 서류 판독 넷 ── */
{
  const feed = fs.readFileSync(new URL('../api/feed.js', import.meta.url), 'utf8');
  ok(/if \(b\.what === 'office-addr'\) return saveOfficeAddr\(res, chk\.agent, b\);/.test(feed) && /if \(!\/\\d\/\.test\(addr\)\) return res\.status\(400\)/.test(feed)
     && /sbUrl\('bk_agent', 'id=eq\.' \+ agent\.id\)/.test(feed), '사무소 주소는 내 파트너 행에만 · 숫자 없는 주소(동 이름만)는 받지 않는다');
  const SC = await import(길.api('_scan.js'));
  ok(SC.SCAN_MAX_FILES === 4 && SC.SCAN_KINDS.bldx === '건축물대장(전유부)' && SC.SCAN_KINDS.bld === '건축물대장(표제부)', '판독은 서류 넷까지 - 건축물대장 표제부·전유부를 따로 받는다');
}

/* ── 계약 일정·알림 (2026-10-30 대표님 '카카오 알림설정') ── */
{
  /* 영업일 - 관공서 공휴일·대체공휴일(노동절·제헌절 2026~) */
  ok(C.영업일째('2026-11-04', 15) === '2026-11-24' && C.영업일째('2026-12-21', 15) === '2027-01-12' && C.영업일째('2026-11-07', 1) === '2026-11-09',
     '토지거래허가 승인 예정일 = 신청일 포함 15영업일째(성탄절·신정 건너뜀 · 토요일 신청이면 월요일이 첫날)');
  ok(C.영업일전('2026-12-18', 10) === '2026-12-04' && C.영업일전('2026-12-18', 7) === '2026-12-09' && C.영업일전('2027-02-15', 7) === '2027-02-02',
     '법무사 예약 = 잔금일 7~10영업일 전(잔금일은 세지 않음 · 설 연휴·대체공휴일 건너뜀)');
  ok(!C.영업일인가('2027-05-03') && !C.영업일인가('2027-07-19') && !C.영업일인가('2027-12-27') && !C.영업일인가('2026-05-01')
     && C.영업일인가('2026-09-28') && C.영업일인가('2028-10-06'),
     '대체공휴일 - 노동절·제헌절·성탄절이 토요일이면 다음 월요일 · 추석이 토요일과만 겹치면(2026) 대체 없음');
  ok(C.날차(C.한국오늘(), C.공휴일끝) > 90, `공휴일 표가 석 달 넘게 남아 있다(${C.공휴일끝}까지) - 모자라면 다음 해 월력요항으로 서버·화면 두 곳을 고친다`);
  ok([...C.공휴일].join() === [...M.CT_공휴일].join(), '공휴일 표 - 서버와 화면이 같다');

  /* 설정 - 받는 곳·끈 항목·법무사 예약 시점 */
  const 기본 = C.알림설정();
  ok(기본.kakao && 기본.mail && !기본.off.length && 기본.lawyer.join() === '7,10', '기본 - 카카오톡·메일 모두 · 모든 항목 · 법무사 7~10영업일 전');
  ok(C.알림설정({ lawyer: [12, 5] }).lawyer.join() === '5,12' && C.알림설정({ lawyer: [0, 30] }).lawyer.join() === '7,10'
     && C.알림설정({ off: ['balance', '없는것', 'balance'], kakao: false }).off.join() === 'balance' && C.알림설정({ kakao: false }).kakao === false,
     '설정 다듬기 - 순서가 거꾸로면 바로잡고, 1~20 밖이면 기본값 · 모르는 항목은 버린다');
  ok(JSON.stringify(C.알림설정({ lawyer: [3, 9], off: ['mid'], mail: false })) === JSON.stringify(M.ct알림설정({ lawyer: [3, 9], off: ['mid'], mail: false })),
     '설정 다듬기 - 서버와 화면이 같다');

  /* 일정·체크(track) 받기 */
  ok(C.trackCheck({ permitDue: '2026-11-10', guideAt: '2026-12-01', permit: true, off: false, 뭐: 'x' }) !== null
     && JSON.stringify(C.trackCheck({ permitDue: '2026-11-10', guideAt: '2026-12-01', permit: true, off: false, 뭐: 'x' })) === '{"permitDue":"2026-11-10","guideAt":"2026-12-01","permit":true}'
     && C.trackCheck({ balanceDate: '12/18' }) === null && C.trackCheck([]) === null && C.trackCheck(null) === null,
     'track - 날짜 칸은 ISO 날짜만, 켬/끔은 true 만 담고 모르는 칸은 버린다');

  /* 일정 목록 - 서버와 화면이 같은 답 */
  const 표본 = [
    { form: 'sale', sub: '아파트', status: 'sealed', reported_at: null, cd: '2026-11-02', mid: '50000000', md: '2026-11-20', bd: '2026-12-18',
      track: { permit: true, permitDue: '2026-11-10', permitApplied: '2026-11-04', balanceDate: '2026-12-21', guideAt: '2026-12-10' } },
    { form: 'lease', sub: '오피스텔', status: 'draft', cd: '2026-11-05', mid: 0, md: '2026-11-20', bd: '2026-12-01', track: {} },
    { form: 'lease', sub: '상가', status: 'sealed', cd: '2026-11-05', bd: '2026-12-01' },
    { form: 'union', status: 'sealed', reported_at: '2026-11-30', cd: '2026-11-02', bd: '2027-02-15', track: { off: true } },
  ];
  for (const 설정 of [C.알림설정(), C.알림설정({ lawyer: [5, 12] })])
    ok(JSON.stringify(표본.map(c => C.일정목록(c, 설정))) === JSON.stringify(표본.map(c => M.ct일정목록(c, 설정))), `일정 목록 - 서버와 화면이 같다(법무사 ${설정.lawyer.join('~')})`);
  const 매매 = C.일정목록(표본[0]);
  const 찾 = k => 매매.find(e => e.k === k) || {};
  ok(찾('balance').날 === '2026-12-21' && 찾('balance').바뀜 && /잔금안내 마침/.test(찾('balance').메모)
     && 찾('lawyer').날 === C.영업일전('2026-12-21', 10) && 찾('lawyer').끝 === C.영업일전('2026-12-21', 7)
     && 찾('permitExpect').날 === '2026-11-24' && /2026-11-04 신청함/.test(찾('permitDue').메모)
     && 찾('report').날 === '2026-12-02' && 찾('report').이름 === '실거래신고 기한' && 매매.map(e => e.날).join() === [...매매.map(e => e.날)].sort().join(),
     '매매 일정 - 바뀐 잔금일을 따르고(법무사 예약도 거기서), 승인 예정일·신고 기한(계약일+30)을 날짜 순으로');
  const 오피스텔 = C.일정목록(표본[1]);
  ok(!오피스텔.some(e => e.k === 'mid') && !오피스텔.some(e => e.k === 'lawyer') && 오피스텔.find(e => e.k === 'report').이름 === '임대차 신고 기한'
     && !C.일정목록(표본[2]).some(e => e.k === 'report'), '임대차 - 중도금이 0이면 중도금 일정 없음 · 법무사 예약 없음 · 주거만 임대차 신고 기한');

  /* 오늘 알릴 것 */
  const 오늘것 = (c, 날, 설정 = C.알림설정()) => C.오늘알림(c, 설정, 날).map(e => `${e.k}:${e.남음}`).join();
  ok(오늘것(표본[0], '2026-12-04') === '' && 오늘것(표본[0], C.영업일전('2026-12-21', 10)) === 'lawyer:0' && 오늘것(표본[0], '2026-12-14') === 'balance:7'
     && 오늘것(표본[0], '2026-11-07') === 'permitDue:3' && 오늘것(표본[0], '2026-11-24') === 'permitExpect:0' && 오늘것(표본[0], '2026-11-01') === 'contract:1',
     '알릴 날 - 계약일 전날·당일, 잔금 7·3일 전·당일, 허가 약정일 3일 전·당일, 승인 예정일 당일, 법무사 예약 시작일');
  ok(오늘것(표본[0], '2026-11-25') === 'report:7' && 오늘것({ ...표본[0], status: 'draft' }, '2026-11-25') === '' && 오늘것({ ...표본[0], reported_at: '2026-11-20' }, '2026-11-25') === '',
     '신고 기한 알림은 날인본·신고 전일 때만');
  ok(오늘것(표본[3], '2027-02-15') === '' && 오늘것(표본[0], '2026-12-14', C.알림설정({ off: ['balance'] })) === '', '이 계약 알림을 끄거나 그 항목을 끄면 보내지 않는다');
  ok(C.알림제목({ k: 'balance', 이름: '잔금', 남음: 3 }) === '잔금 3일 전' && C.알림제목({ k: 'contract', 이름: '계약일', 남음: 1 }) === '계약일 전날'
     && C.알림제목({ k: 'mid', 이름: '중도금', 남음: 0 }) === '중도금 당일' && C.알림제목({ k: 'lawyer', 남음: 0 }) === '법무사 예약할 때입니다'
     && C.날짜글('2026-12-18') === '2026. 12. 18.(금)', '알림 제목 · 날짜 글');

  /* 일정·체크 저장 - 날인본도, 내 계약서만, track 한 칸만 */
  const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r; };
  let 불린 = [], 답 = () => new Response('[{"id":"x"}]', { status: 200 });
  globalThis.fetch = async (u, o = {}) => { 불린.push({ u: String(u), m: o.method || 'GET', b: o.body }); return 답(u, o); };
  process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
  const agent = { id: '11111111-1111-1111-1111-111111111111', role: 'agent' }, user = { id: 'u' };
  let res = 응답();
  await C.contractRoute({}, res, agent, user, { what: 'contract-track', id: '33333333-3333-3333-3333-333333333333', track: { guideAt: '2026-12-10', 뭐: 1 } });
  ok(res.code === 200 && 불린[0].m === 'PATCH' && /agent_id=eq\.11111111/.test(불린[0].u) && !/status=eq/.test(불린[0].u) && /select=id/.test(불린[0].u)
     && JSON.stringify(JSON.parse(불린[0].b)) === '{"track":{"guideAt":"2026-12-10"}}', '일정·체크 저장 - 내 계약서의 track 한 칸만(날인본도 된다)');
  res = 응답(); 불린 = [];
  await C.contractRoute({}, res, agent, user, { what: 'contract-track', id: '33333333-3333-3333-3333-333333333333', track: { balanceDate: '내일' } });
  ok(res.code === 400 && 불린.length === 0, '날짜 모양이 틀리면 DB 에 묻지 않는다');
  답 = () => new Response('[]', { status: 200 }); res = 응답();
  await C.contractRoute({}, res, agent, user, { what: 'contract-track', id: '33333333-3333-3333-3333-333333333333', track: {} });
  ok(res.code === 404, '남의 계약서면 404');
  답 = () => new Response('{"code":"PGRST204","message":"Could not find the \'track\' column of \'bk_contract\' in the schema cache"}', { status: 400 }); res = 응답();
  await C.contractRoute({}, res, agent, user, { what: 'contract-track', id: '33333333-3333-3333-3333-333333333333', track: {} });
  ok(res.code === 503 && res.body.need === '0032', 'track 칸이 아직 없으면 503 · 0032 마이그레이션 필요');
  /* 목록 - track 칸이 없으면 빼고 다시 읽는다(계약서 화면이 0032 전에도 멀쩡해야 한다) */
  let 번 = 0;
  답 = u => (++번 === 1 && /track/.test(u)) ? new Response('{"code":"42703","message":"column bk_contract.track does not exist"}', { status: 400 }) : new Response('[]', { status: 200 });
  res = 응답(); 불린 = [];
  await C.contractRoute({}, res, agent, user, { what: 'contracts' });
  ok(res.code === 200 && res.body.need32 === true && 불린.length === 2 && /,track&/.test(decodeURIComponent(불린[0].u)) && !/track/.test(decodeURIComponent(불린[1].u)),
     '목록 - 0032 전이면 track 없이 다시 읽고 need32 를 알린다(계약서 기능은 그대로)');

  /* 알림 설정 저장 · 화면 */
  const feed = fs.readFileSync(new URL('../api/feed.js', import.meta.url), 'utf8');
  ok(/if \(b\.what === 'alert-settings'\)\s+return readAlert\(res, chk\.agent\);/.test(feed) && /body: JSON\.stringify\(\{ settings: \{ \.\.\.x\.settings, alert \} \}\)/.test(feed)
     && /need: '0032'/.test(feed) && /kakaoReady: !!process\.env\.SOLAPI_TPL_SCHEDULE/.test(feed),
     '알림 설정 - 내 파트너 행의 settings.alert 만 바꾼다(다른 설정은 그대로) · 0032 전이면 저장 막고 알린다 · 카카오 템플릿이 켜졌는지 알린다');
  ok(/function ctPlanHTML\(doc\)/.test(js) && /data-act="ct-plan">일정·체크/.test(js) && /case 'ctk-guide':/.test(js) && /case 'ctk-permit':/.test(js) && /case 'ctk-off':/.test(js)
     && /k\.startsWith\('ctk:'\)/.test(js) && /what:'contract-track'/.test(js), '화면: 일정·체크 탭 - 잔금안내·토지거래허가·알림 켜고 끄기, 날짜 칸은 바로 저장');
  ok(/function ctAlertHTML\(\)/.test(js) && /data-act="cta-open"/.test(js) && /data-in="cta-a"/.test(js) && /what:'alert-settings-save'/.test(js)
     && /function ctUpcomingHTML\(rows\)/.test(js) && /\$\{ctUpcomingHTML\(전체\)\}/.test(js), '화면: 알림 설정(받는 곳·항목·법무사 예약 시점) · 다가오는 일정');
  ok((js.match(/CT\.id = null; CT\.row = null; CT\.track = \{\};/g) || []).length >= 6, '새 계약서를 열 때마다 앞 계약서의 일정·체크를 비운다 - 다른 계약서에 섞여 저장되지 않게');

  /* 0032 마이그레이션 */
  const sql = fs.readFileSync(new URL('../../beaverknock-app/supabase/migrations/0032_contract_track.sql', import.meta.url), 'utf8');
  ok(/add column if not exists track jsonb not null default '\{\}'::jsonb/.test(sql) && /add column if not exists settings jsonb not null default '\{\}'::jsonb/.test(sql)
     && /\(to_jsonb\(new\) - 'reported_at' - 'updated_at' - 'track'\) = \(to_jsonb\(old\) - 'reported_at' - 'updated_at' - 'track'\)/.test(sql)
     && /raise exception '날인본은 고칠 수 없습니다/.test(sql), '0032 - track·settings 칸 · 날인본도 track 은 바꾸고 나머지는 여전히 막는다');
  delete process.env.BK_URL; delete process.env.BK_SECRET_KEY;
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
