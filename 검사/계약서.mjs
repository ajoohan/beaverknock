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
  const db도c = { ...doc, property: { road: 'DB 에 저장된 주소' }, deal: { deposit: 100000000, down: 10000000, balanceDate: '2026-12-01' }, contractDate: '2026-11-06' };
  /* 필수 항목이 비면 서버도 확정하지 않는다 (2026-11-06) - DB 에 닿기 전(읽기만 하고 잠그지 않는다) */
  답 = (u, o) => (o.method || 'GET') === 'GET'
    ? new Response(JSON.stringify([{ id: 'x', status: 'draft', doc: { ...doc, deal: { deposit: 100000000 } } }]), { status: 200 })
    : new Response(JSON.stringify([{ sealed_at: 'now' }]), { status: 200 });
  ({ res } = await 돌려({ what: 'contract-seal', id: '33333333-3333-3333-3333-333333333333' }));
  ok(res.code === 400 && /계약금 · 잔금 지급일 · 계약일/.test(res.body.error) && 불린.every(x => x.m === 'GET'),
     '필수 항목(계약금·잔금일·계약일 등)이 비면 서버가 확정을 거절한다 - 잠그지 않는다');
  ok(C.확정필수('explain-home', {}) === null && C.확정필수('sale', { property: { road: 'a' }, deal: { price: 1, down: 1, balanceDate: 'x' }, contractDate: 'y' }) === null
     && /보증금/.test(C.확정필수('home-lease', {})) && /대금/.test(C.확정필수('sale', {})),
     '확정필수 - 확인·설명서는 보지 않는다 · 임대차는 보증금, 매매는 대금');
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
  ct일정목록, ct알림설정, ct영업일째, ct영업일전, CT_공휴일, CT_특약묶음, ct특약묶음, ct묶음문구, ct문구이름,
  ct기본특약, ct갱신특약, ct종료일, ct부가, CT_기본특약, CT_계약일조항, ct글날, ct이름외, ct지분 };`);
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
  /* 특약은 글이라 '상환계좌' 같은 말이 들어간다(기본 특약, 2026-11-05) - 칸 이름만 본다 */
  ok(!/rrn|jumin|idno|account|계좌/i.test(JSON.stringify({ ...d, specials: [] })), '새 계약서 데이터에 주민번호·계좌 칸이 없다');
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
  ok(불린[0].m === 'PATCH' && /status=eq\.sealed/.test(불린[0].u) && /form=in\.\(sale,presale,union,home-lease,lease\)/.test(불린[0].u) && Object.keys(본).join() === 'reported_at' && 본.reported_at,
     '신고 마침은 내 날인본 · 매매(분양권·입주권 포함)·주택임대차에만 · reported_at 한 칸만 바꾼다');
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
  const 중개사들 = { A1: { id: 'A1', name: '한상혁', phone: '010-1234-5678', alert: null }, A2: { id: 'A2', name: '둘', phone: '' },
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
  ok(/form=not\.like\.explain\*/.test(주소) && 주소.includes(`created_at=gte.${C.날더하기(오늘, -1200)}`) && /,track&/.test(주소) && /order=id/.test(주소)
     && /cd:doc->>contractDate/.test(주소) && /bd:doc->deal->>balanceDate/.test(주소),
     '확인·설명서를 뺀 1200일 안의 계약서를 읽는다(2년 임대차 만기 알림까지) - 일정 계산에 쓰는 날짜만 doc 에서 꺼낸다');
  ok(res.code === 200 && 메일 && 메일.length === 1 && 메일[0].to[0] === 'agent1@example.com' && /오늘 챙기실 계약 일정이 3건/.test(메일[0].subject)
     && 메일[0].html.includes('잠실 아파트') && 메일[0].html.includes('미사 802호') && 메일[0].html.includes('잔금 사흘 전')
     && !메일[0].html.includes('알릴 날 아님') && !메일[0].html.includes('새 판으로 바뀐 앞 판') && !메일[0].html.includes('작성 중인 새 판'),
     '메일은 중개사별 하루 한 통 - 신고 기한(날인본·신고 전) · 잔금 3일 전(작성 중도) · 새 판으로 바뀐 앞 판은 뺀다');
  ok(메일[0].html.includes('잔금안내(이체한도·준비서류) 전입니다') && /알림 설정/.test(메일[0].text), '잔금 알림에 잔금안내 여부 · 메일에 알림 설정 안내');
  ok(불린.filter(x => /bk_agent/.test(x.u)).every(x => /select=id,name,phone,alert:settings->alert&/.test(decodeURIComponent(x.u))),
     '중개사는 알림 설정만 꺼내 읽는다 - settings 통째(내 특약 문구 최대 200개)를 날마다 끌어오지 않는다');
  ok(카톡.length === 3 && 카톡.every(m => m.to === '01012345678' && m.kakaoOptions.templateId === 'KA01TP-SCHEDULE')
     && 카톡.some(m => m.kakaoOptions.variables['#{일정}'] === '실거래신고 기한 7일 전' && m.kakaoOptions.variables['#{물건}'] === '잠실 아파트')
     && 카톡.some(m => m.kakaoOptions.variables['#{일정}'] === '임대차 신고 기한 당일')
     && 카톡.some(m => m.kakaoOptions.variables['#{일정}'] === '잔금 3일 전' && m.kakaoOptions.variables['#{확인}'] === '잔금안내(이체한도·준비서류) 전입니다')
     && 카톡.every(m => ['#{이름}', '#{일정}', '#{날짜}', '#{물건}', '#{확인}'].every(k => String(m.kakaoOptions.variables[k] || '').length))
     && res.body.카톡 === 3, '카카오 알림톡은 일정 하나에 한 통 - 템플릿 변수 다섯(이름·일정·날짜·물건·확인)을 다 채운다');

  /* 설정 - 카카오 끄기 · 잔금 항목 끄기 */
  중개사들.A1.alert = { kakao: false, off: ['balance'] };
  메일 = null; 카톡 = []; res = 응답(); 불린 = [];
  await C.reportDueCron({ headers: { authorization: 'Bearer cron-secret', host: 'beaverknock.co.kr' } }, res);
  ok(카톡.length === 0 && 메일 && 메일.length === 1 && !메일[0].html.includes('잔금 사흘 전') && /2건/.test(메일[0].subject), '설정대로 - 카카오톡을 끄면 안 보내고, 끈 항목(잔금)은 메일에서도 뺀다');
  중개사들.A1.alert = null;
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

/* ── 양쪽에서 적기 · 필수 항목 · 임시저장 (2026-11-06 대표님) ── */
{
  ok(/id="ctPv">\$\{ct책상HTML\(doc\)\}/.test(js) && /box\.innerHTML = typeof html === 'string' \? html : ct보기HTML\(CT\.doc\);/.test(js) && /CT편집칸 = !ctSealed\(\) && CT\.mode !== 'extra' && !F\.explain;\s*try\{ return ct보기HTML\(doc\); \} finally \{ CT편집칸 = false; \}/.test(js),
     '바로 적는 칸은 PC 책상 미리보기에서만 - 인쇄 · 날인본 · 부속 서류는 종이 그대로');
  ok(/if\(pv\.contains\(document\.activeElement\)\)\{ CT\.pvStale = true; return; \}/.test(js),
     '오른쪽 서류에서 적는 중에는 미리보기를 다시 그리지 않는다(커서 지킴)');
  ok(/ctSet\(CT\.doc, path, 글\); const L = 왼\('ct:' \+ path\); if\(L\) L\.value = 글;/.test(js) && /const L = 왼\('ct\$:' \+ path\); if\(L\) L\.value = n \? comma\(String\(n\)\) : '';/.test(js),
     '오른쪽에서 적은 값은 왼쪽 칸에도 같은 글로 들어간다');
  const 읽기 = new Function(js.slice(js.indexOf('function ct날짜읽기'), js.indexOf('/* 책상 미리보기')) + 'return ct날짜읽기;')();
  ok(읽기('2026년 3월 5일') === '2026-03-05' && 읽기('2026.3.5') === '2026-03-05' && 읽기('20260305') === '2026-03-05'
     && 읽기('') === '' && 읽기('2026년 3') === null && 읽기('2026-02-30') === null, '서류에 적은 날짜 - 여러 모양을 읽고, 덜 적은 것은 그대로 둔다');
  ok(/case 'ct-seal': \{[\s\S]{0,300}if\(빠짐\.length\)\{ CT\.req = true;/.test(js) && /case 'ct-seal-go': \{\s*S\.modal = null;\s*if\(CT\.doc && ct필수빠짐\(\)\.size\)/.test(js),
     '필수 칸이 비면 확정 창을 열지 않고 빠진 칸을 보여 준다 (확정하기 직전에도 다시 본다)');
  ok(/\['deal\.down', '계약금'\]/.test(js) && /\['contractDate', '계약일'\]/.test(js) && /\['broker\.regNo', '중개사무소 등록번호'\]/.test(js) && /data-act="ct-req-go"/.test(js),
     '필수 항목 목록과 빠진 칸으로 가는 안내 단추');
  ok(/'임시저장'/.test(js) && /function ct자동저장\(\)/.test(js) && /if\(!CT\.id && !\(CT\.doc\.property && CT\.doc\.property\.road\)\) return;/.test(js),
     '임시저장 단추 + 멈춘 뒤 자동 임시저장(새 계약서는 소재지를 넣은 뒤부터)');
}

/* ── 기존 계약서 복사 · 진행률 · 목록 거르기 (2026-11-06 파트너 기획) ── */
{
  ok(/const CT_복사칸 = \[\['property', [^\]]+\], \['parties', [^\]]+\], \['specials', [^\]]+\], \['deal', [^\]]+\]\];/.test(js) && /const ct복사할 = \(\) => CT\.copyParts \|\| \['property', 'parties', 'specials'\];/.test(js),
     '복사 - 목적물 · 당사자 · 특약은 기본으로 가져오고 금액 · 날짜는 고를 때만');
  ok(/const d = ctNewDoc\(원\.form, null, \{ cat: 원\.cat, sub: 원\.sub, deal: 원\.deal && 원\.deal\.type \}\);/.test(js) && /CT\.dirty = true; CT\.mode = 'edit'; ctGo\('#\/partner\/contract\/new'\);\s*toast\(`지난 계약서에서/.test(js),
     '복사는 같은 양식의 새 계약서(사무소 칸 · 조항은 지금 값) - 원래 계약서는 그대로');
  ok(/종류\('copy', '기존 계약서 복사'/.test(js) && /data-act="\$\{갱신고르기 === 'copy' \? 'ct-copy'/.test(js) && /data-act="ct-copy-this"/.test(js),
     '복사 시작 - 계약서 작성의 ‘기존 계약서 복사’ · 작성 화면의 ‘복사해서 새로’');
  ok(/function ct진행HTML\(\)/.test(js) && /\$\{ct진행HTML\(\)\}\$\{ct필수안내HTML\(\)\}/.test(js) && /칸\.classList\.add\('ct-just'\)/.test(js),
     '진행률(필수 항목 n / m) · 왼쪽에서 고친 칸은 서류에서 잠깐 노랗게');
  ok(/function ct요약HTML\(전체\)/.test(js) && /CT\.qs === 'unrep' \? r\.status === 'sealed' && ct신고\(r\) && !r\.reported_at/.test(js) && /CT\.qp === 'next'\) return d >= 오늘 && d <= ct날더하기\(오늘, 30\)/.test(js),
     '목록 - 요약 카드 · 신고 전 · 종류 · 기간(고친 날 · 계약일 · 잔금일) 거르기');
}

/* ── 서식 자료실 · 입력 도우미 · 사무소 기본값 · 토지거래허가 흐름 (2026-11-06 파트너 기획) ── */
{
  ok(/\['#\/partner\/contracts\/forms', '서식 자료실', 'doc', 'ctf'\]/.test(js) && /function ct빈서식HTML\(kind, key\)/.test(js) && /case 'ctf-print': \{ const \[k, key\] = String\(v\)\.split\('\|'\); return ctPrint\(ct빈서식HTML\(k, key\)\); \}/.test(js),
     '서식 자료실 - 계약서 · 확인·설명서 · 기타 서식 빈 양식을 인쇄 · PDF');
  ok(/CT\.mode = 앞\.mode; CT\.extraTab = 앞\.tab; CT\.extraRc = 앞\.rc; CT\.track = 앞\.track;/.test(js), '빈 부속 서류를 그린 뒤 지금 계약서의 탭 · 부속 값은 그대로 돌려놓는다');
  ok(/function ct입력값\(doc\)/.test(js) && /data-act="ct-hb-open"/.test(js) && /https:\/\/irts\.molit\.go\.kr/.test(js) && /case 'ctk-ec':/.test(js),
     '한방 · 전자계약 입력 도우미 - 입력 순서대로 칸마다 복사 · 전자계약 표시');
  ok(/const EX_사무소칸 = \['ex\.trust', 'ex\.jointMortgage', 'ex\.smallRange', 'ex\.smallAmt'/.test(js) && /djSend\(\{ op:'put', name: EX_사무소이름, road: '', v: 값 \}\)/.test(js) && /DJ\.list\.filter\(d => d\.name !== EX_사무소이름\)/.test(js),
     '확인·설명서 사무소 기본값 - 단지 목록의 한 줄로 저장, 단지 목록에는 안 보인다 · 새 확인·설명서 빈칸에 저절로');
  ok(/const ex색안내 = /.test(js) && /CT\.filled2 && CT\.filled2\.has\(path\) \? ' dj' : ''/.test(js), '확인·설명서 칸 색 - 서류에서(남색) · 단지 · 기본값에서(보라)');
  ok(/const CT_허가단계 = \[\['permitPaid', '약정금 입금'\], \['permitAgreed', '약정'\], \['permitApplied', '허가 신청'\], \['permitOk', '허가 승인'\]\];/.test(js)
     && /if\(신청 && !t\.permitOk\) out\.push\(\{ k: 'permitExpect'/.test(js),
     '토지거래허가 흐름 - 약정금 입금 → 약정 → 허가 신청 → 허가 승인 · 승인되면 승인 예정일 알림은 멈춘다');
  ok(JSON.stringify(C.trackCheck({ permitPaid: '2026-11-01', permitAgreed: '2026-11-02', permitOk: '2026-11-20', ec: true, hb: true })) === JSON.stringify({ permitPaid: '2026-11-01', permitAgreed: '2026-11-02', permitOk: '2026-11-20', hb: true, ec: true })
     && C.trackCheck({ permitOk: '11월' }) === null, '서버도 허가 단계 날짜 · 전자계약 표시를 받는다(날짜 모양만)');
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
  ok(/if\(!isMo\(\)\)\{\s*const 신고면[\s\S]{0,200}const 판 = CT\.mode === 'scan' && !잠김 \? ctScanHTML\(\) : CT\.mode === 'plan' && !F\.explain \? ctPlanHTML\(doc\) : CT\.mode === 'extra' && !F\.explain \? ctExtraHTML\(doc\) : 신고면 \? ctReportSide\(doc\) : \(잠김 \? '' : ctScanBanner\(\)\) \+ \(F\.explain \? exEditor\(doc\) \+[\s\S]{0,260}: ctFormHTML\(doc\)\);/.test(js)
     && /return ctDeskShell\(doc, 판, 신고면\);/.test(js) && /\$\{ctFormHTML\(doc\)\}/.test(js),
     'PC 는 입력 판 | 미리보기 한 화면(계약서·확인·설명서·신고 도우미 모두), 휴대폰은 같은 입력 구획을 카드로 쌓는다');
  /* 2026-11-05 - 부속 서류 탭에서는 고른 서류(영수증·정산서·인계 확인서)를, 그 밖에는 계약서를 그린다(ct보기HTML) */
  ok(/<div class="ctx-desk" id="ctDesk"><div class="ct-sheet" id="ctPv">\$\{ct책상HTML\(doc\)\}<\/div><\/div>/.test(js)
     && /function ct보기HTML\(doc\)\{[\s\S]{0,120}if\(CT\.mode !== 'extra' \|\| F\.explain\) return ctDocHTML\(doc\);/.test(js)
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
     && /\.ctx\{[^}]*height:100dvh;/.test(css) && !/\.ctx\{[^}]*min-height:560px/.test(css) && !/margin-top:-28px/.test(css) && js.includes('<span class="ctx-badge">${agentBadge()}${S.user ? userMenu({ admin: true }) : \'\'}</span>'),
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
  ok(/if\(n\)\{ 확인창\(`서식을 바꾸면 \$\{n\}칸의 값이 지워집니다`/.test(js) && /\.then\(바꿈 => \{ if\(바꿈 && CT\.doc/.test(js) && /서식을 바꾸면 새 서식에 없는 칸의 값은 지워집니다/.test(js),
     '서식 바꾸기 - 지워질 값이 있으면 사이트의 묻는 창으로 먼저 묻고(2026-10-30, 브라우저 기본 창 대신), 안내 문구도 동작과 같다');
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

  /* 서류 발급 단계 - 2026-10-30 브라우저로 열어 확인한 주소. 세움터는 발급 화면, 토지이음은 열람 화면으로 바로 간다.
     인터넷등기소는 메뉴가 스크립트로만 열려 바로 가는 주소가 없다 - 첫 화면 + 메뉴 이름 */
  ok(js.includes("'세움터', '건축물대장 발급', 'https://www.eais.go.kr/moct/bci/aaa02/BCIAAA02L01'")
     && js.includes("'인터넷등기소', '부동산 열람·발급', 'https://www.iros.go.kr'")
     && js.includes("'토지이음', '토지이용계획 열람', 'https://www.eum.go.kr/web/ar/lu/luLandDet.jsp'")
     && /\['bldx', '건축물대장 전유부'/.test(js) && !/토지이음에서 발급/.test(js),
     '서류마다 받는 곳으로 바로(세움터 발급 · 토지이음 열람 화면) · 인터넷등기소는 메뉴 이름까지 · 건축물대장은 표제부·전유부 둘');

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
  { const 패 = 불린.find(x => x.m === 'PATCH');
  ok(res.code === 200 && 패 && /agent_id=eq\.11111111/.test(패.u) && !/status=eq/.test(패.u) && /select=id/.test(패.u)
     && JSON.stringify(JSON.parse(패.b)) === '{"track":{"guideAt":"2026-12-10"}}', '일정·체크 저장 - 내 계약서의 track 한 칸만(날인본도 된다)'); }
  /* 링크 번호는 끊기만 올린다 - 오래된 track 저장(shareN 없음·0)이 끊은 링크를 되살리지 않는다(2026-11-05 리뷰) */
  { const 앞답 = 답; 답 = (u, o) => (o && o.method === 'PATCH') ? new Response('[{"id":"x"}]', { status: 200 }) : new Response('[{"track":{"shareN":3,"off":true}}]', { status: 200 });
    res = 응답(); 불린 = [];
    await C.contractRoute({}, res, agent, user, { what: 'contract-track', id: '33333333-3333-3333-3333-333333333333', track: { state: 'doing', shareN: 0 } });
    ok(res.code === 200 && JSON.parse(불린.find(x => x.m === 'PATCH').b).track.shareN === 3 && JSON.parse(불린.find(x => x.m === 'PATCH').b).track.state === 'doing', '일반 track 저장은 서버의 링크 번호를 지킨다');
    res = 응답(); 불린 = [];
    await C.contractRoute({}, res, agent, user, { what: 'contract-share-cut', id: '33333333-3333-3333-3333-333333333333' });
    ok(res.code === 200 && res.body.track.shareN === 4 && res.body.track.off === true, '끊기는 서버가 지금 번호를 읽어 하나 올린다(다른 칸은 그대로)');
    /* 읽은 뒤 끊기가 번호를 올렸으면(조건에 안 맞아 0줄) 다시 읽어 다시 쓴다 */
    let 번 = 3, 막 = 1; 답 = (u, o) => { if (o && o.method === 'PATCH') { if (막-- > 0) { 번 = 4; return new Response('[]', { status: 200 }); } return new Response('[{"id":"x"}]', { status: 200 }); }
      return new Response(JSON.stringify([{ track: { shareN: 번 } }]), { status: 200 }); };
    res = 응답(); 불린 = [];
    await C.contractRoute({}, res, agent, user, { what: 'contract-track', id: '33333333-3333-3333-3333-333333333333', track: { state: 'done' } });
    const 패들 = 불린.filter(x => x.m === 'PATCH');
    ok(res.code === 200 && 패들.length === 2 && /track->>shareN=eq\.3/.test(decodeURIComponent(패들[0].u)) && /track->>shareN=eq\.4/.test(decodeURIComponent(패들[1].u)) && JSON.parse(패들[1].b).track.shareN === 4,
       '링크 번호가 읽은 뒤 바뀌면 다시 읽어 새 번호로 쓴다 - 끊은 링크를 되살리지 않는다');
    답 = 앞답; }
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
  ok(/if \(b\.what === 'alert-settings'\)\s+return readAlert\(res, chk\.agent\);/.test(feed) && /설정고침\(agent, \(\) => \(\{ patch: \{ alert \} \}\)\)/.test(feed) && /settings: \{ \.\.\.x\.settings, \.\.\.y\.patch, rev: rev \+ 1 \}/.test(feed)
     && /need: '0032'/.test(feed) && /kakaoReady: !!process\.env\.SOLAPI_TPL_SCHEDULE/.test(feed),
     '알림 설정 - 내 파트너 행의 settings.alert 만 바꾼다(다른 설정은 그대로) · 0032 전이면 저장 막고 알린다 · 카카오 템플릿이 켜졌는지 알린다');
  ok(/function ctPlanHTML\(doc\)/.test(js) && /data-act="ct-plan">일정·체크/.test(js) && /case 'ctk-guide':/.test(js) && /case 'ctk-permit':/.test(js) && /case 'ctk-off':/.test(js)
     && /k\.startsWith\('ctk:'\)/.test(js) && /what:'contract-track'/.test(js), '화면: 일정·체크 탭 - 잔금안내·토지거래허가·알림 켜고 끄기, 날짜 칸은 바로 저장');
  ok(/function ctAlertHTML\(늘펼침\)/.test(js) && /\$\{ctAlertHTML\(true\)\}/.test(js) && /data-in="cta-a"/.test(js) && /what:'alert-settings-save'/.test(js)
     && /function ctUpcomingHTML\(rows, 날수 = 14, 최대 = 8\)/.test(js) && /const 일정 = ctUpcomingHTML\(전체\);/.test(js) && /ctUpcomingHTML\(전체, 60, 40\)/.test(js),
     '화면: 계약서 › 일정·알림 - 알림 설정(받는 곳·항목·법무사 예약 시점)은 늘 펼침, 60일 일정 · 목록 옆은 2주 안 일정');
  ok((js.match(/CT\.id = null; CT\.row = null; CT\.track = \{\};/g) || []).length >= 6, '새 계약서를 열 때마다 앞 계약서의 일정·체크를 비운다 - 다른 계약서에 섞여 저장되지 않게');

  /* 0032 마이그레이션 */
  const sql = fs.readFileSync(new URL('../../beaverknock-app/supabase/migrations/0032_contract_track.sql', import.meta.url), 'utf8');
  ok(/add column if not exists track jsonb not null default '\{\}'::jsonb/.test(sql) && /add column if not exists settings jsonb not null default '\{\}'::jsonb/.test(sql)
     && /\(to_jsonb\(new\) - 'reported_at' - 'updated_at' - 'track'\) = \(to_jsonb\(old\) - 'reported_at' - 'updated_at' - 'track'\)/.test(sql)
     && /raise exception '날인본은 고칠 수 없습니다/.test(sql), '0032 - track·settings 칸 · 날인본도 track 은 바꾸고 나머지는 여전히 막는다');
  delete process.env.BK_URL; delete process.env.BK_SECRET_KEY;
}

/* ── 내 특약 문구함 (2026-10-30 대표님 - 자주 쓰는 특약을 매매·임대차·갱신계약 등으로 나눠 저장해 두고 불러 쓴다) ── */
{
  ok(JSON.stringify(C.특약묶음) === JSON.stringify(M.CT_특약묶음) && Object.keys(C.특약묶음).join() === 'sale,lease,renew,etc',
     '묶음(매매·임대차·갱신계약·기타) - 서버와 화면이 같다');
  const 아파트전세 = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트', deal: 'jeonse' });
  ok(M.ct특약묶음(아파트전세) === 'lease' && M.ct특약묶음({ ...아파트전세, kind: 'agree' }) === 'renew' && M.ct특약묶음({ ...아파트전세, kind: 'right' }) === 'renew'
     && M.ct특약묶음({ ...M.ctNewDoc('sublease'), renewOf: { id: 'x' } }) === 'renew' && M.ct특약묶음(M.ctNewDoc('sublease')) === 'lease'
     && M.ct특약묶음(M.ctNewDoc('home-lease')) === 'lease' && M.ct특약묶음(M.ctNewDoc('sale')) === 'sale' && M.ct특약묶음(M.ctNewDoc('presale')) === 'sale'
     && M.ct특약묶음(M.ctNewDoc('union')) === 'sale' && M.ct특약묶음(M.ctNewDoc('rights')) === 'etc' && M.ct특약묶음(M.ctNewDoc('premium')) === 'etc',
     '이 계약서에 맞는 묶음 - 지난 계약서에서 불러왔거나 재계약·갱신요구권이면 갱신계약 · 임대차·전대차 · 매매·분양권·입주권 · 나머지는 기타');
  ok(M.ct묶음문구([{ id: '1', g: 'lease', tag: '' }, { id: '2', g: 'lease', tag: '아파트' }, { id: '3', g: 'sale', tag: '아파트' }], 'lease', '아파트').map(p => p.id).join() === '2,1'
     && M.ct문구이름('가'.repeat(30)) === '가'.repeat(26) + '…' && M.ct문구이름(' 짧은  문구 ') === '짧은 문구',
     '한 묶음의 문구 - 같은 세부 종류(아파트)에서 저장한 것을 앞에 · 칩 이름은 앞 26자');

  /* 저장된 목록 다듬기 */
  const 번호 = n => n.toString(16).padStart(12, '0');
  const 다듬 = C.특약문구들([{ id: 'a1b2c3d4e5f6', g: 'lease', t: '  관리비는 임차인이 낸다.  ', tag: '아파트' }, { id: 'a1b2c3d4e5f6', g: 'sale', t: '겹친 번호' },
    { id: 'bad', g: 'sale', t: '번호 모양이 틀림' }, { id: 'ffffffffffff', g: '모름', t: '모르는 묶음' }, { id: 'eeeeeeeeeeee', g: 'sale', t: '   ' }, null, 'x']);
  ok(다듬.length === 2 && 다듬[0].t === '관리비는 임차인이 낸다.' && 다듬[0].tag === '아파트' && 다듬[1].g === 'etc' && C.특약문구들('x').length === 0
     && C.특약문구들(Array.from({ length: 250 }, (_, i) => ({ id: 번호(i), g: 'sale', t: 't' + i }))).length === C.특약문구최대,
     '저장된 목록 다듬기 - 겹친 번호·틀린 번호·빈 글은 버리고 모르는 묶음은 기타 · 최대 200개');

  /* 넣기·고치기·지우기 */
  const y = C.특약문구고침([], { op: 'add', g: 'lease', t: '반려동물을 기르지 않는다.', tag: '아파트' });
  ok(y.list.length === 1 && /^[0-9a-f]{12}$/.test(y.id) && y.list[0].g === 'lease' && y.list[0].tag === '아파트', '넣기 - 번호는 서버가 짓는다 · 저장한 계약서의 세부 종류를 함께');
  ok(C.특약문구고침(y.list, { op: 'add', g: 'lease', t: ' 반려동물을 기르지 않는다. ' }).code === 409
     && C.특약문구고침(y.list, { op: 'add', g: 'renew', t: '반려동물을 기르지 않는다.' }).list.length === 2, '같은 묶음에 같은 문구는 또 넣지 않는다(다른 묶음은 된다)');
  ok(/주민등록번호/.test(C.특약문구고침([], { op: 'add', g: 'sale', t: '매도인 900101-1234567 의 위임을 받아' }).error || '')
     && C.특약문구고침([], { op: 'add', g: 'sale', t: '   ' }).code === 400 && C.특약문구고침([], { op: 'add', g: 'sale', t: '가'.repeat(1001) }).code === 400
     && /200개까지/.test(C.특약문구고침(Array.from({ length: 200 }, (_, i) => ({ id: 번호(i), g: 'sale', t: 't' + i })), { op: 'add', g: 'sale', t: '새것' }).error || ''),
     '주민등록번호가 든 문구 · 빈 문구 · 1000자 넘는 문구는 받지 않는다 · 200개가 차면 더 넣지 않는다');
  ok(C.특약문구고침(y.list, { op: 'set', id: y.id, g: 'renew' }).list[0].g === 'renew' && C.특약문구고침(y.list, { op: 'set', id: y.id, t: '고친 문구' }).list[0].t === '고친 문구'
     && C.특약문구고침(y.list, { op: 'set', id: y.id, g: '모름' }).code === 400 && C.특약문구고침(y.list, { op: 'set', id: y.id, t: ' ' }).code === 400
     && C.특약문구고침(y.list, { op: 'set', id: y.id, t: '임대인 900101-1234567' }).code === 400,
     '고치기 - 묶음·문구만 · 모르는 묶음·빈 문구·주민등록번호는 받지 않는다');
  ok(C.특약문구고침(y.list, { op: 'del', id: y.id }).list.length === 0 && C.특약문구고침(y.list, { op: 'del', id: 'ffffffffffff' }).code === 404
     && C.특약문구고침(y.list, { op: '뭐' }).code === 400, '지우기 · 없는 번호는 404 · 모르는 요청은 400');

  /* feed.js 를 실제로 돌린다 - 내 파트너 행의 settings.phrases 만 바꾸고 알림 설정은 그대로 */
  const F = (await import(길.api('feed.js'))).default;
  const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); r.setHeader = () => {}; return r; };
  process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
  let 설정 = { alert: { kakao: false, mail: true, off: [], lawyer: [7, 10] }, phrases: [{ id: 'a1b2c3d4e5f6', g: 'lease', t: '관리비는 정액으로 한다.', tag: '' }] };
  let 역할 = 'agent', 불린 = [], 막기 = 0;
  globalThis.fetch = async (u, o = {}) => { u = String(u); const m = o.method || 'GET'; 불린.push({ u, m, b: o.body });
    if (/auth\/v1\/user/.test(u)) return new Response(JSON.stringify({ id: 'u-phr' }), { status: 200 });
    if (/bk_agent/.test(u) && m === 'GET' && /select=settings/.test(u)) return new Response(JSON.stringify([{ settings: 설정 }]), { status: 200 });
    if (/bk_agent/.test(u) && m === 'GET') return new Response(JSON.stringify([{ id: 'A1', role: 역할, status: 'approved' }]), { status: 200 });
    if (/bk_agent/.test(u) && m === 'PATCH') { if (막기 > 0) { 막기--; 설정 = { ...설정, rev: (설정.rev || 0) + 1 }; return new Response('[]', { status: 200 }); } 설정 = JSON.parse(o.body).settings; return new Response(JSON.stringify([{ id: 'A1' }]), { status: 200 }); }
    return new Response('{}', { status: 404 }); };
  const 부름 = async b => { const res = 응답(); 불린 = []; await F({ method: 'POST', headers: { authorization: 'Bearer ' + 'p'.repeat(32) }, body: b, query: {} }, res); return res; };
  let res = await 부름({ what: 'phrases-save', op: 'add', g: 'renew', t: '차임은 5% 안에서 올린다.', tag: '아파트' });
  ok(res.code === 200 && res.body.phrases.length === 2 && 설정.phrases.length === 2 && 설정.alert.kakao === false && /^[0-9a-f]{12}$/.test(res.body.id)
     && 불린.some(x => x.m === 'PATCH' && /bk_agent\?id=eq\.A1&/.test(x.u) && /or=\(settings->>rev\.is\.null,settings->>rev\.eq\.0\)/.test(decodeURIComponent(x.u))), '넣기 - 내 파트너 행의 settings.phrases 에 하나 더 · 알림 설정은 그대로');
  res = await 부름({ what: 'phrases' });
  ok(res.code === 200 && res.body.phrases.length === 2 && res.body.phrases[1].tag === '아파트', '불러오기');
  res = await 부름({ what: 'phrases-save', op: 'add', g: 'sale', t: '매수인 900101-1234567' });
  ok(res.code === 400 && 설정.phrases.length === 2 && !불린.some(x => x.m === 'PATCH') && res.body.phrases.length === 2, '주민등록번호가 든 문구는 서버가 막는다 - 지금 목록을 돌려준다');
  res = await 부름({ what: 'phrases-save', op: 'del', id: 'a1b2c3d4e5f6' });
  ok(res.code === 200 && 설정.phrases.length === 1 && 설정.phrases[0].g === 'renew', '지우기');
  /* 다른 기기가 그 사이 고쳤으면(판 번호가 달라 0줄) 다시 읽어 다시 고친다 - 세 번 다 막히면 409 */
  막기 = 1; res = await 부름({ what: 'phrases-save', op: 'add', g: 'etc', t: '다시 읽어 넣는다.' });
  ok(res.code === 200 && 설정.phrases.some(p => p.t === '다시 읽어 넣는다.') && 불린.filter(x => x.m === 'PATCH').length === 2 && /settings->>rev=eq./.test(decodeURIComponent(불린.filter(x => x.m === 'PATCH')[1].u)), '판 번호가 어긋나면 다시 읽어 다시 고친다');
  막기 = 3; res = await 부름({ what: 'phrases-save', op: 'add', g: 'etc', t: '못 넣는다.' });
  ok(res.code === 409 && !설정.phrases.some(p => p.t === '못 넣는다.'), '세 번 다 어긋나면 409 - 다시 눌러 달라고 한다');
  막기 = 0;
  역할 = 'owner';
  res = await 부름({ what: 'phrases' });
  ok(res.code === 403, '소유자·시행사는 쓰지 않는다 - 계약서 도구라 공인중개사만');
  delete process.env.BK_URL; delete process.env.BK_SECRET_KEY;

  /* 화면 */
  ok(/function ctPhrHTML\(doc\)/.test(js) && /\$\{ctPhrHTML\(doc\)\}/.test(js) && /data-act="phr-pick"/.test(js) && /data-act="phr-save"/.test(js)
     && /data-act="phr-add"/.test(js) && /data-act="phr-del"/.test(js) && /data-act="phr-g"/.test(js) && /k\.startsWith\('phr:'\)/.test(js)
     && /what:'phrases'/.test(js) && /what:'phrases-save'/.test(js), '화면: 특약마다 ‘내 특약으로’(묶음 고르기) · 묶음 탭 칩으로 넣기 · 관리(고치기·옮기기·지우기)');
}

/* ── 문서 글꼴 (2026-10-30 대표님 '계약서 양식의 폰트는 변경이 불가능한가?') ── */
{
  const d = M.ctNewDoc('home-lease'), 옛 = { ...d }; delete 옛.font;
  ok(d.font === 'sans' && /<div class="ctdoc f-sans">/.test(M.ctDocHTML(d)) && /<div class="ctdoc">/.test(M.ctDocHTML(옛)),
     '계약서 글꼴 - 새 계약서는 고딕(Pretendard)으로 시작 (2026-10-30 \'프리텐다드나 본고딕으로\') · font 가 없는 예전 계약서는 명조 그대로');
  const e = M.exNewDoc(d, 'explain-home');
  ok(e.font === 'sans' && /class="ctdoc exdoc f-sans"/.test(M.exDocHTML(e)) && !('font' in M.exNewDoc(옛, 'explain-home')), '계약서에서 만든 확인·설명서는 그 계약서의 글꼴을 따른다');
  ok(/\.ctdoc\.f-sans\{font-family:var\(--font\)\}/.test(css) && /data-act="ct-font"/.test(js) && /case 'ct-font':/.test(js) && /\$\{ct글꼴칸\(doc, 잠김\)\}/.test(js),
     '고딕은 사이트 글꼴(어느 기기에서 찍어도 같다) · 미리보기 위에서 고른다 · 날인본은 못 바꾼다');
}

/* ── 계약서 작성 화면 (2026-10-30 대표님 '완성도 있게 · 단추는 배경색 상자로 더 구분 · 필요하면 모션') ──
   화면 함수를 실제로 돌린다 - 움직임 표시는 누른 직후 한 번만, 다 고른 순간 만들기 줄이 한 번 켜진다 */
{
  const 마법 = js.slice(js.indexOf('const CT_빠른 = ['), js.indexOf('/* 목록 검색 - 소재지'));
  const W = new Function('S', 'esc', 'apiFetch', '세션있음', 'render', 'toast', 'DZ_ICO', 'ct찾기줄', 'ctRowsHTML', 'ctFilter',
    `${몸}\n${확몸}\n${마법}\nreturn { ctWizHTML, CT };`)(S, esc, () => {}, () => false, () => {}, () => {}, { building: 'M0 0', doc: 'M0 0', home: 'M0 0' }, () => '', () => '', r => r);
  W.CT.pick = null; W.CT.wizOk = false;
  let h = W.ctWizHTML([]);
  ok(/class="ctw-c" data-act="ctp-sub"/.test(h) && !/class="chip/.test(h.split('<div class="ctw">')[1]) && /data-act="ctp-go" disabled>계약서 만들기/.test(h),
     '고르는 단추는 공용 칩이 아닌 .ctw-c(옅은 면 상자) · 다 고르기 전에는 만들기가 잠긴다');
  W.CT.pick.sub = '아파트'; W.CT.wizFx = { just: 'ctp-sub:아파트', kind: 'sub' };
  h = W.ctWizHTML([]);
  ok(/class="ctw-c on just" data-act="ctp-sub" data-v="아파트"/.test(h) && /class="ctw-n done just"/.test(h) && /<em class="ctw-picked">아파트<\/em>/.test(h),
     '고른 단추가 톡 튀고(just) · 걸음 번호가 체크로 · 고른 값이 제목 옆에');
  h = W.ctWizHTML([]);
  ok(!/ just/.test(h), '움직임 표시는 한 번만 - 다시 그려도 되풀이하지 않는다');
  W.CT.pick.deal = '전세';
  h = W.ctWizHTML([]);
  ok(/class="ctw-foot lit"/.test(h) && /<b>부동산\(아파트\) 전세계약서<\/b>/.test(h) && /data-act="ctp-go" >계약서 만들기/.test(h), '다 고른 순간 만들기 줄이 한 번 켜진다(lit)');
  h = W.ctWizHTML([]);
  ok(/class="ctw-foot"/.test(h) && !/ctw-foot lit/.test(h), '이미 켜진 뒤에 다시 그리면 켜짐 움직임이 없다');
  W.CT.pick = { cat: 'rights', sub: null, custom: '', deal: null, ex: null }; W.CT.wizOk = false;
  h = W.ctWizHTML([]);
  ok(/고를 것 없이 바로 만듭니다\. 점포 영업 양도양수 계약의 일반적인 항목을 따라 만든 양식입니다\./.test(h) && /class="ctw-foot lit"/.test(h),
     '고를 것 없는 종류는 근거 한 문장으로 · 바꾸자마자 만들기 줄이 켜진다');
}

/* ── 파트너 중개사 리뷰 (2026-11-05, 01_기획/중개플랫폼_인수인계) ── 기본 특약 · 갱신 특약 · 종료일 · 부가세 · 자필 · 부속 서류 */
{
  const 주택매매 = M.ctNewDoc('sale', null, { cat: 'realty', sub: '아파트' });
  ok(주택매매.specials.length === 7 && /근저당권\(채권최고액 금 \(\s+\)원\)/.test(주택매매.specials[3]) && 주택매매.acct === true,
     '주택 매매 새 계약서는 기본 특약 7개로 시작하고 마지막 줄 계좌 칸을 둔다');
  const 주택임대 = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트', deal: 'monthly' });
  ok(주택임대.specials.length === 11 && 주택임대.specials.some(t => M.CT_계약일조항.test(t)) && /제6조의2제2항/.test(주택임대.specials[10]),
     '주택 임대차 새 계약서는 기본 특약 11개(작성일·체결일 줄, 임대차 신고 안내 포함)');
  ok(!주택임대.specials.some(t => /^\d+\./.test(t)), '기본 특약 문구에 번호를 박지 않는다 - 번호는 그릴 때 매긴다');
  const 상가임대 = M.ctNewDoc('shop-lease', null, { cat: 'shop' });
  ok(상가임대.specials.length === 0, '상가 기본 특약은 아직 받지 않았다 - 빈 특약으로 시작한다');
  ok(주택매매.broker.hand === true && !/한상혁 <span class="ct-seal">\(서명 및 날인\)/.test(M.ctDocHTML(주택매매)),
     '대표 성명은 자필이 기본 - 값은 두고 인쇄 때 비운다');
  주택매매.broker.hand = false;
  ok(/한상혁 <span class="ct-seal">\(서명 및 날인\)/.test(M.ctDocHTML(주택매매)), '자필을 끄면 이름이 인쇄된다');
  ok(/class="ct-acct">\* 매도인 계좌 : /.test(M.ctDocHTML(주택매매)), '특약 마지막 줄에 매도인 계좌 칸');

  /* 부가세 - 주택 월세는 '해당 없음'(안 찍힘), 상가는 별도, 고르면 찍힌다 */
  주택임대.deal = { ...주택임대.deal, type: 'monthly', deposit: 10000000, rent: 500000, fee: 100000 };
  let h = M.ctDocHTML(주택임대);
  ok(M.ct부가(주택임대) === '해당 없음' && !/부가가치세 별도\) 은 매월/.test(h), '주택 월세의 부가세는 기본 해당 없음');
  주택임대.deal.vat = '별도'; 주택임대.deal.feeVat = '별도'; h = M.ctDocHTML(주택임대);
  ok(/\(부가가치세 별도\) 은 매월/.test(h) && /\(정액, 매월, 부가가치세 별도\)/.test(h), '고르면 차임·관리비에 부가세 별도가 찍힌다');
  ok(M.ct부가(상가임대) === '별도', '상가 임대차는 부가세 별도가 기본');

  /* 종료일 */
  ok(M.ct종료일('2026-11-05', 2, false) === '2028-11-04' && M.ct종료일('2026-11-05', 2, true) === '2028-11-05'
     && M.ct종료일('2026-11-05', 1, false) === '2027-11-04', '2년·1년 종료일 - 시작 전날 / 같은 날');
  ok(M.ct종료일('2028-02-29', 1, true) === '2029-02-28' && M.ct종료일('2026-03-01', 1, false) === '2027-02-28', '윤일·월초도 맞다');
  ok(M.ct종료일('2028-02-29', 1, false) === '2029-02-28', '대응하는 날이 없으면 그 달 말일 - 하루를 더 빼지 않는다(민법 제160조 제3항)');

  /* 갱신 특약 */
  const 갱 = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트' });
  갱.renewOf = { contractDate: '2023-08-28', from: '2023-11-03', to: '2025-11-02', deposit: 500000000, rent: 0 };
  갱.deal.deposit = 525000000;
  const 줄 = M.ct갱신특약(갱);
  ok(/^본 계약은 2023년 8월 28일\(계약기간: 2023년 11월 3일부터 2025년 11월 2일까지\)에 계약된 본 소재지 임대차계약의 갱신계약으로 보증금을 금 오억원에서 금 오억이천오백만원으로 증액하는 계약이며/.test(줄[0]),
     '갱신 특약 1 - 지난 계약일·기간과 보증금 증액을 적는다');
  ok(/증액하는 금 이천오백만원은 이 계약서의 잔금일에 지급한다/.test(줄[1]) && /제6조의2제2항/.test(줄[2]), '갱신 특약 2·3 - 늘어난 만큼을 잔금일에 · 임대차 신고 안내');
  ok(M.ct특약묶음(갱) === 'renew' && !M.ct기본특약(갱).some(t => M.CT_계약일조항.test(t)), '갱신계약 기본 특약에는 작성일·체결일 줄이 없다');
  갱.deal.deposit = 500000000;
  ok(/보증금을 금 오억원 그대로 두는 계약이며/.test(M.ct갱신특약(갱)[0]) && !/증액하는/.test(M.ct갱신특약(갱)[1]), '보증금이 같으면 증액 줄이 없다');
  const 합의만 = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트' }); 합의만.kind = 'agree';
  const 합특 = M.ct기본특약(합의만);
  ok(합특.length === 10 && !합특.some(t => /^본 계약은/.test(t)) && !합특.some(t => M.CT_계약일조항.test(t)), '지난 계약서 없이 합의 재계약만 고르면 임대차 기본 특약(계약일 줄 빼고)');
  ok(M.ct부가({ form: 'lease', sub: '상가', deal: {} }) === '해당 없음' && M.ctNewDoc('lease', null, { cat: 'realty', sub: '상가', deal: 'monthly' }).deal.vat === '별도',
     '예전 상가 임대차 문서는 부가세 문구를 새로 붙이지 않고, 새로 만들 때만 별도를 넣는다');

  /* 화면 - 갱신은 기존 보증금이 계약금, 부속 서류 탭 */
  ok(/down: \+\(원\.deal && 원\.deal\.deposit\) \|\| 0/.test(js), '갱신계약은 기존 보증금으로 계약금을 낸 것으로 연다 - 잔금은 늘어난 만큼');
  ok(/data-act="ct-extra">부속 서류<\/button>/.test(js) && /function ctReceiptDocHTML/.test(js) && /function ctSettleDocHTML/.test(js) && /function ctHandDocHTML/.test(js),
     '부속 서류 탭 - 영수증 · 잔금정산서 · 물품인계 확인서');
  ok(/ct영수칸\(`영수인/.test(js) && /ct영수칸\(`지급인/.test(js), '영수증은 영수인·지급인 모두 성명·주소·연락처·날인 칸');
  ok(/function ct확정점검\(doc\)/.test(js) && /ct확정점검\(CT\.doc\)/.test(js), '확정 창에 확정 전 자동 점검 목록');

  /* 서버 - 부속 서류 값과 기본 특약 표 */
  const t = C.trackCheck({ extra: { fee: '250000', prepaid: 300000.4, ltm: -5, dayOwner: 'a', dirs: { prepaid: '-', x: '+' },
    adds: [{ n: '수도요금', amt: 12000, dir: '-' }, { n: '900101-1234567', amt: 1 }], itemsSet: true, items: [{ n: '카드키', q: '2', s: '' }, { n: '' }], attach: true, evil: 1 } });
  ok(t.extra.fee === 250000 && t.extra.prepaid === 300000 && !('ltm' in t.extra) && t.extra.dayOwner === 'a' && JSON.stringify(t.extra.dirs) === '{"prepaid":"-"}',
     '부속 서류 금액은 양의 정수만, 방향은 아는 항목만');
  ok(t.extra.adds[0].n === '수도요금' && t.extra.adds[1].n === '' && t.extra.items.length === 1 && t.extra.attach === true && !('evil' in t.extra),
     '주민번호 모양 글은 버리고, 빈 품목·모르는 칸은 버린다');
  ok(C.trackCheck({}).extra === undefined, '부속 서류가 없으면 track 에 extra 를 만들지 않는다');
  const 목록 = [{ id: 'aaaaaaaaaaaa', g: 'lease', t: '문구', tag: '' }];
  const 켬 = C.특약문구고침(목록, { op: 'set', id: 'aaaaaaaaaaaa', base: true });
  ok(켬.list[0].base === true && C.특약문구들(켬.list)[0].base === true, '내 특약 - 새 계약서에 기본으로(base) 를 켜고 저장한다');
  ok(!('base' in C.특약문구고침(켬.list, { op: 'set', id: 'aaaaaaaaaaaa', base: false }).list[0]), '끄면 base 가 빠진다');
}

/* ── 계약체결 문자 · 당사자 법인/공동명의 (2026-11-05 파트너 리뷰 2차) ── */
{
  const 문시작 = js.indexOf('/* ── 계약체결 문자 (2026-11-05'), 문끝 = js.indexOf('/* 칸을 고칠 때 - 다시 그리지 않고');
  const comma = s => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const CSM = new Function('S', 'comma', '한글금액', 'ct글날', `${js.slice(문시작, 문끝).replace(/function csPageHTML\(\)\{[\s\S]*?\n\}\n/, '')}\nreturn { CS, CT_문자기본, cs값, cs문자, cs칸들, cs잔금, cs읽기, cs붙여넣기 };`)(
    { agent: { office: '비버공인중개사사무소' } }, comma, M.한글금액, M.ct글날);
  ok(CSM.CT_문자기본.length === 9 && CSM.CT_문자기본.map(t => t.name).join('|') === '아파트 매매|아파트 전세|아파트 월세|아파트 약정(토허)|상가 매매|잔금 준비물 안내|계약 일정 안내|갱신 의사 확인|상가 임대차',
     '기본 문자 틀 9개 - 파트너 중개사가 쓰던 매매·전세·토허 약정 + 월세·상가 + 잔금 준비물 · 손님 일정 안내 · 갱신 의사 확인');
  const 매매틀 = CSM.CT_문자기본[0];
  ok(CSM.cs칸들(매매틀.text).includes('배액') && CSM.cs칸들(매매틀.text).includes('채권최고액'), '【칸 이름】을 입력칸으로 읽는다');
  Object.assign(CSM.CS.vals, { 목적물: '하남시 망월동 101동 1203호', 매매대금: 650000000, 계약금일부: 10000000, 중도금: 200000000, 잔금일: '2026-12-20', 계약서작성일: '2026-11-07' });
  let 글 = CSM.cs문자(매매틀);
  ok(/\*잔금: 385,000,000원 \/ 2026년 12월 20일/.test(글), '잔금 = 매매대금 − 계약금 10% − 중도금 (자동)');
  ok(/매도인은 20,000,000원\(계약금일부의 배액\)/.test(글) && /\n비버공인중개사사무소$/.test(글), '배액 = 계약금 일부 × 2 · 사무소명은 저절로');
  ok(/계약서작성일: 2026년 11월 7일/.test(글) && /【계좌】/.test(글), '날짜는 글로, 비운 칸은 【 】 그대로 보인다');
  CSM.CS.none.채권최고액 = true; CSM.CS.none.중도금 = true; 글 = CSM.cs문자(매매틀);
  ok(!/근저당권/.test(글) && !/\*중도금:/.test(글) && /\*잔금: 585,000,000원/.test(글), '해당 없음을 고른 칸은 그 줄을 빼고, 중도금이 없으면 잔금이 다시 계산된다');
  ok(/cs기록\(\)[\s\S]{0,200}!\/계좌\/\.test\(k\)/.test(js) || /!\/계좌\/\.test\(k\) && CS\.vals\[k\]/.test(js), '보낸 기록에는 계좌 칸을 넣지 않는다');
  ok(/\['#\/partner\/contracts\/sms', '계약체결 문자', 'send', 'cms'\]/.test(js) && /sub === 'sms' \? csPageHTML\(\)/.test(js), '계약서 하위 메뉴에 계약체결 문자');
  ok(/function cs계약서\(e\)/.test(js) && /data-act="cs-log-ct"/.test(js), '보낸 기록에서 그 내용으로 새 계약서를 연다');

  /* 서버 - 틀 · 기록 */
  let y = C.문자고침({}, { op: 'tpls', tpls: [{ id: 'apt-sale', name: '아파트 매매 아주 긴 이름입니다요', text: '【목적물】' }, { id: 'BAD ID', name: 'x', text: 'y' }, { id: 'u1', name: '숨김', text: 'a', hidden: true }] });
  ok(y.tpls.length === 2 && y.tpls[0].name.length === 14 && y.tpls[1].hidden === true, '문자 틀 - 번호 모양·이름 14자·숨김만 받는다');
  ok(C.문자고침({}, { op: 'tpls', tpls: [{ id: 'a', name: 'a', text: '900101-1234567' }] }).code === 400, '주민번호가 든 틀은 거절');
  const 때 = new Date('2026-11-05T01:00:00Z');
  y = C.문자고침({}, { op: 'log-add', entry: { tpl: '아파트 매매', vals: { 목적물: 'A동', 계좌: '국민 123-45', 매도인계좌: 'x', 매매대금: 650000000, 메모: '900101-1234567' } } }, 때);
  ok(y.log.length === 1 && !('계좌' in y.log[0].vals) && !('매도인계좌' in y.log[0].vals) && !('메모' in y.log[0].vals) && y.log[0].vals.매매대금 === 650000000 && y.log[0].at === '2026-11-05T10:00:00',
     '보낸 기록 - 계좌·주민번호 글은 버리고, 시각은 한국 시각');
  const y2 = C.문자고침({ smsLog: y.log }, { op: 'log-add', entry: { tpl: '아파트 매매', vals: { 목적물: 'A동', 매매대금: 1 } } }, new Date('2026-11-05T01:05:00Z'));
  const y3 = C.문자고침({ smsLog: y2.log }, { op: 'log-add', entry: { tpl: '아파트 매매', vals: { 목적물: 'B동' } } }, 때);
  ok(y2.log.length === 1 && y2.log[0].vals.매매대금 === 1 && y3.log.length === 2, '같은 틀·목적물을 10분 안에 다시 보내면 그 줄을 고친다');
  const y4 = C.문자고침({ smsLog: y3.log }, { op: 'log-set', id: y3.log[1].id, a: true, b: false });
  ok(y4.log[1].a === true && y4.log[1].b === false && C.문자고침({ smsLog: y4.log }, { op: 'log-del', id: y4.log[1].id }).log.length === 1, '동의 회신 표시 · 지우기');

  /* 당사자 - 법인 · 공동명의 */
  const d = M.ctNewDoc('sale', null, { cat: 'realty', sub: '아파트' });
  d.parties.seller = { name: '김매도', phone: '010-1', addr: '서울', share: '1/2', co: [{ name: '이공동', phone: '010-2', addr: '하남', share: '1/2' }] };
  d.parties.buyer = { type: 'corp', name: '비버주식회사', rep: '박대표', bizNo: '123-45-67890', phone: '02-1', addr: '본점' };
  const h = M.ctDocHTML(d);
  ok(/김매도 <span class="sm">\(지분 1\/2\)<\/span>/.test(h) && /매도인 2<\/th>/.test(h) && /이공동 <span class="sm">\(지분 1\/2\)/.test(h), '공동명의자는 같은 칸을 이어 붙이고 지분을 적는다');
  ok(/사업자등록번호<\/th><td>123-45-67890/.test(h) && /비버주식회사 &nbsp; 대표이사 박대표 <span class="ct-seal">\(법인 인감 날인\)/.test(h) && /본점 소재지/.test(h), '법인은 법인명·대표이사·사업자등록번호·본점 소재지');
  ok(M.ct이름외(d.parties.seller) === '김매도 외 1명' && M.ct지분('1/2') === 0.5 && M.ct지분('50%') === 0.5 && isNaN(M.ct지분('')), '이름 외 n명 · 지분 읽기');
  ok(C.docCheck('sale', d) === null, '법인·공동명의가 든 계약서를 서버가 받는다(사업자등록번호는 주민번호 모양이 아니다)');

  /* 보낸 문자 붙여넣기 → 칸 */
  const 보낸 = CSM.cs문자(CSM.CT_문자기본[1], { 목적물: '미사 105동 802호', 보증금: 500000000, 계약서작성일: '2026-11-10', 입금일: '2026-11-05', 계약금일부: 5000000, 잔금일: '2027-01-15', 계약기간: '2', 채권최고액: 120000000 }, {});
  const 읽음 = CSM.cs읽기(보낸, CSM.CT_문자기본[1]);
  ok(읽음.목적물 === '미사 105동 802호' && 읽음.보증금 === 500000000 && 읽음.잔금일 === '2027-01-15' && 읽음.계약기간 === '2' && 읽음.채권최고액 === 120000000 && 읽음.계약서작성일 === '2026-11-10',
     '보낸 문자를 붙여 넣으면 틀의 칸 자리대로 다시 읽는다(금액·날짜·기간)');
  CSM.CS.sel = 'apt-sale'; CSM.CS.vals = {};
  ok(CSM.cs붙여넣기(보낸) >= 7 && CSM.CS.sel === 'apt-jeonse', '가장 많이 읽히는 틀(전세)로 바꿔 채운다');

  /* 대리인 */
  const dp = M.ctNewDoc('lease', null, { cat: 'realty', sub: '아파트' });
  dp.parties.lessor.name = '김임대'; dp.parties.lessor.proxy = { name: '김대리', rel: '배우자', phone: '010-9', addr: '서울', docs: { letter: true } };
  const hp = M.ctDocHTML(dp);
  ok(/임대인의<br>대리인/.test(hp) && /김대리 <span class="ct-seal">\(서명 또는 날인\)<\/span> <span class="sm">· 위임장·본인 인감증명서 첨부/.test(hp) && /배우자/.test(hp), '대리인 계약이면 본인 칸 아래 대리인 칸(관계·위임장 첨부)');
  ok(/function ctProxyDocHTML/.test(js) && /function ctReturnDocHTML/.test(js) && /\['pw','위임장'\], \.\.\.\(F\.lease \? \[\['rt','보증금 반환 영수증'\]\] : \[\]\)/.test(js),
     '부속 서류에 위임장 · (임대차면) 보증금 반환 영수증');
  ok(/대리인 계약 - 아직 체크하지 않은 것: \$\{빠짐\.join\('·'\)\}/.test(js), '확정 전 점검 - 위임장·인감증명서·본인 통화 확인 중 빠진 것');

  /* 임대차 만기 6개월 전 - 화면과 서버가 같은 날을 낸다 */
  const 자료 = { form: 'lease', sub: '아파트', cd: '2026-11-05', bd: '2026-12-01', ex: '2028-11-30', mid: 0, track: {} };
  const 화 = M.ct일정목록(자료).find(e => e.k === 'expiry'), 서 = C.일정목록(자료).find(e => e.k === 'expiry');
  ok(화 && 서 && 화.날 === '2028-05-30' && 서.날 === 화.날 && 화.이름 === '임대차 만기 6개월 전', '임대차 만기 6개월 전 알림 - 화면·서버 같은 날');
  ok(C.달빼기('2027-08-31', 6) === '2027-02-28' && !M.ct일정목록({ ...자료, form: 'sale' }).some(e => e.k === 'expiry'), '말일은 그 달 말일로 · 매매에는 만기 알림이 없다');
  ok(C.오늘알림({ ...자료, status: 'draft' }, C.알림설정(), '2028-05-30').every(e => e.k !== 'expiry')
     && C.오늘알림({ ...자료, status: 'sealed' }, C.알림설정(), '2028-05-30').some(e => e.k === 'expiry'), '만기 알림은 날인본만 보낸다');

  /* 자주 쓰는 단지 */
  let dj = C.단지고침([], { op: 'put', name: '미사강변센트럴자이', road: '경기도 하남시 미사강변대로 220', v: { guard: '있음', feeItems: ['전기료', '수도료'], bad: { x: 1 }, 'ex.evil': 'x', memo: '900101-1234567' } }, 때);
  ok(dj.list.length === 1 && dj.list[0].v.guard === '있음' && dj.list[0].v.feeItems.length === 2 && !('bad' in dj.list[0].v) && !('ex.evil' in dj.list[0].v) && !('memo' in dj.list[0].v),
     '단지 저장 - 글·수·글 목록만, 칸 이름은 영문 낱말, 주민번호 모양은 버린다');
  const dj2 = C.단지고침(dj.list, { op: 'put', name: '미사강변센트럴자이', v: { guard: '없음' } }, 때);
  ok(dj2.list.length === 1 && dj2.list[0].id === dj.list[0].id && dj2.list[0].v.guard === '없음' && C.단지고침(dj2.list, { op: 'del', id: dj.list[0].id }).list.length === 0,
     '같은 이름이면 덮어쓰고, 지우면 빠진다');
  ok(/const EX_단지절 = \/입지조건\|관리에 관한 사항\|비선호시설\|환경조건\//.test(js) && /\$\{exDanjiHTML\(doc\)\}/.test(js), '확인·설명서 작성 화면에 자주 쓰는 단지(⑤ 입지 · ⑥ 관리 · ⑦ 비선호 · ⑬ 환경)');
  ok(/data-act="cs-go"/.test(js) && /<b class="dz-ct">계약체결 문자<\/b>/.test(js), '중개사 대시보드에 계약체결 문자 단추');

  /* 진행 상태 · 한방 입력 · 잔금 완료 확인 */
  const tr = C.trackCheck({ state: 'done', hb: true, evil: 'x' }), tr2 = C.trackCheck({ state: 'weird' });
  ok(tr.state === 'done' && tr.hb === true && !('evil' in tr) && !('state' in tr2), '진행 상태는 준비·진행중·완료·보류·취소만 · 한방 입력 완료 체크');
  const 잔 = { form: 'sale', sub: '아파트', cd: '2026-11-05', bd: '2026-12-20', mid: 0, status: 'sealed', track: {} };
  const s화 = M.ct일정목록(잔).find(e => e.k === 'settle'), s서 = C.일정목록(잔).find(e => e.k === 'settle');
  ok(s화 && s서 && s화.날 === '2026-12-21' && s서.날 === s화.날, '잔금 다음 날 아침 잔금 완료 확인 - 화면·서버 같은 날');
  ok(!C.일정목록({ ...잔, track: { state: 'done' } }).some(e => e.k === 'settle'), '완료로 바꾸면 잔금 완료 확인이 멈춘다');
  ok(/data-act="ctk-state"/.test(js) && /r\.track && CT_진행\[r\.track\.state\]/.test(js), '일정·체크에서 진행 상태를 고르고 목록에 보인다');

  /* 확정 후 수정 · 수정됨 · 단기임대 · 개인정보 동의서 */
  ok(/r\.prev_id \? ' · 확정 후 수정'/.test(js) && /data-act="ct-open-prev">확정 후 수정한 판 · 앞 날인본 보기/.test(js), '확정 후 수정한 판 표시와 앞 날인본으로 가는 단추(판 사슬 = 수정 이력)');
  ok(/CT\.doc\.edited = \{ \.\.\.\(CT\.doc\.edited \|\| \{\}\), \[path\]: 원 \}/.test(js) && /수정됨 · 자동으로 채운 값/.test(js), '자동으로 채운 칸을 고치면 수정됨과 원래 값을 남긴다');
  ok(/\['m6', '6개월'\], \['m3', '3개월'\]/.test(js) && /function ct기간끝/.test(js), '단기임대 - 6개월·3개월 종료일');
  ok(/function ctPrivacyDocHTML/.test(js) && /보유·이용 기간/.test(js) && /동의를 거부할 권리/.test(js), '개인정보 수집·이용 동의서 - 목적·항목·보유 기간·거부권');

  /* 확정 전 초안 링크 */
  const 번 = '11111111-2222-3333-4444-555555555555', 지금 = 1793000000000;
  process.env.BK_SECRET_KEY = process.env.BK_SECRET_KEY || 'test-secret';
  const 표 = C.초안표(번, 3, 지금);
  ok(C.초안표읽기(표, 지금 + 1000).id === 번 && C.초안표읽기(표, 지금 + 1000).n === 3 && C.초안표읽기(표, 지금 + 8 * 864e5) === null, '초안 표는 7일 동안만 열리고 링크 번호를 담는다');
  ok(C.초안표읽기(표.slice(0, -2) + (표.endsWith('AA') ? 'BB' : 'AA'), 지금) === null && C.초안표읽기(표.replace('.3.', '.4.'), 지금) === null, '서명이 틀리거나 링크 번호를 바꾸면 열지 않는다');
  const 가린 = C.초안가림({ parties: { lessor: { name: '김', phone: '010-1234-5678', birth: '1970-01-01', co: [{ phone: '01099998888' }], proxy: { phone: '010-1111-2222' } } }, specials: ['연락은 010-5555-6666 으로'], edited: { a: 1 }, src: { a: 1 } });
  ok(가린.parties.lessor.phone === '010-****-5678' && 가린.parties.lessor.co[0].phone === '010-****-8888' && 가린.parties.lessor.proxy.phone === '010-****-2222' && !가린.src
     && !('birth' in 가린.parties.lessor) && !가린.edited && 가린.specials[0] === '연락은 010-****-6666 으로',
     '초안에서는 전화번호(특약 글 안까지)를 가리고 생년월일 · 자동값 원본을 뺀다');
  ok(C.초안가림({ specials: ['사무실 02-123-4567 · 계좌 123456-78-901234 · 금 300,000,000원 · 2026-11-20'] }).specials[0] === '사무실 ****4567 · 계좌 ****1234 · 금 300,000,000원 · 2026-11-20', '일반전화 · 계좌처럼 긴 숫자도 가리고 금액 · 날짜는 둔다');
  ok(C.trackCheck({ shareN: 2 }).shareN === 2 && !('shareN' in C.trackCheck({ shareN: -1 })), '링크 번호(shareN)는 양의 정수만');
  ok(/중개사무소가 이 링크를 끊었습니다/.test(fs.readFileSync(new URL('../api/_contract.js', import.meta.url), 'utf8')) && /if \(row\.status === 'sealed'\) return res\.status\(200\)\.json\(\{ ok: true, until: t\.until, form: row\.form, status: 'sealed' \}\)/.test(fs.readFileSync(new URL('../api/_contract.js', import.meta.url), 'utf8')),
     '링크를 끊으면 열지 않고, 확정된 계약서는 내용을 내보내지 않는다');
  ok(/확인·설명서는 초안 링크로 보내지 않습니다/.test(fs.readFileSync(new URL('../api/_contract.js', import.meta.url), 'utf8')), '확인·설명서는 초안 링크를 만들지 않는다');
  ok(/V\['#\/draft'\] = tok =>/.test(js) && /h\.startsWith\('#\/draft\/'\)\) html = V\['#\/draft'\]\(parts\[2\]\)/.test(js), '초안 보기 화면은 로그인 없이 #/draft/표 로 연다');

  /* 분양권 · 입주권 거래신고 도우미 */
  const 분 = M.ctNewDoc('presale', null, { cat: 'presale', sub: '아파트' });
  분.deal = { ...분.deal, price: 700000000, orgPrice: 600000000, premium: 100000000, down: 70000000, balanceDate: '2026-12-20' };
  const 분줄 = M.rpItems(분);
  ok(M.ct신고(분) && M.ct신고({ form: 'union' }) && C.신고대상('presale') && C.신고대상('union'), '분양권·입주권 전매도 신고 대상(화면·서버)');
  ok(분줄.some(([s, l, v]) => s === '④ 거래대상 종류' && v === '분양권 · 전매') && 분줄.some(([s, l, v]) => l === '분양가격' && /600,000,000/.test(v)) && 분줄.some(([, l, v]) => /프리미엄/.test(l) && /100,000,000/.test(v)),
     '분양권 신고 도우미 - 거래대상 분양권·전매 · 분양가격 · 추가 지불액(프리미엄)');
  const 입 = M.ctNewDoc('union', null, { cat: 'union' }); 입.deal = { ...입.deal, rightValue: 300000000, extra: 50000000, premium: 200000000 };
  ok(M.rpItems(입).some(([, l, v]) => l === '권리가격' && /300,000,000/.test(v)) && M.rpItems(입).some(([, l, v]) => /추가 지불액/.test(l) && /250,000,000/.test(v)), '입주권 신고 도우미 - 권리가격 · 추가 지불액(추가분담금+프리미엄)');
  ok(C.일정목록({ form: 'presale', cd: '2026-11-05', track: {} }).find(e => e.k === 'report').이름 === '실거래신고 기한', '분양권 신고 기한 알림은 실거래신고 기한');
  ok(js.includes("잔금칸(잔금지연, '잔금 지연?'") && js.includes("잔금칸(오늘잔금, '오늘 잔금 - 완료 확인'") && js.includes('오후3시 = 지금시.getUTCHours() >= 15') && js.includes("!['done', 'cancel', 'hold'].includes((r.track || {}).state)"),
     '대시보드 할 일 - 잔금일 15시부터 완료 확인 · 지나면 잔금 지연(완료·취소·보류면 사라짐)');
  ok(js.includes('잔금날(r) >= 육십일전'), '잔금 지연은 잔금일이 60일 안에 지난 것만 - 예전 날인본이 쌓이지 않는다');
  ok(js.includes('const id = CT.id, 그때 = CT.track;') && js.includes('(CT.id === id ? CT.track : 그때) || {}'),
     '일정 저장 대기 중 다른 계약서로 넘어가도 앞 계약서에 빈 track 을 보내지 않는다');
  ok(js.includes('function exStateHTML(doc, s)') && js.includes('${esc(s.h)}${exStateHTML(doc, s)}') && js.includes('입력 필요 ${키.length - 채움}칸'), '확인·설명서 항목마다 입력 필요 칸 수 · 서류에서 채운 칸 수');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
