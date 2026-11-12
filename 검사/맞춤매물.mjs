/* 매물장부 노출 기준 · 맞춤매물 일치율 (2026-11-12 파트너 기획 C1 · C1-2)
   ⚠ 손님에게 나가는 물건 값에 호수 · 숨긴 동이 실리면 안 된다 - 서버까지 눌러 본다. */
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if (!c) fail++; };

const { 노출기준 } = await import('../api/feed.js');
const { 일치율, 일치기준, matched, matchWant } = await import('../api/_match.js');

/* ── 노출 기준 열 가지 ── */
const 물건 = { id: 'aaaaaaaa-0000-4000-8000-000000000001', agent_id: 'ag1', agent_user: 'u-agent', kind: 'home', name: '미사 ○○아파트', dong: '망월동', deal: '월세',
  dep: 50000000, rent: 1500000, fee: 170000, fee_basis: '최근 3개월 평균', area: 84.97, rooms: 3, baths: 2, band: '중층', dir: '남', dir_base: '거실 기준',
  move_in: '협의', bdong: '101', ho: '1203', hide_unit: true, owner_ok: true, vis: 'open', status: 'active', price_log: [] };
ok(노출기준(물건).빠짐.length === 0 && 노출기준(물건).다 === 10, '열 가지를 다 채우면 빠진 것이 없다');
ok(노출기준({ ...물건, owner_ok: false }).빠짐.join() === '소유자 확인', '소유자 확인을 안 하면 노출 못 한다');
ok(노출기준({ ...물건, dir: '' }).빠짐.includes('방향'), '주거는 방향이 있어야 한다');
ok(!노출기준({ ...물건, kind: 'shop', dir: '', band: '', floor_no: '1' }).빠짐.includes('방향'), '상가는 방향을 묻지 않는다');
ok(노출기준({ ...물건, kind: 'shop', band: '중층', floor_no: '' }).빠짐.includes('층'), '상가는 정확한 층이 있어야 한다');

/* ── 일치율 ── */
const 조건 = { id: 'dddddddd-0000-4000-8000-000000000001', user_id: 'u-1', kind: 'home', deal: '월세', dongs: ['망월동', '풍산동'], dep: 50000000, rent: 1700000,
  fee_included: true, rooms: '3룸', area_bands: ['66~99㎡'], open_when: '3개월 이내', status: 'active' };
ok(일치기준 === 80, '80점 이상만 보인다');
ok(일치율(조건, 물건).점 === 100, '다 맞으면 100점');
ok(일치율(조건, { ...물건, deal: '전세' }) === null, '거래 방식이 다르면 견주지 않는다');
ok(일치율(조건, { ...물건, kind: 'shop' }) === null, '유형이 다르면 견주지 않는다');
ok(일치율(조건, { ...물건, dong: '덕풍동' }).지역 === 0 && 일치율(조건, { ...물건, dong: '덕풍동' }).점 === 70, '동이 다르면 지역 0점 - 70점이라 안 보인다');
ok(일치율(조건, { ...물건, dep: 54000000 }).예산 === 20, '보증금이 10% 안에서 넘으면 예산 20점');
ok(일치율(조건, { ...물건, dep: 59000000 }).예산 === 10, '20% 안에서 넘으면 10점');
ok(일치율(조건, { ...물건, dep: 70000000 }).예산 === 0, '그보다 넘으면 0점');
ok(일치율(조건, { ...물건, rent: 1600000 }).예산 === 20, '월세는 관리비를 더해 견준다(160만 + 17만 > 170만)');
ok(일치율(조건, { ...물건, rooms: 2 }).면적방 === 15, '방이 하나 적으면 5점만');
ok(일치율(조건, { ...물건, area: 59 }).면적방 === 15, '면적이 옆 구간이면 5점만');
ok(일치율(조건, { ...물건, move_in: '2027.03.01 이후' }).입주 === 14, '날짜가 박힌 물건은 손님이 시기를 적었으면 조금 깎는다');
ok(일치율({ ...조건, dongs: [] }, { ...물건, dong: '덕풍동' }).지역 === 30, '동을 안 고른 조건은 지역 만점');

/* ── 서버: 손님에게 가는 값 ── */
const 답 = () => { const o = { code: 0, body: null }; return { o, res: { status(c) { o.code = c; return this; }, json(j) { o.body = j; return this; } } }; };
let 넣은 = null, 있던 = [];
globalThis.fetch = async (url, opt = {}) => {
  const u = decodeURIComponent(String(url)), m = (opt.method || 'GET').toUpperCase();
  const J = (x, s = 200) => new Response(JSON.stringify(x), { status: s });
  if (u.includes('/auth/v1/admin/users')) return J({ email: 'agent@b.c' });
  if (u.includes('bk_demand')) return J(u.includes('user_id=eq.u-1') ? [조건] : []);
  if (u.includes('bk_listing')) return J([물건, { ...물건, id: 'aaaaaaaa-0000-4000-8000-000000000002', dong: '덕풍동' }, { ...물건, id: 'aaaaaaaa-0000-4000-8000-000000000003', hide_unit: false, agent_id: 'ag2' }]
    .filter(L => !u.includes('id=eq.') || u.includes('id=eq.' + L.id)));
  if (u.includes('bk_agent')) return J([{ id: 'ag1', office: '미사중앙공인중개사사무소', status: 'approved' }, { id: 'ag2', office: '안 된 사무소', status: 'pending' }]);
  if (u.includes('bk_proposal') && m === 'POST') { 넣은 = JSON.parse(opt.body); return J([{ id: 'pppppppp-0000-4000-8000-000000000001' }], 201); }
  if (u.includes('bk_proposal')) return J(있던);
  return J([]);
};
{ const { o, res } = 답(); await matched(res, { id: 'u-1' });
  const rows = (o.body.groups[0] || {}).rows || [], 글 = JSON.stringify(o.body);
  ok(o.code === 200 && rows.length === 1 && rows[0].score.점 === 100, '80점 이상인 물건만 온다 (동이 다른 것 · 승인 안 된 사무소 것은 빠진다)');
  ok(!글.includes('1203') && !글.includes('"ho"'), '호수는 손님에게 가지 않는다');
  ok(rows[0].bdong === null, '동 · 호 숨기기를 켠 물건은 동도 가지 않는다');
  ok(!글.includes('agent_user') && !글.includes('u-agent') && !글.includes('owner_ok'), '중개사 계정 · 장부 칸은 가지 않는다');
  ok(rows[0].office === '미사중앙공인중개사사무소', '사무소 이름은 간다'); }
{ const { o, res } = 답(); await matchWant({ headers: {} }, res, { id: 'u-1' }, { demand_id: 조건.id, listing_id: 물건.id });
  ok(o.code === 201 && o.body.id, "'보고 싶어요'는 제안 한 건을 만든다");
  ok(넣은 && 넣은.agent_id === 'ag1' && 넣은.demand_id === 조건.id && !('ho' in 넣은) && 넣은.bdong === null, '그 제안에도 호수 · 숨긴 동은 없다');
  ok(/보고 싶어요/.test(넣은.msg) && 넣은.status === 'sent', '손님이 먼저 고른 것이라고 적힌다'); }
{ const { o, res } = 답(); await matchWant({ headers: {} }, res, { id: 'u-2' }, { demand_id: 조건.id, listing_id: 물건.id });
  ok(o.code === 404, '남의 조건으로는 요청하지 못한다'); }
{ 있던 = [{ id: 'old-1', status: 'sent' }]; 넣은 = null; const { o, res } = 답(); await matchWant({ headers: {} }, res, { id: 'u-1' }, { demand_id: 조건.id, listing_id: 물건.id });
  ok(o.code === 200 && o.body.again && o.body.id === 'old-1' && !넣은, '두 번 누르면 새로 만들지 않고 있던 것으로 잇는다'); }

console.log(`\n${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
