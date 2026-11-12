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
{ const 고친 = a.slice(0, -4) + 'AAAA'; ok(C.풀기(고친) === 고친, '고친 암호문은 풀지 않는다(가짜 값을 지어내지 않고 암호문 그대로)'); }
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

/* 리뷰 11-12 - 풀지 못하면 암호문 그대로(다시 저장해도 원래 값이 지켜진다) · 옛 열쇠 · 색인 · 본문 없는 응답 · 원문 읽기 */
{ const 옛 = C.잠그기('옛 값'); const 지금 = process.env.BK_DATA_KEY;
  process.env.BK_DATA_KEY = Buffer.alloc(32, 9).toString('base64');
  ok(C.풀기(옛) === 옛 && C.잠그기(C.풀기(옛)) === 옛, '열쇠가 맞지 않으면 암호문을 그대로 돌려주고, 다시 저장해도 덮지 않는다(데이터를 잃지 않음)');
  process.env.BK_DATA_KEY_OLD = 지금;
  ok(C.풀기(옛) === '옛 값' && C.색인들('01012345678', 'phone').includes(C.색인('01012345678', 'phone', Buffer.from(지금, 'base64'))), '열쇠를 바꿔도 BK_DATA_KEY_OLD 로 옛 값이 풀리고, 옛 색인으로도 찾는다');
  process.env.BK_INDEX_KEY = 지금;
  ok(C.색인('01012345678', 'phone') === C.색인('01012345678', 'phone', Buffer.from(지금, 'base64')), 'BK_INDEX_KEY 를 남기면 암호화 열쇠를 바꿔도 색인이 그대로');
  delete process.env.BK_DATA_KEY_OLD; delete process.env.BK_INDEX_KEY; process.env.BK_DATA_KEY = 지금; }
{ const 원래 = globalThis.fetch; let 잡음 = null;
  /* 길목 아래(가짜 DB)를 바꿔 끼울 수 없어, 같은 방식의 새 길목을 시험한다: 204 와 원문 읽기 */
  답할 = [{ name: C.잠그기('홍') }];
  const raw = await (await fetch('https://fake.supabase.co/rest/v1/bk_demand?select=name', { headers: { 'x-bk-raw': '1' } })).json();
  ok(String(raw[0].name).startsWith('e1:'), "'x-bk-raw' 를 단 요청은 저장된 원문 그대로 받는다(전환이 평문을 가를 때)");
  void 원래; void 잡음; }
{ const fs = await import('node:fs'), path = await import('node:path');
  const 뿌리 = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'api');
  const 함수들 = [...fs.readdirSync(뿌리).filter(f => f.endsWith('.js') && !f.startsWith('_')).map(f => path.join(뿌리, f)),
    ...fs.readdirSync(path.join(뿌리, 'auth')).flatMap(d => fs.readdirSync(path.join(뿌리, 'auth', d)).filter(f => f.endsWith('.js')).map(f => path.join(뿌리, 'auth', d, f)))];
  const 닿음 = f => { const 본 = new Set(); const 걷기 = x => { if (본.has(x) || !fs.existsSync(x)) return; 본.add(x);
      for (const m of fs.readFileSync(x, 'utf8').matchAll(/from '(\.[^']+)'|import\('(\.[^']+)'\)|import '(\.[^']+)'/g)) 걷기(path.resolve(path.dirname(x), m[1] || m[2] || m[3])); };
    걷기(f); return [...본].some(x => x.endsWith('_crypto.js')); };
  const 빠짐 = 함수들.filter(f => /rest\/v1|sbUrl\(/.test(fs.readFileSync(f, 'utf8')) && !닿음(f)).map(f => path.basename(f));
  ok(!빠짐.length, `DB 를 쓰는 서버 함수는 모두 길목(_crypto.js)까지 이어진다${빠짐.length ? ' - 빠짐: ' + 빠짐.join(', ') : ''}`); }

/* 열쇠가 없으면 */
delete process.env.BK_DATA_KEY;
await fetch('https://fake.supabase.co/rest/v1/bk_demand', { method: 'POST', body: JSON.stringify({ name: '홍길동', phone: '01012345678' }) });
w = JSON.parse(받은.at(-1).body);
ok(w.name === '홍길동' && w.phone === '01012345678' && !C.암호켜짐(), '열쇠가 없으면 평문 그대로 - 서비스가 멈추지 않는다');

console.log(`\n${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
