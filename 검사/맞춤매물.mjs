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
{ const 상가조건 = { kind: 'shop', dongs: [], dep: 30000000, rent: 2000000 }, 상가 = { kind: 'shop', dong: '망월동', dep: 20000000, rent: 1500000, area: 60 };
  ok(일치율(상가조건, 상가) && 일치율(상가조건, { ...상가, deal: '매매' }) === null, '상가 · 사무실 조건(임대)은 매매 물건과 견주지 않는다 (리뷰 11-12)'); }
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

/* ── 사진 (0040) ── */
/* 매물 신고 (2026-11-14 약관 제11조) - 공개 중인 매물만 · 까닭은 정한 것 중에서 · 같은 분은 한 번만 · 사무소에는 누가 했는지 안 간다 */
{ const { matchReport } = await import('../api/_match.js');
  let 줄 = { id: 물건.id, reports: [{ at: 'x', type: '기타', uid: 'u-9', done: false }] }, 쓴 = null;
  const 원 = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => { const d = decodeURIComponent(String(u));
    if ((o.method || 'GET') === 'PATCH') { 쓴 = JSON.parse(o.body); return new Response(null, { status: 204 }); }
    return new Response(JSON.stringify(/vis=eq\.open/.test(d) && 줄 ? [줄] : []), { status: 200 }); };
  const 답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r; };
  let r = 답(); await matchReport(r, { id: 'u-1' }, { listing_id: 물건.id, type: '사실과 다른 정보', detail: '<b>관리비가 다름</b>' });
  ok(r.code === 200 && 쓴.reports.length === 2 && 쓴.reports[1].uid === 'u-1' && !/[<>]/.test(쓴.reports[1].detail) && 쓴.report_at, '신고는 물건 줄에 쌓인다(꺾쇠는 지움) · 마지막 신고 시각');
  줄 = { ...줄, reports: 쓴.reports }; r = 답(); await matchReport(r, { id: 'u-1' }, { listing_id: 물건.id, type: '기타' });
  ok(쓴.reports.filter(x => x.uid === 'u-1').length === 1 && 쓴.reports.at(-1).type === '기타', '같은 분이 다시 신고하면 앞 것을 바꾼다(쌓이지 않음)');
  r = 답(); await matchReport(r, { id: 'u-2' }, { listing_id: 물건.id, type: '아무거나' });
  ok(r.code === 400, '정해진 까닭이 아니면 받지 않는다');
  줄 = null; r = 답(); await matchReport(r, { id: 'u-3' }, { listing_id: 물건.id, type: '기타' });
  ok(r.code === 404, '공개가 끝난 매물은 신고를 받지 않는다');
  globalThis.fetch = 원;
  const fs = await import('node:fs'); const feed = fs.readFileSync(new URL('../api/feed.js', import.meta.url), 'utf8');
  ok(/\.map\(\(\{ reports, \.\.\.x \}\) => \(\{ \.\.\.x, report_open:/.test(feed), '매물장부(사무소)에는 신고 내용 대신 미확인 신고 수만 - 신고한 손님 계정이 가지 않는다'); }
/* 구글 지도 (2026-11-14) - 역 · 단지 · 반경으로 고른 곳 · 손님에게는 대략 위치 */
{ const { 고른곳들, 곳안 } = await import('../api/_match.js'); const G = await import('../api/_geo.js');
  const 곳 = 고른곳들([{ t: 'station', name: '미사역<b>', lat: 37.5605, lng: 127.1932, area: '하남시' }, { t: 'radius', lat: 37.5, lng: 127.0, r: 99999 }, { t: 'x', lat: 37, lng: 127 }, { t: 'complex', lat: 10, lng: 10 }]);
  ok(곳.length === 2 && 곳[0].r === 1000 && 곳[0].name === '미사역b' && 곳[1].r === 3000, '고른 곳 - 역은 1km 기본 · 반경은 3km 까지 · 모르는 종류 · 한국 밖 좌표는 버린다 · 이름의 꺾쇠는 지운다');
  ok(Math.abs(G.거리({ lat: 37.5605, lng: 127.1932 }, { lat: 37.5605, lng: 127.2045 }) - 1000) < 30, '거리 - 경도 0.0113도 ≈ 1km(서울 위도)');
  const L = { kind: 'home', deal: '전세', dong: '풍산동', dep: 1, area: 50, move_in: '즉시', lat: 37.5640, lng: 127.1990 };
  const d = { kind: 'home', deal: '전세', dongs: ['하남시'], dep: 2, places: [{ t: 'station', name: '미사역', lat: 37.5605, lng: 127.1932, area: '하남시' }] };
  ok(곳안(고른곳들(d.places), L) && 일치율(d, L).지역 === 30, '역 1km 안의 매물은 동이 달라도 지역 만점');
  ok(일치율({ ...d, places: [{ ...d.places[0], t: 'complex' }] }, L).지역 === 0, '단지(300m) 밖이면 지역 0점 - 시 이름(하남시)만으로 만점을 주지 않는다');
  ok(일치율({ ...d, places: [] , dongs: [] }, L).지역 === 30 && 일치율({ ...d, dongs: [] }, { ...L, lat: 0, lng: 0 }).지역 === 0, '고른 곳이 없으면 어디든 만점 · 좌표 없는 매물은 고른 곳으로는 못 맞춘다');
  const 막 = await G.좌표('경기도 하남시 미사강변대로 1');
  ok(막 === null && !G.지도켜짐(), '서버 열쇠(GOOGLE_MAPS_SERVER_KEY)가 없으면 좌표를 찾지 않는다'); }
{ const { 사진들, listingPicAdd } = await import('../api/_pics.js');
  const 길 = 'listing/11111111-2222-4333-8444-555555555555/aaaaaaaa-0000-4000-8000-000000000001/abc123def456.jpg';
  ok(사진들([길, { p: 길 }, '../etc/passwd', 'listing/x/y/z.jpg', 'http://evil/a.jpg']).length === 2, '사진 경로는 우리 저장소 모양만 받는다');
  ok(사진들(Array(30).fill(길)).length === 20, '사진은 20장까지');
  { const { o, res } = 답(); await listingPicAdd(res, { id: 'ag1' }, { id: 물건.id, data: Buffer.from('GIF89a' + 'x'.repeat(400)).toString('base64') });
    ok(o.code === 400 && /JPEG/.test(o.body.error), 'JPEG 이 아닌 파일은 받지 않는다'); }
  { const { o, res } = 답(); await listingPicAdd(res, { id: 'ag1' }, { id: 물건.id, data: Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(1300 * 1024)]).toString('base64') });
    ok(o.code === 413, '너무 큰 사진은 받지 않는다'); } }

console.log(`\n${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
