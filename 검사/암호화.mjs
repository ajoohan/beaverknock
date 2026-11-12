/* 개인정보 칸 암호화 (2026-11-12) - api/_crypto.js
   ⚠ DB 로 가는 쓰기에서 정한 칸이 잠기고, 돌아오는 값은 풀리는가 · 열쇠가 없으면 아무것도 안 하는가 · 찾는 칸은 잠그지 않는가 */
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.BK_DATA_KEY = Buffer.alloc(32, 7).toString('base64');

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if (!c) fail++; };

/* 가짜 DB - 길목(fetch 감싸기)이 깔리기 전에 둔다 */
const 받은 = [];
globalThis.fetch = async (u, o = {}) => { 받은.push({ u: String(u), m: o.method || 'GET', body: o.body });
  if ((o.method || 'GET') === 'GET') return new Response(JSON.stringify(답할), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return new Response(o.body || '[]', { status: 201, headers: { 'Content-Type': 'application/json' } }); };
let 답할 = [];
const C = await import('../api/_crypto.js');

const a = C.잠그기('010-1234-5678');
ok(a.startsWith('e1:') && a !== C.잠그기('010-1234-5678') && C.풀기(a) === '010-1234-5678', '잠그면 e1: 로 시작하고 매번 다르며 풀면 원래 값');
ok(C.풀기('평문') === '평문' && C.잠그기('') === '' && C.잠그기(null) === null, '예전 평문은 그대로 읽힌다 · 빈 값은 그대로');
ok(C.풀기(a.slice(0, -4) + 'AAAA') === '', '고친 암호문은 풀지 않는다(가짜 값을 보여 주지 않음)');
ok(C.색인('010-1234-5678', 'phone') === C.색인('01012345678', 'phone') && C.색인('010-1234-5678', 'phone') !== C.색인('01012345679', 'phone'), '전화번호 색인 - 모양이 달라도 같은 번호면 같은 값');

/* 길목 - 쓰기 */
await fetch('https://fake.supabase.co/rest/v1/bk_demand', { method: 'POST', body: JSON.stringify({ name: '홍길동', phone: '01012345678', kind: 'home', dongs: ['망월동'] }) });
let w = JSON.parse(받은.at(-1).body);
ok(w.name.startsWith('e1:') && w.phone.startsWith('e1:') && w.kind === 'home' && w.dongs[0] === '망월동', '손님 조건 - 이름 · 번호는 잠그고 지역 · 종류는 그대로(찾는 데 쓴다)');
await fetch('https://fake.supabase.co/rest/v1/bk_agent?id=eq.1', { method: 'PATCH', body: JSON.stringify({ phone: '01099998888', settings: { lmemo: { L1: { who: '의뢰인', phone: '010', nego: 5 } }, staff: [{ email: 'a@b.c' }], memo: '메모' } }) });
w = JSON.parse(받은.at(-1).body);
ok(w.phone.startsWith('e1:') && w.phone_idx === C.색인('01099998888', 'phone') && w.settings.lmemo.L1.who.startsWith('e1:') && w.settings.lmemo.L1.nego === 5
   && w.settings.staff[0].email === 'a@b.c' && w.settings.memo.startsWith('e1:'), '사무소 - 번호 잠금 + 색인 · 의뢰인 메모 잠금 · 직원 메일은 찾는 데 써서 그대로');
await fetch('https://fake.supabase.co/rest/v1/bk_contract', { method: 'POST', body: JSON.stringify({ form: 'home-lease', doc: { form: 'home-lease', deal: { price: 1 }, parties: { lessor: { name: '김', phone: '010', co: [{ name: '이' }] } } } }) });
w = JSON.parse(받은.at(-1).body);
ok(w.doc.parties.lessor.name.startsWith('e1:') && w.doc.parties.lessor.co[0].name.startsWith('e1:') && w.doc.deal.price === 1 && w.doc.form === 'home-lease', '계약서 - 당사자만 깊이 잠그고 금액 · 양식은 그대로(목록이 doc->deal 로 읽는다)');
await fetch('https://fake.supabase.co/rest/v1/bk_listing', { method: 'POST', body: JSON.stringify({ name: '단지', dong: '망월동' }) });
ok(JSON.parse(받은.at(-1).body).name === '단지', '정하지 않은 표는 건드리지 않는다');

/* 길목 - 읽기 */
답할 = [{ id: 1, name: C.잠그기('홍길동'), doc: { parties: { a: { name: C.잠그기('김') } } }, plain: '그대로' }];
const r = await (await fetch('https://fake.supabase.co/rest/v1/bk_demand?select=*')).json();
ok(r[0].name === '홍길동' && r[0].doc.parties.a.name === '김' && r[0].plain === '그대로', '돌아오는 값은 어디 있든 풀린다(별칭 · 깊은 칸 포함)');

/* 열쇠가 없으면 */
delete process.env.BK_DATA_KEY;
await fetch('https://fake.supabase.co/rest/v1/bk_demand', { method: 'POST', body: JSON.stringify({ name: '홍길동', phone: '01012345678' }) });
w = JSON.parse(받은.at(-1).body);
ok(w.name === '홍길동' && w.phone === '01012345678' && !C.암호켜짐(), '열쇠가 없으면 평문 그대로 - 서비스가 멈추지 않는다');

console.log(`\n${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
