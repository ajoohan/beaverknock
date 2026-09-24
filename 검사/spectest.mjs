
import * as 길 from './길.mjs';/* 중개사 회신 반영분 - 서버가 새 칸을 제대로 담아 보내는지 */
process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'secret-key';
process.env.BK_PUBLIC_KEY = 'anon-key';

let sent = [];   /* POST/PATCH 로 나간 본문 */
let world = {};

const J = (s, b) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s });

globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  const body = opt.body ? JSON.parse(opt.body) : null;
  if (m !== 'GET') sent.push({ u: u.replace('https://fake.supabase.co', ''), m, body });

  if (u.includes('/auth/v1/user')) return J(200, { id: 'u-1', email: 'a@b.c' });
  if (u.includes('/auth/v1/admin/users/')) return J(200, { email: 'a@b.c' });
  if (u.includes('/rest/v1/bk_ops_log')) return J(201, {});
  if (u.includes('/rest/v1/bk_agent')) return J(200, world.agent ?? [{ id: 'ag-1', status: 'approved', role: 'agent', user_id: 'u-1', name: '김중개', phone: '01011112222', office: '미사공인' }]);
  if (u.includes('/rest/v1/bk_listing')) {
    if (world.noNewCols && body && ('area' in body || 'duplex' in body || 'floor_no' in body))
      return J(400, { code: 'PGRST204', message: "Could not find the 'area' column of 'bk_listing' in the schema cache" });
    return J(m === 'POST' ? 201 : 200, [{ ...(body || {}), id: 'ls-1', created_at: new Date().toISOString() }]);
  }
  if (u.includes('/rest/v1/bk_demand')) return J(200, world.demand ?? [{ id: '11111111-1111-1111-1111-111111111111', kind: 'shop', slots_left: 3, dongs: ['미사1동'], user_id: 'cust-1', created_at: new Date().toISOString() }]);
  if (u.includes('/rest/v1/bk_proposal')) {
    if (world.noNewCols && body && 'duplex' in body)
      return J(400, { code: 'PGRST204', message: "Could not find the 'duplex' column of 'bk_proposal' in the schema cache" });
    return J(m === 'POST' ? 201 : 200, world.proposal ?? [{ ...(body || {}), id: 'pr-1', created_at: new Date().toISOString() }]);
  }
  if (u.includes('api.resend.com')) return J(200, { id: 'mail' });
  throw new Error('뜻밖의 호출 ' + m + ' ' + u);
};

const mkres = () => { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
const call = async (mod, body) => {
  sent = [];
  const res = mkres();
  const { default: h } = await import(mod);
  await h({ method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(40) }, url: '/x', socket: {}, body }, res);
  return res;
};

let pass = 0, fail = 0;
const t = (n, c, e) => { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  X   ' + n + (e ? '  <- ' + JSON.stringify(e).slice(0, 400) : '')); } };

const FEED = 길.api('feed.js');
const PROP = 길.api('proposal.js');
const MY   = 길.api('my.js');
const AV   = 길.api('agent-verify.js');

/* ── 매물 등록 ── */
{
  const r = await call(FEED, { what: 'listing-add', listing: {
    kind: 'home', name: '미사강변 ○○아파트', dong: '미사1동', deal: '월세',
    dep: 1000, rent: 65, fee: 8,
    area: 59.94, areaSup: 84.96, py: 18.1,
    rooms: 3, baths: 2, band: '중층', floorNo: 'B1', duplex: true,
  }});
  const row = (sent.find(x => x.u.includes('bk_listing') && x.m === 'POST') || {}).body || {};
  t('매물: 전용면적 ㎡ 가 담긴다', row.area === 59.94, row);
  t('매물: 계약·공급면적 ㎡ 가 담긴다', row.area_sup === 84.96, row);
  t('매물: 화장실 수가 담긴다 (전에는 늘 0)', row.baths === 2, row);
  t('매물: 복층이 담긴다', row.duplex === true, row);
  t('매물: 정확한 층이 담긴다', row.floor_no === 'B1', row);
  t('매물: 평도 함께 남는다 (옛 화면·대조가 본다)', row.py === 18.1, row);
  t('매물: 201 로 답한다', r.code === 201, r.body);
}
{
  await call(FEED, { what: 'listing-add', listing: { kind: 'home', name: '집', duplex: false } });
  const row = (sent.find(x => x.u.includes('bk_listing') && x.m === 'POST') || {}).body || {};
  t('매물: 복층을 안 고르면 false 다 (null 아님)', row.duplex === false, row);
  t('매물: 면적을 안 적으면 null 이다', row.area === null, row);
}

/* ── 강점(갖춰진 조건 + 기타) ── */
{
  await call(FEED, { what: 'listing-add', listing: { kind: 'home', name: '집',
    musts: ['엘리베이터', '한강 조망', '산책로'], mustsFree: '바로 앞 대형마트' } });
  const row = (sent.find(x => x.u.includes('bk_listing') && x.m === 'POST') || {}).body || {};
  t('강점: 여러 개를 그대로 담는다', JSON.stringify(row.musts) === JSON.stringify(['엘리베이터','한강 조망','산책로']), row);
  t('강점: 직접 적은 것도 담는다', row.musts_free === '바로 앞 대형마트', row);
}
{
  /* 상가 강점은 **설비 칸에 담지 않는다** (2026-09-24 · 0027·0028).
     업종·설비 칩을 걷은 뒤로 물건 쪽 fac·fac_free 는 늘 비어 있었고,
     그걸 읽던 코드는 대조하는 척만 하고 있었다 - 칸까지 지웠다.
     이제 상가는 주차를 musts 에 담고, 설비·업종은 '매물 특징'(note)에 글로 적는다.
     화면이 보내더라도 서버가 싣지 않아야 한다 - 조건 번호만 알고 바로 찔러
     넣는 길이 있으므로 여기서도 막힌 것을 확인한다. */
  await call(FEED, { what: 'listing-add', listing: { kind: 'shop', name: '가게',
    fac: ['코너 자리'], facFree: '야간 영업 가능', biz: '카페',
    musts: ['주차 가능'], note: '후드·덕트 있습니다 · 야간 영업 가능' } });
  const row = (sent.find(x => x.u.includes('bk_listing') && x.m === 'POST') || {}).body || {};
  t('강점: 상가 설비·업종 칸은 아예 나가지 않는다',
    !('fac' in row) && !('fac_free' in row) && !('biz' in row), Object.keys(row).join(','));
  t('강점: 상가 주차는 musts 로 간다',
    JSON.stringify(row.musts) === JSON.stringify(['주차 가능']), row.musts);
  t('강점: 상가 설비는 매물 특징에 글로 남는다',
    row.note === '후드·덕트 있습니다 · 야간 영업 가능', row.note);
}
{
  await call(FEED, { what: 'listing-add', listing: { kind: 'home', name: '집', mustsFree: '가'.repeat(300) } });
  const row = (sent.find(x => x.u.includes('bk_listing') && x.m === 'POST') || {}).body || {};
  t('강점: 너무 길면 잘라 담는다', row.musts_free.length === 120, row.musts_free.length);
}

/* ── 제안 ── */
{
  const r = await call(PROP, {
    demand_id: '11111111-1111-1111-1111-111111111111',
    addr: '하남시 미사강변대로 220', bname: '○○빌딩',
    dep: '3000', rent: '175', fee: '12',
    area_sup: '99.1', area: '66.2', rooms: '3', baths: '2',
    floor_mode: '정확한 층', floor_no: 'B1', duplex: true, msg: '보내드립니다',
  });
  const row = (sent.find(x => x.u.includes('bk_proposal') && x.m === 'POST') || {}).body || {};
  t('제안: 복층이 담긴다', row.duplex === true, row);
  t('제안: 전용·공급 면적이 따로 담긴다', row.area === 66.2 && row.area_sup === 99.1, row);
  t('제안: 정확한 층이 담긴다', row.floor_mode === '정확한 층' && row.floor_no === 'B1', row);
  t('제안: 201', r.code === 201, r.body);
}
{
  await call(PROP, { demand_id: '11111111-1111-1111-1111-111111111111', addr: 'x', msg: 'y' });
  const row = (sent.find(x => x.u.includes('bk_proposal') && x.m === 'POST') || {}).body || {};
  t('제안: duplex 를 안 보내면 false', row.duplex === false, row);
}

/* ── 손님이 받는 모양 ── */
{
  world.demand = [{ id: 'd-1', kind: 'shop', dongs: ['미사1동'], created_at: '2026-09-01T00:00:00Z', slots: 5, slots_left: 3 }];
  world.proposal = [{ id: 'p-1', demand_id: 'd-1', status: 'sent', agent_id: 'ag-1',
    bname: '○○빌딩', addr: '하남시 미사강변대로 220', dep: 3000, rent: 175,
    area: 66.2, area_sup: 99.1, rooms: '3', baths: '2', duplex: true,
    floor_mode: '정확한 층', floor_no: 'B1', created_at: '2026-09-02T00:00:00Z' }];
  const r = await call(MY, {});
  const p = (r.body.proposals || [])[0] || {};
  t('손님: 복층이 전달된다', p.duplex === true, p);
  t("손님: 'B1' 에 '층' 을 붙이지 않는다", p.floor === 'B1', p);
  t('손님: 조건 종류가 함께 온다 (공급/계약 이름이 여기서 갈린다)', p.kind === 'shop', p);
  t('손님: 전용·공급이 따로 온다', p.area === 66.2 && p.area_sup === 99.1, p);

  world.proposal[0].floor_no = '12';
  const r2 = await call(MY, {});
  t("손님: 숫자 층에는 '층' 을 붙인다", (r2.body.proposals[0] || {}).floor === '12층', r2.body.proposals[0]);

  world.proposal[0].floor_no = null; world.proposal[0].band = '중층';
  const r3 = await call(MY, {});
  t('손님: 정확한 층이 없으면 고·중·저를 쓴다', (r3.body.proposals[0] || {}).floor === '중층');

  world.proposal[0].floor_mode = '비공개';
  const r4 = await call(MY, {});
  t("손님: 비공개면 '비공개' 라고만 한다", (r4.body.proposals[0] || {}).floor === '비공개');
  world.demand = null; world.proposal = null;
}

/* ── 0020 이 아직 안 돌았을 때 ── */
{
  world.noNewCols = true;
  const r = await call(FEED, { what: 'listing-add', listing: {
    kind: 'home', name: '집', area: 59.9, areaSup: 84.9, py: 18.1, duplex: true, floorNo: '3' } });
  const posts = sent.filter(x => x.u.includes('bk_listing') && x.m === 'POST');
  t('0020 전: 새 칸을 빼고 한 번 더 넣는다', posts.length === 2, posts.map(x => Object.keys(x.body)));
  t('0020 전: 두 번째에는 새 칸이 없다',
    posts[1] && !('area' in posts[1].body) && !('duplex' in posts[1].body) && !('floor_no' in posts[1].body), posts[1]);
  t('0020 전: 평은 그대로 남는다', posts[1] && posts[1].body.py === 18.1, posts[1]);
  t('0020 전: 등록은 성공한다', r.code === 201, r.body);
  world.noNewCols = false;
}
{
  world.noNewCols = true;
  const r = await call(PROP, { demand_id: '11111111-1111-1111-1111-111111111111',
    addr: 'x', area: '66.2', duplex: true, msg: 'y' });
  const posts = sent.filter(x => x.u.includes('bk_proposal') && x.m === 'POST');
  t('0020 전: 제안도 복층만 빼고 다시 넣는다', posts.length === 2 && !('duplex' in posts[1].body), posts.map(x => Object.keys(x.body)));
  t('0020 전: 제안은 성공한다', r.code === 201, r.body);
  world.noNewCols = false;
}

/* ── 건축물대장은 더 이상 없다 ── */
{
  const r = await call(AV, { what: 'bld', admCd: '4145010300', bun: '220', ji: '0' });
  t('건축물대장 경로는 사라졌다 (등록번호 검사로 떨어진다)', r.code === 400, r.body);
  t('대장 관련 문구를 더 안 쓴다', !JSON.stringify(r.body).includes('건축물대장'), r.body);
}

console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
