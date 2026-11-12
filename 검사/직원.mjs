import fs from 'node:fs';
/* 직원 계정 (2026-11-06) - 대표가 메일로 초대 · 직원은 대표 사무소로 일한다 · 보조원은 계약서 불가 · 직원 관리는 대표만 */
import * as 길 from './길.mjs';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
delete process.env.RESEND_API_KEY;

const { 직원들, 직원고침, 직원사무소, 직원들어옴 } = await import('../api/_staff.js');

/* 1. 명단 고치기 */
let y = 직원고침([], { op: 'add', email: ' Staff@X.com ', role: 'staff', name: '김직원' }, 'boss@x.com');
ok(y.list.length === 1 && y.added.email === 'staff@x.com' && /^[0-9a-f]{10}$/.test(y.added.i), '초대 - 메일은 소문자로, 번호는 10자리');
ok(직원고침(y.list, { op: 'add', email: 'staff@x.com', role: 'assistant' }).code === 409, '같은 메일은 두 번 넣지 않는다');
ok(직원고침([], { op: 'add', email: 'boss@x.com', role: 'staff' }, 'BOSS@x.com').code === 400, '대표 자신의 메일은 직원으로 넣지 않는다');
ok(직원고침([], { op: 'add', email: 'a@x.com', role: 'admin' }).code === 400 && 직원고침([], { op: 'add', email: 'nope', role: 'staff' }).code === 400, '역할 · 메일 모양이 틀리면 거절');
const i = y.added.i;
ok(직원고침(y.list, { op: 'role', i, role: 'assistant' }).list[0].role === 'assistant' && 직원고침(y.list, { op: 'del', i }).list.length === 0, '역할 바꾸기 · 빼기');
ok(직원들([{ i: 'zz', email: 'a@x.com', role: 'staff' }, { i, email: 'b@x.com', role: 'boss' }]).length === 0, '모양이 틀린 줄은 버린다');
ok(직원들어옴(y.list, i, '11111111-2222-3333-4444-555555555555')[0].uid === '11111111-2222-3333-4444-555555555555', '처음 들어오면 계정 id 를 적는다');

/* 2. 사무소 찾기 - 확인된 메일만 */
const 사무소 = { id: 'a1', role: 'agent', status: 'approved', office: '대표부동산', settings: { staff: [{ i, email: 'staff@x.com', role: 'assistant', name: '김직원' }] } };
let 물은 = [];
const 가짜 = async u => { 물은.push(decodeURIComponent(String(u))); return new Response(JSON.stringify(/"email":"staff@x.com"/.test(decodeURIComponent(String(u))) ? [사무소] : [])); };
let z = await 직원사무소({ id: '9f9f9f9f-0000-0000-0000-000000000001', email: 'Staff@x.com', provider: 'google' }, 'id', 가짜);
ok(z && z.agent.id === 'a1' && z.agent.staff.role === 'assistant' && z.첫로그인 && !('settings' in z.agent), '소셜 로그인 메일이 명단에 있으면 대표 사무소로 든다(설정은 내보내지 않는다)');
z = await 직원사무소({ id: '9f9f9f9f-0000-0000-0000-000000000001', email: 'staff@x.com', provider: 'email' }, 'id', 가짜);
ok(z === null, '메일 확인을 안 마친 메일 가입 계정은 메일로 맞추지 않는다');

const { 다른사무소직원 } = await import('../api/_staff.js');
ok(await 다른사무소직원('Staff@x.com', 'b2', async u => new Response(/"email":"staff@x.com"/.test(decodeURIComponent(String(u))) && /id=neq.b2/.test(String(u)) ? '[{"id":"a1"}]' : '[]'))
  && !(await 다른사무소직원('new@x.com', 'b2', async () => new Response('[]'))), '다른 사무소 명단에 이미 있는 메일은 알아본다');

/* 3. feed.js - 권한 */
let 찾은 = 'none';
const 사람 = { s1: { id: '9f9f9f9f-0000-0000-0000-000000000001', email: 'staff@x.com', email_confirmed_at: 'x' } };
let 불린 = [];
globalThis.fetch = async (u, o = {}) => { u = String(u); const d = decodeURIComponent(u); 불린.push({ u: d, m: o.method || 'GET', b: o.body });
  if (/auth\/v1\/user$/.test(u)) return new Response(JSON.stringify(사람.s1));
  if (/bk_agent\?/.test(u) && /user_id=eq/.test(d)) return new Response('[]');
  if (/bk_agent\?/.test(u) && /settings=cs/.test(d)) return new Response(JSON.stringify([{ ...사무소, settings: { staff: [{ i, email: 'staff@x.com', role: 찾은 === 'staff' ? 'staff' : 'assistant', name: '김직원' }] } }]));
  if (/bk_agent\?/.test(u) && (o.method || 'GET') === 'GET') return new Response(JSON.stringify([{ settings: { staff: [{ i, email: 'staff@x.com', role: 'assistant' }] } }]));
  if (/bk_agent\?/.test(u)) return new Response(JSON.stringify([{ id: 'a1' }]));
  return new Response('[]'); };
const { default: feed, 계약기능, 대표만 } = await import('../api/feed.js');
const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); r.setHeader = () => r; r.end = () => r; return r; };
const 부르기 = async body => { const res = 응답(); await feed({ method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(30) }, body }, res); return res; };
let r = await 부르기({ what: 'contract-list' });
ok(r.code === 403 && /보조원/.test(r.body.error), '중개보조원은 계약서 목록을 못 연다');
ok((await 부르기({ what: 'phrases' })).code === 403 && (await 부르기({ what: 'forms' })).code === 403, '보조원은 특약 · 서식도 못 연다');
ok((await 부르기({ what: 'staff-save', op: 'add', email: 'b@x.com', role: 'staff' })).code === 403 && (await 부르기({ what: 'scope-save' })).code === 403, '직원은 직원 관리 · 활동 지역을 못 고친다');
ok(불린.some(x => x.m === 'PATCH' && /"uid":"9f9f9f9f/.test(x.b || '')), '처음 들어온 직원의 계정 id 를 명단에 적는다');
ok(계약기능('contract-save') && 계약기능('form-up') && !계약기능('listings') && !계약기능('mine') && 대표만('office-addr') && !대표만('listings'), '막는 목록 - 계약 · 서식은 막고 물건 · 제안은 연다');

/* 4. 화면 */
const js = 길.js();
ok(js.includes("const 계약막힘 = () => ownerSide() || 보조원() || !권한('ct_view');") && js.includes("...(계약막힘() ? [] : ['계약', ...CT_하위메뉴])")
  && js.includes("...(계약막힘()?[]:[['#/partner/contracts','계약서','ct']])"), '화면 - 보조원에게는 계약 메뉴를 감춘다(PC · 휴대폰)');
ok(js.includes("if(직원() && (h === '#/partner/settings' || h === '#/partner/staff' || (보조원() && h.startsWith('#/partner/contract')))){"), '화면 - 직원이 주소로 들어와도 대시보드로 돌린다(활동 설정 · 직원 · 권한)');
ok(js.includes("V['#/partner/staff'] = () => {") && js.includes("['#/partner/staff', '직원 · 권한', 'users', 'sf']") && js.includes("ctPost({ what:'staff' })") && js.includes("what:'staff-save'"), '화면 - 대표만 보는 내 사무소 › 직원 · 권한 화면(2026-11-12 파트너 기획 A3)');
ok(js.includes("staff: ct직원이름(), hand: true }"), '화면 - 소속공인중개사 직원이 쓰면 계약서 소속공인중개사 칸에 이름');
ok(js.includes("if(!세션있음() || (S.agent && S.agent.staff && S.agent.staff.role === 'assistant')) return Promise.resolve();") && js.includes("계약없는연결 && !계약막힘() ?") && js.includes("${계약막힘() ? '' : (() => { if(!CS.loaded"), '화면 - 보조원 대시보드는 계약 목록 · 계약 할 일 · 계약체결 문자를 부르지 않는다');
ok(js.includes("if((NEEDS_OK || h === '#/partner/verify') && 직원() && S.agent.status !== 'approved'){"), '화면 - 직원은 자격 확인 화면 대신 대표 사무소 확인 안내');

/* 5. 기능별 권한 (2026-11-10 파트너 기획 ①-9) */
{
  const { 권한키 } = await import('../api/feed.js');
  const 명단 = 직원고침([], { op: 'add', email: 'p@x.com', role: 'staff', name: '권직원' }).list, i = 명단[0].i;
  const 끔 = 직원고침(명단, { op: 'perm', i, perm: { ct_seal: false, propose: false, 엉뚱: false, room: true } }).list;
  ok(JSON.stringify(끔[0].perm) === JSON.stringify({ ct_seal: false, propose: false }) && 직원들(끔)[0].perm.ct_seal === false, '권한 - 끈 것만 남기고 모르는 키 · 켬 값은 버린다');
  ok(!직원고침(끔, { op: 'perm', i, perm: {} }).list[0].perm, '권한 - 모두 켜면 perm 칸을 지운다');
  ok(권한키('contract-seal') === 'ct_seal' && 권한키('contract-mail') === 'ct_mail' && 권한키('contracts') === 'ct_view' && 권한키('contract-save') === 'ct_edit'
     && 권한키('listing-add') === 'listing' && 권한키('room-send') === 'room' && 권한키('memo') === '' && 권한키('staff-save') === '', '권한 - 요청마다 맞는 스위치(메모 · 직원 관리는 권한 밖)');
  const pj = fs.readFileSync(new URL('../api/proposal.js', import.meta.url), 'utf8');
  ok(/staff\.perm\.propose === false\) return res\.status\(403\)/.test(pj), '권한 - 제안 보내기를 끈 직원은 서버가 막는다');
  ok(js.includes("const 권한 = k =>") && js.includes("data-act=\"sf-perm\"") && js.includes("권한('ct_seal') ?"), '화면 - 직원 카드의 권한 스위치 · 끈 기능은 단추를 감춘다');
}
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
