/* 간단 제안 · 구하기 어려워요 (2026-11-26 한실장님 결정)
   - 간단 제안은 한마디만: 매물 칸이 비어 나가고, 연락처 · 링크는 받지 않고, 다섯 자리 중 하나를 쓴다
   - 정식 제안을 보내면 간단 제안 줄을 고쳐 쓴다 - 자리를 또 쓰지 않는다
   - '자세히 보고 싶어요'는 그 조건의 손님만, 연락처는 넘어가지 않는다
   - '구하기 어려워요'는 자리를 쓰지 않고, 손님에게는 건수 · 이유만 나간다 */
import fs from 'node:fs';
import * as 길 from './길.mjs';
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const D = '11111111-2222-3333-4444-555555555555', P1 = '99999999-2222-3333-4444-555555555555';

let 요청 = [], 간단있음 = false, 조건 = null, 제안 = null, 손님 = 'u-1';
const 조건기본 = () => ({ id: D, kind: 'home', slots: 5, slots_left: 3, dongs: ['미사1동'], deal: '월세', dep: 1e8, rent: 650000, name: '홍길동', phone: '01012345678', status: 'active', user_id: 'u-cust', hard: { 'a-other': { why: '예산', at: 't' } } });
globalThis.fetch = async (url, opt = {}) => {
  const u = decodeURIComponent(String(url)), m = (opt.method || 'GET').toUpperCase(), body = opt.body ? JSON.parse(opt.body) : null;
  요청.push({ u, m, body });
  const 답 = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (u.includes('/auth/v1/user')) return 답({ id: 손님, email: 'a@b.c' });
  if (u.includes('bk_agent')) return 답([{ id: 'a1', user_id: 'u-1', role: 'agent', status: 'approved', office: '미사공인', email: 'agent@b.c', scope_regions: ['하남시'], scope_kinds: ['home'], scope_set: true }]);
  if (u.includes('bk_demand') && m === 'GET') return 답([조건]);
  if (u.includes('bk_demand') && m === 'PATCH') { Object.assign(조건, body); return 답([조건]); }
  if (u.includes('bk_proposal') && m === 'GET' && u.includes('addr=eq.간단 제안')) return 답(간단있음 ? [{ id: P1, status: 'read' }] : []);
  if (u.includes('bk_proposal') && m === 'GET' && u.includes(`id=eq.${P1}`)) return 답([제안]);
  if (u.includes('bk_proposal') && m === 'GET') return 답([]);
  if (u.includes('bk_proposal') && (m === 'POST' || m === 'PATCH')) return 답([{ id: P1 }], m === 'POST' ? 201 : 200);
  return 답([]);
};
const { default: prop, 어려움요약, 간단주소 } = await import(길.api('proposal.js'));
const 부름 = async (method, body) => { 요청 = []; const res = { code: 0, body: null, setHeader(){}, status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; } };
  await prop({ method, headers: { authorization: 'Bearer ' + 손님.padEnd(40, 'y') }, socket: { remoteAddress: '10.1.2.3' }, body }, res); return res; };

/* ── 간단 제안 ── */
조건 = 조건기본();
let r = await 부름('POST', { demand_id: D, quick: true, msg: '짧음' });
ok(r.code === 400, '한마디가 열 글자가 안 되면 받지 않는다');
r = await 부름('POST', { demand_id: D, quick: true, msg: '맞는 매물 있습니다 010-1234-5678 로 전화 주세요' });
ok(r.code === 400 && /연락처/.test(r.body.error), '한마디에 전화번호가 있으면 받지 않는다');
r = await 부름('POST', { demand_id: D, quick: true, msg: '맞는 매물 있습니다 https://example.com 에서 보세요' });
ok(r.code === 400, '한마디에 링크가 있으면 받지 않는다');
조건 = 조건기본();
r = await 부름('POST', { demand_id: D, quick: true, msg: '말씀하신 조건에 가까운 매물을 두 건 가지고 있습니다.', addr: '하남시 미사대로 1', dep: 5000, bname: '○○아파트' });
const 넣음 = 요청.find(x => x.m === 'POST' && x.u.includes('bk_proposal'));
ok(r.code === 201 && r.body.quick === true && 넣음 && 넣음.body.addr === 간단주소, '간단 제안은 소재지 자리에 표식만 넣어 저장한다');
ok(넣음 && 넣음.body.dep == null && 넣음.body.bname == null && 넣음.body.photos === 0, '간단 제안에는 가격 · 건물 이름 같은 매물 칸이 실려 가지 않는다(화면이 보내도)');
ok(조건.slots_left === 2 && r.body.slots_left === 2, '간단 제안도 다섯 자리 중 하나를 쓴다');
r = await 부름('POST', { demand_id: D, addr: 간단주소 });
ok(r.code === 400, '정식 제안의 소재지에 표식 글을 적어 간단 제안으로 꾸밀 수 없다');

/* ── 정식 제안으로 올리기 ── */
조건 = { ...조건기본(), slots_left: 0 }; 간단있음 = true;
r = await 부름('POST', { demand_id: D, addr: '경기도 하남시 미사강변대로 220', bname: '미사강변 ○○아파트', dep: 1e8, rent: 650000, msg: '정식 제안입니다' });
const 고침 = 요청.find(x => x.m === 'PATCH' && x.u.includes('bk_proposal'));
ok(r.code === 201 && r.body.upgraded === true && 고침 && 고침.u.includes(`id=eq.${P1}`) && !요청.some(x => x.m === 'POST' && x.u.includes('bk_proposal')),
   '간단 제안을 보낸 조건에 정식 제안을 보내면 새 줄을 넣지 않고 그 줄을 고쳐 쓴다');
ok(고침 && 고침.body.status === 'sent' && 고침.body.read_at === null && 고침.body.addr.includes('미사강변대로'), '고쳐 쓴 줄은 다시 새 제안(미열람)이 된다');
ok(조건.slots_left === 0 && !요청.some(x => x.m === 'PATCH' && x.u.includes('bk_demand')), '올릴 때는 자리를 또 쓰지 않는다 - 자리가 0 이어도 보낼 수 있다');
간단있음 = false; 조건 = { ...조건기본(), slots_left: 0 };
r = await 부름('POST', { demand_id: D, addr: '경기도 하남시 미사강변대로 220' });
ok(r.code === 409, '간단 제안이 없으면 자리가 0 인 조건에는 보내지 못한다');

/* ── 자세히 보고 싶어요 ── */
제안 = { id: P1, demand_id: D, status: 'sent', agent_id: 'a1', addr: 간단주소 }; 조건 = 조건기본(); 손님 = 'u-other';
r = await 부름('PATCH', { id: P1, ask: true });
ok(r.code === 404 && !요청.some(x => x.m === 'PATCH'), '남의 조건에 온 간단 제안에는 요청하지 못한다');
손님 = 'u-cust';
r = await 부름('PATCH', { id: P1, ask: true });
const 요청씀 = 요청.find(x => x.m === 'PATCH' && x.u.includes('bk_proposal'));
ok(r.code === 200 && 요청씀 && 요청씀.body.ask_at && 요청씀.body.status === 'read', '자세히 보고 싶어요 - 누른 때를 남기고 읽음으로 바꾼다(연결이 아니다)');
ok(!JSON.stringify(r.body).includes('0101234'), '요청의 답에 연락처가 실리지 않는다');
제안 = { ...제안, addr: '경기도 하남시 미사강변대로 220' };
r = await 부름('PATCH', { id: P1, ask: true });
ok(r.code === 409, '정식 제안에는 자세히 보고 싶어요를 쓰지 않는다');
손님 = 'u-1';

/* ── 구하기 어려워요 ── */
조건 = 조건기본();
r = await 부름('POST', { hard: true, demand_id: D, why: '아무거나' });
ok(r.code === 400, '어려운 이유는 정해 둔 것만 받는다');
r = await 부름('POST', { hard: true, demand_id: D, why: '지역' });
ok(r.code === 200 && 조건.hard.a1 && 조건.hard.a1.why === '지역' && 조건.hard['a-other'], '구하기 어려워요 - 내 답을 더하고 다른 중개사의 답은 그대로 둔다');
ok(조건.slots_left === 3 && !요청.some(x => x.u.includes('bk_proposal') && x.m !== 'GET'), '구하기 어려워요는 자리를 쓰지 않고 제안도 만들지 않는다');
const 요약 = 어려움요약(조건.hard);
ok(요약 && 요약.n === 2 && 요약.why['예산'] === 1 && 요약.why['지역'] === 1 && !JSON.stringify(요약).includes('a1') && !JSON.stringify(요약).includes('a-other'), '손님에게는 건수와 이유만 - 누가 답했는지는 나가지 않는다');
r = await 부름('POST', { hard: true, demand_id: D, undo: true });
ok(r.code === 200 && !조건.hard.a1 && 조건.hard['a-other'], '답 취소 - 내 답만 지운다');
ok(어려움요약({}) === null && 어려움요약(null) === null && 어려움요약({ x: { why: '<b>' } }) === null, '답이 없거나 이유가 이상하면 요약은 없다');

/* ── 손님 · 중개사가 받는 값 ── */
const my = fs.readFileSync(new URL(길.api('my.js')), 'utf8'), feed = fs.readFileSync(new URL(길.api('feed.js')), 'utf8'), js = 길.js();
ok(/hard: 어려움요약\(d\.hard\)/.test(my) && !/hard: d\.hard/.test(my), '손님의 내 조건에는 요약만 싣는다');
ok(/quick: p\.addr === 간단주소/.test(my) && /addr_area: p\.addr === 간단주소 \? ''/.test(my), '손님이 받는 제안에 간단 제안 표시가 있고 표식 글은 지역으로 나가지 않는다');
ok(/select=id,hard&id=in\./.test(feed) && /d\.hard\[agentId\]/.test(feed) && !/select: 'id,created_at,kind,dongs[^']*hard/.test(feed), '중개사 조건 목록에는 내 답만 붙인다 - 다른 중개사의 답은 읽어도 내보내지 않는다');
ok(js.includes(`case 'qk-send'`) && js.includes(`case 'qk-ask'`) && js.includes(`case 'hd-send'`) && js.includes('function 어려움글'), '화면 - 간단 제안 보내기 · 자세히 보고 싶어요 · 구하기 어려워요 · 손님 안내가 있다');
ok(/if\(!p \|\| p\.quick\) return V\['#\/inbox'\]\(\)/.test(js), '간단 제안은 제안 상세(매물 정보 화면)로 열리지 않는다');
/* ── 2026-11-26 코드리뷰 ── */
ok(/p\.quick && p\.status === 'sent' && !p\.seed && !p\.읽음보냄/.test(js), '간단 제안은 손님 제안함에 보이면 읽음으로 남긴다 - 7일 뒤 열지 않아 만료가 되지 않게');
조건 = { ...조건기본(), expires_at: new Date(Date.now() - 864e5).toISOString() };
r = await 부름('POST', { hard: true, demand_id: D, why: '예산' });
ok(r.code === 409 && !조건.hard.a1, '기한이 지난 조건에는 구하기 어려워요를 받지 않는다');
ok(feed.includes("!(d.slots_left > 0) && !간단보냄.has(d.id)") && feed.includes("addr=eq.${encodeURIComponent('간단 제안')}&status=in.(sent,read)"), '내가 간단 제안을 보내 둔 조건은 자리가 다 차도 목록에 남는다 - 정식 제안으로 올릴 수 있게');
ok(/class="tapx qk-rep" data-act="report"/.test(js) && js.includes("p.quick ? '#/inbox' : '#/proposal/' + p.id"), '손님이 받은 간단 제안에도 신고하기가 있다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
