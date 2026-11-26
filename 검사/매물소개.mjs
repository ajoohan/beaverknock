/* 매물 소개 한 장 (2026-11-26 한실장님 결정 - 7일 링크)
   - 링크는 서명된 표: 7일 뒤 닫히고, 고치면 안 열리고, 링크번호를 올리면 끊긴다
   - 명시사항을 다 채운 내 물건만 만든다 · 거래가 끝난 물건은 만들지도 열리지도 않는다
   - 받은 사람에게는 호 · 의뢰인 · 특이사항 · 정확한 좌표가 가지 않는다 */
import fs from 'node:fs';
import * as 길 from './길.mjs';
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const LID = '11111111-2222-3333-4444-555555555555';
const 물건기본 = () => ({ id: LID, agent_id: 'a1', status: 'active', vis: 'private', kind: 'home', htype: '아파트', deal: '월세', name: '미사강변 ○○아파트', dong: '미사1동',
  bdong: '101', ho: '1203', hide_unit: true, dep: 100000000, rent: 650000, fee: 120000, fee_type: '정액', fee_basis: '3개월 평균', fee_rows: [{ k: 'common', amt: 120000 }],
  area: 59.94, area_sup: 84.97, band: '중층', floor_no: '12', floors: 25, dir: '남동', dir_base: '거실', rooms: 3, baths: 2, approved: '2016.06.24', move_in: '즉시',
  parking: '가능 · 세대당 1.2대 · 총 500대', note: '남향 거실이라 오후까지 볕이 듭니다', one_line: '올수리 · 문의 010-1234-5678', owner_ok: true,
  owner_name: '홍길동', owner_phone: '01099998888', memo: '의뢰인 급매 사정', lat: 37.5651234, lng: 127.1901234, pics: [] });
let 물건 = 물건기본(), 사무소 = null, 요청 = [];
const 사무소기본 = () => ({ id: 'a1', user_id: 'u-1', role: 'agent', status: 'approved', office: '미사공인중개사사무소', name: '김중개', phone: '031-000-0000', addr: '하남시 미사대로 550', reg_no: '41450-2024-00001', settings: {} });
globalThis.fetch = async (url, opt = {}) => {
  const u = decodeURIComponent(String(url)), m = (opt.method || 'GET').toUpperCase(), body = opt.body ? JSON.parse(opt.body) : null;
  요청.push({ u, m, body });
  const 답 = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (u.includes('/auth/v1/user')) return 답({ id: 'u-1', email: 'a@b.c' });
  if (u.includes('bk_agent') && m === 'PATCH') { Object.assign(사무소, body); return 답([{ id: 'a1' }]); }
  if (u.includes('bk_agent')) return 답(사무소 ? [사무소] : []);
  if (u.includes('bk_listing')) return 답(물건 && (!u.includes('agent_id=eq.') || u.includes('agent_id=eq.' + 물건.agent_id)) ? [물건] : []);
  return 답([]);
};
const feed = await import(길.api('feed.js'));
const 부름 = async (method, body, query) => { 요청 = []; const res = { code: 0, body: null, setHeader(){}, status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; }, end(){ return this; } };
  await feed.default({ method, query: query || {}, headers: { authorization: 'Bearer ' + 'y'.repeat(40), 'x-forwarded-for': '10.9.8.' + (ran % 200) }, socket: { remoteAddress: '10.1.2.3' }, body }, res); return res; };

/* ── 표 ── */
const 지금 = Date.now(), 표 = feed.소개표(LID, 2, 지금), 읽음 = feed.소개표읽기(표, 지금);
ok(읽음 && 읽음.id === LID && 읽음.n === 2 && 읽음.until === 지금 + 7 * 864e5, '소개 링크 표 - 물건 · 링크번호 · 기한(7일)이 담긴다');
ok(feed.소개표읽기(표, 지금 + 7 * 864e5 + 1000) === null, '7일이 지나면 열리지 않는다');
ok(feed.소개표읽기(표.replace('.2.', '.3.'), 지금) === null && feed.소개표읽기(표.replace(/\.(\d{13})\./, (a, b) => `.${+b + 864e5}.`), 지금) === null, '링크번호나 기한을 고친 표는 열리지 않는다');
ok(feed.소개표읽기(표.replace(LID, '99999999-2222-3333-4444-555555555555'), 지금) === null && feed.소개표읽기('', 지금) === null && feed.소개표읽기('L1.x', 지금) === null, '다른 물건으로 바꾸거나 모양이 틀린 표는 열리지 않는다');

/* ── 만들기 ── */
사무소 = 사무소기본(); 물건 = 물건기본();
let r = await 부름('POST', { what: 'listing-share', id: LID });
ok(r.code === 200 && feed.소개표읽기(r.body.token) && feed.소개표읽기(r.body.token).n === 0, '내 물건이고 명시사항을 다 채웠으면 링크를 만든다');
const 첫표 = r.body.token;
물건 = { ...물건기본(), approved: '', note: '' };
r = await 부름('POST', { what: 'listing-share', id: LID });
ok(r.code === 409 && /명시사항/.test(r.body.error) && r.body.miss.includes('사용승인일'), '명시사항이 빠진 물건은 링크를 만들지 않는다 - 빠진 것을 알려 준다');
물건 = { ...물건기본(), status: 'done' };
r = await 부름('POST', { what: 'listing-share', id: LID });
ok(r.code === 409, '거래가 끝난 물건은 링크를 만들지 않는다');
물건 = { ...물건기본(), agent_id: 'a-other' };
r = await 부름('POST', { what: 'listing-share', id: LID });
ok(r.code === 404, '남의 물건으로는 링크를 만들지 못한다');
r = await 부름('POST', { what: 'listing-share', id: 'x' });
ok(r.code === 400, '물건 번호가 이상하면 받지 않는다');

/* ── 읽기(로그인 없이) ── */
물건 = 물건기본(); 사무소 = 사무소기본();
r = await 부름('GET', null, { share: 첫표 });
const 글 = JSON.stringify(r.body || {});
ok(r.code === 200 && r.body.listing.name === '미사강변 ○○아파트' && r.body.listing.dep === 100000000 && r.body.office.name === '미사공인중개사사무소' && r.body.office.reg_no === '41450-2024-00001', '링크로 매물과 사무소(이름 · 등록번호 · 전화)를 본다');
ok(!글.includes('1203') && !글.includes('홍길동') && !글.includes('01099998888') && !글.includes('급매 사정'), '호 · 의뢰인 이름 · 의뢰인 번호 · 특이사항은 나가지 않는다');
ok(r.body.listing.bdong == null && r.body.listing.lat === undefined && !글.includes('37.565'), '동 · 호 숨기기를 따르고 좌표는 나가지 않는다');
ok(!글.includes('010-1234-5678'), '한줄 특징에 적힌 전화번호는 가려서 나간다');
ok(!요청.some(x => x.u.includes('/auth/v1/user')), '읽기는 로그인을 묻지 않는다');
물건 = { ...물건기본(), status: 'done' };
r = await 부름('GET', null, { share: 첫표 });
ok(r.code === 404, '거래가 끝난 물건의 링크는 바로 닫힌다');
물건 = 물건기본(); 사무소 = { ...사무소기본(), status: 'paused' };
r = await 부름('GET', null, { share: 첫표 });
ok(r.code === 404, '승인이 풀린 사무소의 링크는 열리지 않는다');
r = await 부름('GET', null, { share: 첫표 + 'x' });
ok(r.code === 404, '틀린 표는 열리지 않는다');

/* ── 끊기 ── */
사무소 = 사무소기본(); 물건 = 물건기본();
r = await 부름('POST', { what: 'listing-share-cut', id: LID });
ok(r.code === 200 && 사무소.settings.lshare && 사무소.settings.lshare[LID] === 1, '끊기 - 그 물건의 링크번호를 하나 올린다');
r = await 부름('GET', null, { share: 첫표 });
ok(r.code === 404 && /끊었습니다/.test(r.body.error), '끊은 뒤에는 앞서 나간 링크가 열리지 않는다');
r = await 부름('POST', { what: 'listing-share', id: LID });
const 새표 = r.body.token;
r = await 부름('GET', null, { share: 새표 });
ok(r.code === 200 && feed.소개표읽기(새표).n === 1, '끊은 뒤 새로 만든 링크는 열린다');

/* ── 화면 ── */
const js = 길.js();
ok(js.includes(`V['#/lshare']`) && /h\.startsWith\('#\/s\/'\)/.test(js) && js.includes(`case 'lsh-make'`) && js.includes(`case 'lsh-cut'`), '화면 - 장부의 소개 한 장 단추 · 링크 창 · 공개 화면(#/s/표) · 끊기가 있다');
ok(/@media print\{\.lsh-noprint\{display:none/.test(js) || fs.readFileSync(길.HTML경로, 'utf8').includes('@media print{.lsh-noprint{display:none'), '인쇄할 때 단추는 빠진다');
/* ── 2026-11-26 코드리뷰 - 노출과 같은 권한 ── */
{ const 원 = fs.readFileSync(new URL(길.api('feed.js')), 'utf8');
  ok(/async function shareMake[\s\S]{0,900}보조원잠금\('listing_open'\) && 직\.role === 'assistant' \|\| 끈\.listing_open === false/.test(원), '소개 링크 만들기는 매물 노출과 같은 권한을 본다 - 중개보조원 · 노출을 꺼 둔 직원은 못 만든다');
  ok(/ownerSide\(\) \|\| 보조원\(\) \|\| !권한\('listing_open'\) \? '' : `<button type="button" class="btn tool sm" data-act="lsh-make"/.test(js), '화면도 그 직원에게는 소개 한 장 단추를 보이지 않는다'); }

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
