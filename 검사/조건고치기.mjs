/* 걸어 둔 조건 고치기 (2026-10-15 리뷰).
   ── 왜 있나 ──
   상세 보강의 '저장' 이 메모리(그것도 목록의 첫 조건)만 바꾸고 서버에는 아무것도 보내지 않았다.
   손님은 '저장했습니다' 를 봤지만 덧붙인 상세는 중개사에게 한 번도 가지 않았다.
   ① 전달하면 서버가 새 조건의 번호를 돌려준다 - '조건 더 채우기' 가 그 조건을 고칠 수 있게
   ② /api/my {what:'demand-edit'} - 내 조건의 상세 칸만, 유형에 맞는 칸만 고친다
   ③ 화면 - '수정' 은 누른 그 조건을, 저장은 서버로 */
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.PORTONE_API_SECRET = 'test-secret';
process.env.RESEND_API_KEY = '';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const js = 길.js();
const 응답 = () => ({ code: 0, body: null, setHeader(){}, status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; } });
const 사용자 = '11111111-2222-3333-4444-555555555555';
const 조건번호 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/* ── ① 전달하면 번호를 돌려준다 ── */
{
  const { signIdv } = await import(길.api('_idv.js'));
  const { default: handler } = await import(길.api('demand.js'));
  let 넣은곳 = null, 머리 = null, 돌려줄것 = `[{"id":"${조건번호}"}]`, 조회답 = '[]';
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url), m = (opt.method || 'GET').toUpperCase();
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 사용자, email: 'a@b.c' }), { status: 200 });
    if (u.includes('bk_demand') && m === 'POST') { 넣은곳 = u; 머리 = opt.headers; return new Response(돌려줄것, { status: 201 }); }
    if (u.includes('client_req=eq.')) return new Response(조회답, { status: 200 });
    return new Response('[]', { status: 200 });
  };
  const 보내기 = async (번호 = null) => {
    const body = { kind: 'home', dongs: ['망월동'], deal: '월세', dep: 1000, rent: 70, name: '한', phone: '01012345678',
      agree_third_party: true, agree_multi_alert: true, elapsed: 9000, website: '', client_req: 번호,
      idv_token: signIdv({ name: '한상혁', phone: '01012345678', birth: '19850101', op: 'SKT' }) };
    const res = 응답();
    await handler({ method: 'POST', headers: { authorization: 'Bearer ' + 'y'.repeat(40) },
      socket: { remoteAddress: '10.7.' + Math.floor(Math.random() * 200) + '.' + Math.floor(Math.random() * 200) }, body }, res);
    return res;
  };
  const 새것 = await 보내기();
  ok(새것.code === 201 && 새것.body.id === 조건번호, `저장하면 새 조건의 번호를 돌려준다 (${새것.code} ${새것.body && 새것.body.id})`);
  ok(/bk_demand\?select=id$/.test(넣은곳 || '') && 머리 && 머리.Prefer === 'return=representation', '번호만 돌려받는다(select=id · return=representation)');
  돌려줄것 = '';
  const 빈답 = await 보내기();
  ok(빈답.code === 201 && 빈답.body.ok === true && 빈답.body.id === null, '번호를 못 읽어도 접수는 성공이다(id 는 null)');
  조회답 = `[{"id":"${조건번호}"}]`;
  const 이미 = await 보내기('r-test-edit-0001');
  ok(이미.code === 200 && 이미.body.already === true && 이미.body.id === 조건번호, '이미 받은 전달이면 그 조건의 번호를 돌려준다');
}

/* ── ② /api/my demand-edit ── */
{
  const { demandEdit } = await import(길.api('my.js'));
  let 기록 = [];
  /* 고칠 때 거른 결과 - 내 조건이고 유형이 맞으면 한 줄이 돌아온다 */
  let 맞음 = true, 패치답 = 200, 시각칸 = true;
  globalThis.fetch = async (url, opt = {}) => {
    const u = decodeURIComponent(String(url)), m = (opt.method || 'GET').toUpperCase();
    기록.push({ u, m, body: opt.body ? JSON.parse(opt.body) : null });
    if (m === 'PATCH') {
      const b = JSON.parse(opt.body);
      if (!시각칸 && 'edited_at' in b) return new Response(JSON.stringify({ code: 'PGRST204', message: "Could not find the 'edited_at' column of 'bk_demand' in the schema cache" }), { status: 400 });
      if (패치답 !== 200) return new Response('{}', { status: 패치답 });
      return new Response(JSON.stringify(맞음 ? [{ id: 조건번호 }] : []), { status: 200 });
    }
    return new Response('[]', { status: 201 });
  };
  let 사람 = 0;   /* 횟수 제한이 다른 검사에 끼지 않게 검사마다 사용자를 바꾼다 */
  const 고치기 = async (id, set, kind = 'home', 누구 = null) => { 기록 = []; const res = 응답();
    await demandEdit({ headers: {}, socket: {} }, res, { id: 누구 || ('u-' + (++사람)), email: 'a@b.c' }, { what: 'demand-edit', id, kind, set }); return res; };
  const 패치 = () => 기록.find(x => x.m === 'PATCH');

  const 이상한번호 = await 고치기('d1; drop', { memo: 'x' });
  ok(이상한번호.code === 400 && 기록.length === 0, '번호 모양이 이상하면 DB 를 부르지도 않는다');
  const 유형없음 = await 고치기(조건번호, { memo: 'x' }, 'castle');
  ok(유형없음.code === 400 && 기록.length === 0, '유형을 모르면 고치지 않는다');

  맞음 = false;
  const 남의것 = await 고치기(조건번호, { memo: '남의 조건 고치기' }, 'home', 사용자);
  ok(남의것.code === 404, '고쳐진 행이 없으면(내 것이 아니거나 유형이 다르면) 404 로 답한다');
  ok(기록.filter(x => x.m === 'GET').length === 0 && 기록.filter(x => x.m === 'PATCH').length === 1,
     'DB 는 한 번만 부른다 - 유형을 묻는 조회를 따로 하지 않는다(2026-10-15 리뷰)');
  ok(패치() && 패치().u.includes('id=eq.' + 조건번호) && 패치().u.includes('user_id=eq.' + 사용자) && 패치().u.includes('select=id'),
     '고칠 때 번호와 토큰의 사용자로 함께 거르고, 고쳐진 행을 돌려받아 확인한다');
  ok(!기록.some(x => x.u.includes('bk_ops_log')), '고쳐지지 않았으면 운영 기록도 남기지 않는다');

  맞음 = true;
  const 주거 = await 고치기(조건번호, {
    memo: '  아이가 있어요  ', floor_bands: ['중층', '', 3, '고층'], dir_want: ['남'], age_band: '10년 이내',
    household: '3인', elevator: '있음', loan_plan: '있음',
    dep: 1, rent: 1, dongs: ['강남'], name: '바꾼 이름', phone: '01099999999', user_id: '남', key_ok: '괜찮습니다' });
  ok(주거.code === 200 && 패치(), '주거 조건을 고친다');
  ok(패치() && 패치().u.includes('or=(kind.eq.home,kind.is.null)'), '주거는 유형이 주거(또는 예전 행처럼 비어 있음)인 행만 고친다');
  const 칸 = 패치() ? Object.keys(패치().body).filter(k => k !== 'edited_at').sort().join() : '';
  ok(칸 === ['age_band', 'dir_want', 'elevator', 'floor_bands', 'household', 'loan_plan', 'memo'].sort().join(),
     `주거는 상세 칸만 고친다 - 지역·예산·이름·연락처·주인·상가 칸은 무시 (${칸})`);
  ok(패치() && 패치().body.memo === '아이가 있어요' && 패치().body.floor_bands.join() === '중층,고층', '값은 다듬어서 넣는다(공백·빈 값·글자 아닌 것 걸러냄)');
  ok(패치() && /^\d{4}-\d\d-\d\dT/.test(패치().body.edited_at || '') && 주거.body.edited_at === 패치().body.edited_at,
     '고친 시각을 함께 적고 돌려준다 - 중개사 화면이 \'조건 고침\' 을 띄운다');
  const 기록줄 = 기록.find(x => x.u.includes('bk_ops_log'));
  ok(기록줄 && 기록줄.body.action === 'demand-edit' && 기록줄.body.detail.includes(조건번호) && 기록줄.body.detail.includes('memo'),
     '운영 기록에 무엇을 고쳤는지 남긴다 - 중개사가 본 뒤 바뀐 것을 운영자가 되짚을 수 있게');

  await 고치기(조건번호, { memo: '코너', park_need: '2', shop_note: '1층', key_ok: '무권리만', sign_need: '상관없음', floor_bands: ['중층'] }, 'shop');
  ok(패치() && 패치().u.includes('kind=eq.shop') && 패치().body.park_need === 2 && 패치().body.key_ok === '무권리만' && !('floor_bands' in 패치().body),
     '상가는 유형이 상가인 행에서 상가 칸(권리금·간판 포함)만 고친다');
  await 고치기(조건번호, { memo: '역 근처', park_need: 'abc', key_ok: '무권리만' }, 'office');
  ok(패치() && !('key_ok' in 패치().body) && 패치().body.park_need === null, '오피스에는 권리금 칸이 없고, 숫자가 아닌 주차는 비운다');

  const 빈것 = await 고치기(조건번호, { dep: 5 });
  ok(빈것.code === 400 && !패치(), '고칠 수 있는 칸이 하나도 없으면 고치지 않는다');

  시각칸 = false;
  const 칸없음 = await 고치기(조건번호, { memo: '0030 전' });
  const 패치들 = 기록.filter(x => x.m === 'PATCH');
  ok(칸없음.code === 200 && 패치들.length === 2 && !('edited_at' in 패치들[1].body) && 칸없음.body.edited_at === null,
     '고친 시각 칸(0030)이 아직 없으면 그 칸만 빼고 고친다');
  시각칸 = true;

  패치답 = 500;
  const 실패 = await 고치기(조건번호, { memo: 'x' });
  ok(실패.code === 502 && !기록.some(x => x.u.includes('bk_ops_log')), 'DB 가 거절하면 실패로 답한다 - 화면이 \'고쳤습니다\' 라고 하지 않게');
  패치답 = 200;

  /* 횟수 제한 - 한 계정 1분 10번 */
  const 같은사람 = 'u-연타';
  const 답들 = [];
  for (let i = 0; i < 12; i++) 답들.push((await 고치기(조건번호, { memo: '연타 ' + i }, 'home', 같은사람)).code);
  ok(답들.slice(0, 10).every(c => c === 200) && 답들.slice(10).every(c => c === 429), `한 계정은 1분에 10번까지만 고친다 (${답들.join(',')})`);
  ok((await 고치기(조건번호, { memo: '다른 사람' }, 'home', 'u-다른')).code === 200, '다른 계정은 따로 센다');

  /* 유형이 빈 예전 주거 조건 (2026-10-15 리뷰) - 화면이 유형 없이 보내도 주거로 고친다 */
  const 유형빈것 = await 고치기(조건번호, { memo: '예전 조건' }, null);
  ok(유형빈것.code === 200 && 패치() && 패치().u.includes('or=(kind.eq.home,kind.is.null)'),
     '유형이 비어 오면 주거로 본다 - DB 는 주거이거나 비어 있는 행만 고친다');

  /* 무엇을 세는가 (2026-10-15 리뷰) - DB 가 실패한 시도·잘못된 요청은 세지 않는다 */
  const 셀사람 = 'u-셈';
  패치답 = 500;
  for (let i = 0; i < 10; i++) await 고치기(조건번호, { memo: '실패 ' + i }, 'home', 셀사람);
  패치답 = 200;
  for (let i = 0; i < 10; i++) await 고치기(조건번호, { dep: 1 }, 'home', 셀사람);
  ok((await 고치기(조건번호, { memo: '이제 됨' }, 'home', 셀사람)).code === 200,
     'DB 가 실패한 시도(502)와 고칠 칸 없는 요청(400)은 횟수에 들지 않는다 - 다시 누른 손님이 429 를 받지 않는다');
  const 더듬는사람 = 'u-더듬';
  맞음 = false;
  for (let i = 0; i < 10; i++) await 고치기(조건번호, { memo: '남의 것 ' + i }, 'home', 더듬는사람);
  맞음 = true;
  ok((await 고치기(조건번호, { memo: 'x' }, 'home', 더듬는사람)).code === 429, '남의 조건(404)은 센다 - 번호를 더듬는 것은 막는다');
  const 거절될값 = 'u-거절값';
  패치답 = 400;
  const 거절답 = await 고치기(조건번호, { memo: '제약 위반' }, 'home', 거절될값);
  for (let i = 0; i < 9; i++) await 고치기(조건번호, { memo: '제약 위반 ' + i }, 'home', 거절될값);
  패치답 = 200;
  ok(거절답.code === 400 && (await 고치기(조건번호, { memo: 'x' }, 'home', 거절될값)).code === 429,
     'DB 가 값을 거절한 것(4xx)은 센다 - 거절될 값으로 횟수 제한을 비켜 가지 못한다(2026-10-15 리뷰)');
}

/* ── ②-2 운영 기록 - 손님 수정은 따로 본다 ── */
{
  const { readLog } = await import(길.api('demands.js'));
  const 물음 = [];
  globalThis.fetch = async (url) => { const u = decodeURIComponent(String(url)); 물음.push(u); return new Response('[]', { status: 200 }); };
  const 읽기 = async only => { 물음.length = 0; const res = 응답(); await readLog({ headers: {} }, res, { only }, null); return 물음[0] || ''; };
  const 전체 = await 읽기(undefined);
  ok(전체.includes('action=neq.demand-edit'), '기록 \'전체\' 에는 손님 조건 수정이 섞이지 않는다 - 운영자 열람이 밀려나지 않게');
  const 수정만 = await 읽기('edit');
  ok(수정만.includes('action=eq.demand-edit'), '\'손님 조건 수정\' 을 고르면 그것만 본다');
  const 열람만 = await 읽기('reveal');
  ok(열람만.includes('reveal=is.true') && !열람만.includes('action='), '\'연락처 열어본 것만\' 은 그대로다');
}

/* ── ②-3 내가 보낸 제안의 시각 ── */
{
  const { myProposalTimes } = await import(길.api('feed.js'));
  let 물음 = '';
  globalThis.fetch = async (url) => { 물음 = decodeURIComponent(String(url));
    return new Response(JSON.stringify([
      { demand_id: 'd1', created_at: '2026-10-15T05:00:00Z' }, { demand_id: 'd2', created_at: '2026-10-14T01:00:00Z' },
      { demand_id: 'd1', created_at: '2026-10-13T01:00:00Z' }]), { status: 200 }); };
  const m = await myProposalTimes('a1', '2026-10-01T00:00:00+00:00');
  ok(물음.includes('select=demand_id,created_at') && 물음.includes('agent_id=eq.a1') && 물음.includes('order=created_at.desc'),
     '내 제안을 최신순으로 시각과 함께 읽는다');
  ok(m.get('d1') === '2026-10-15T05:00:00Z' && m.get('d2') === '2026-10-14T01:00:00Z' && !m.has('d3'), '조건마다 마지막으로 보낸 시각을 든다');
  ok(물음.includes('created_at=gte.2026-10-01T00:00:00+00:00'), '목록의 가장 오래된 조건보다 앞선 제안은 읽지 않는다 - 그 조건들에 대한 것일 수 없다');

  /* 1000건을 넘어도 끝까지 (2026-10-15 리뷰) - 전에는 최근 1000건만 읽어 예전 제안이 '안 보낸 것' 이 됐다 */
  const 쪽들 = [];
  globalThis.fetch = async (url) => { const q = new URL(String(url)).searchParams; const off = +q.get('offset'); 쪽들.push(off);
    const n = off === 0 ? 1000 : 3;
    return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ demand_id: 'p' + (off + i), created_at: '2026-10-10T00:00:00Z' }))), { status: 200 }); };
  const 많음 = await myProposalTimes('a1');
  ok(쪽들.join() === '0,1000' && 많음.has('p1001') && 많음.size === 1003, `1000건이 넘으면 다음 쪽을 읽는다 (${쪽들.join()} · ${많음.size})`);
  쪽들.length = 0;
  globalThis.fetch = async (url) => { 쪽들.push(1);
    return new Response(JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ demand_id: 'q' + 쪽들.length + '-' + i }))), { status: 200 }); };
  await myProposalTimes('a1');
  ok(쪽들.length === 10, '끝이 없어도 10쪽에서 멈춘다 - 목록 한 번에 DB 를 끝없이 부르지 않는다');
  const fs = await import('node:fs');
  const 목록서버 = fs.readFileSync(new URL(길.api('feed.js')), 'utf8');
  ok((목록서버.match(/mine: mine\.has\(d\.id\), mine_at: mine\.get\(d\.id\) \|\| null/g) || []).length === 2, '중개사 목록 두 곳이 제안 시각(mine_at)을 함께 보낸다');
  ok((목록서버.match(/await myProposalTimes\([^)]*, 가장오래된\(rows\)\)/g) || []).length === 2, '두 곳 모두 목록의 가장 오래된 조건 시각으로 자른다');
}

/* ── ①-2 중복 색인에 막힌 재전송도 번호를 돌려준다 ── */
{
  const { signIdv } = await import(길.api('_idv.js'));
  const { default: handler } = await import(길.api('demand.js'));
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url), m = (opt.method || 'GET').toUpperCase();
    if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 사용자, email: 'a@b.c' }), { status: 200 });
    if (u.includes('bk_demand') && m === 'POST') return new Response(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "bk_demand_client_req_idx"' }), { status: 409 });
    /* 앞의 조회는 비어 있었다(조회 횟수 제한에 걸린 경우와 같다) - 409 뒤의 조회만 찾는다 */
    if (u.includes('client_req=eq.') && 앞조회끝) return new Response(`[{"id":"${조건번호}"}]`, { status: 200 });
    if (u.includes('client_req=eq.')) { 앞조회끝 = true; return new Response('[]', { status: 200 }); }
    return new Response('[]', { status: 200 });
  };
  let 앞조회끝 = false;
  const body = { kind: 'home', dongs: ['망월동'], deal: '월세', dep: 1000, rent: 70, name: '한', phone: '01012345678',
    agree_third_party: true, agree_multi_alert: true, elapsed: 9000, website: '', client_req: 'r-test-409-0001',
    idv_token: signIdv({ name: '한상혁', phone: '01012345678', birth: '19850101', op: 'SKT' }) };
  const res = 응답();
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + 'y'.repeat(40) }, socket: { remoteAddress: '10.8.1.1' }, body }, res);
  ok(res.code === 200 && res.body.already === true && res.body.id === 조건번호, `중복 색인에 막힌 재전송도 그 조건의 번호를 찾아 돌려준다 (${res.body && res.body.id})`);
}

/* ── ①-3 중개사 목록이 고친 시각을 싣고, 칸이 없으면 물러선다 ── */
{
  const fs = await import('node:fs');
  const 목록서버 = fs.readFileSync(new URL(길.api('feed.js')), 'utf8');
  ok((목록서버.match(/slots,slots_left,edited_at'/g) || []).length === 2, '중개사 목록 두 곳이 고친 시각(edited_at)을 함께 읽는다');

  /* 물러서기를 실제로 돌린다 (2026-10-15 리뷰 - 전에는 코드 글자만 봤다).
     목록이 쓰는 select 를 소스에서 그대로 떼어 와서, 없는 칸을 DB 가 거절하는 흉내를 낸다. */
  const { getDemands } = await import(길.api('feed.js'));
  const 원select = eval(목록서버.match(/select: ('id,created_at,kind[\s\S]*?edited_at'),/)[1]);
  const 돌려 = async 없는칸 => {
    const 물음 = [];
    globalThis.fetch = async url => {
      const sel = new URL(String(url)).searchParams.get('select'); 물음.push(sel);
      const 빠진 = 없는칸.find(k => sel.split(',').includes(k));
      if (빠진) return new Response(JSON.stringify({ code: '42703', message: `column bk_demand.${빠진} does not exist` }), { status: 400 });
      return new Response('[]', { status: 200 });
    };
    const r = await getDemands(new URLSearchParams({ select: 원select, limit: '200' }));
    return { ok: r.ok, 물음 };
  };
  const 시각없음 = await 돌려(['edited_at']);
  ok(시각없음.ok && 시각없음.물음.length === 2 && !시각없음.물음[1].includes('edited_at') && 시각없음.물음[1].includes('floor_bands'),
     '0030 전이면 고친 시각만 빼고 다시 읽는다 - 목록이 통째로 실패하지 않는다');
  const 둘다없음 = await 돌려(['edited_at', 'floor_bands']);
  ok(둘다없음.ok && 둘다없음.물음.length === 3 && !둘다없음.물음[2].includes('edited_at') && !둘다없음.물음[2].includes('floor_bands') && 둘다없음.물음[2].includes('memo'),
     '고친 시각도 밴드 칸도 없으면 둘 다 빼고 읽는다');
  const 모르는칸 = await 돌려(['memo']);
  ok(!모르는칸.ok && 모르는칸.물음.length === 1, '모르는 칸이 없다는 오류는 되묻지 않고 그대로 실패로 돌려준다 - 끝없이 돌지 않는다');
}

/* ── ③ 화면 ── */
{
  const 함수 = head => { const i = js.indexOf(head); let d = 0, j = i; for(; j < js.length; j++){ if(js[j] === '{') d++; else if(js[j] === '}'){ d--; if(d === 0) return js.slice(i, j + 1); } } throw new Error('못 찾음 ' + head); };
  const 케이스 = 이름 => { const i = js.indexOf(`case '${이름}': {`); const 끝 = js.indexOf('\n      return true; }', i); return js.slice(i, 끝 + '\n      return true; }'.length); };

  /* '수정' 은 누른 그 조건을 */
  ok(/data-act="cond-edit" data-v="\$\{esc\(c\.id\)\}">수정<\/button>/.test(js) && !/data-go="#\/detail">수정/.test(js), '내 조건 카드의 수정은 그 카드의 조건을 연다');
  const 편집 = 케이스('cond-edit');
  const 조건초안몸 = 함수('function 조건초안(c){');
  const 돌려 = (S, v) => { const 판 = { 간곳: null, 알림: '' };
    new Function('S', 'go', 'toast', 'blankDraft', 'a', 'v', `${조건초안몸}\nswitch(a){ ${편집} }`)(S, x => { 판.간곳 = x; }, t => { 판.알림 = t; },
      () => ({ kind: '', dongs: [], hFloor: [], hDir: [], memo: '' }), 'cond-edit', v); return 판; };
  const 적던것 = { kind: 'shop', dongs: ['덕풍동'], memo: '적던 새 조건' };
  const 둘째 = { id: 'c2', kind: 'home', src: { id: 'c2', kind: 'home', dongs: ['망월동'], memo: '둘째 조건', floor_bands: ['고층'], household: '3인' } };
  const S1 = { draft: 적던것, conds: [{ id: 'c1', kind: 'home', src: { kind: 'home', dongs: ['미사동'] } }, 둘째] };
  const 판1 = 돌려(S1, 'c2');
  ok(판1.간곳 === '#/detail' && S1.draft.memo === '둘째 조건' && S1.draft.hFloor[0] === '고층' && S1.draft.house === '3인',
     '누른 조건(둘째)의 지금 값으로 상세 화면을 연다 - 첫 조건이 아니다');
  ok(S1.편집 && S1.편집.id === 'c2' && S1.편집.전초안 === 적던것, '적던 초안은 맡겨 둔다');
  const S2 = { draft: 적던것, conds: [{ id: 'seed1', kind: 'home', seed: true }] };
  const 판2 = 돌려(S2, 'seed1');
  ok(판2.간곳 === null && S2.draft === 적던것 && /예시/.test(판2.알림), '예시 조건은 고치지 않는다');
  ok(/if\(S\.lastRoute === '#\/detail' && h !== '#\/detail' && S\.편집\)\{ S\.draft = S\.편집\.전초안; S\.편집 = null; \}/.test(js),
     '상세 화면을 떠나면 적던 초안을 돌려놓는다');

  /* 저장 */
  const 저장 = 케이스('detail-save');
  const 상세몸 = js.slice(js.indexOf('const 상세칸 = d =>'), js.indexOf('\n/* 서버에서 온 조건을 고칠 수 있는 초안으로 */'));
  const 저장해 = async (S, 답 = { ok: true, status: 200, body: { ok: true } }) => {
    const 판 = { 간곳: null, 알림: '', 보냄: null, 다시읽음: 0 };
    const d = S.draft;
    new Function('S', 'd', 'go', 'toast', 'render', 'apiFetch', 'loadMine', 'demandPayload', 'NONHOME', 'a', `${상세몸}\nswitch(a){ ${저장} }`)(
      S, d, x => { 판.간곳 = x; }, t => { 판.알림 = t; }, () => {},
      async (u, o) => { 판.보냄 = { u, body: JSON.parse(o.body) }; return { ok: 답.ok, status: 답.status, json: async () => 답.body }; },
      () => { 판.다시읽음++; }, dd => ({ memo: dd.memo || null, floor_bands: dd.hFloor || [], dir_want: [], age_band: null, household: null, elevator: null, loan_plan: null, park_need: null, shop_note: null }),
      k => ['shop', 'office', 'storage'].includes(k), 'detail-save');
    for(let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    return 판;
  };
  const 고친것 = await 저장해({ 편집: { id: 'c2' }, draft: { kind: 'home', memo: '고친 메모', hFloor: ['고층'] } });
  ok(고친것.보냄 && 고친것.보냄.u === '/api/my' && 고친것.보냄.body.what === 'demand-edit' && 고친것.보냄.body.id === 'c2',
     '고친 상세를 서버로 보낸다 - 그 조건의 번호로');
  ok(고친것.보냄 && 고친것.보냄.body.set.memo === '고친 메모' && 고친것.보냄.body.set.floor_bands[0] === '고층' && !('dep' in 고친것.보냄.body.set),
     '상세 칸만 담는다');
  ok(고친것.간곳 === '#/my' && 고친것.다시읽음 === 1 && /고쳤습니다/.test(고친것.알림), '서버가 받으면 내 조건으로 가 다시 읽는다');
  const 거절 = await 저장해({ 편집: { id: 'c2' }, draft: { kind: 'home', memo: 'x' } }, { ok: false, status: 502, body: { error: '고치지 못했습니다 - 잠시 뒤 다시 해 주세요' } });
  ok(거절.간곳 === null && /고치지 못했습니다/.test(거절.알림), '서버가 거절하면 그 화면에 남아 알린다 - \'저장했습니다\' 라고 하지 않는다');
  const 방금 = await 저장해({ draft: { kind: 'home', memo: '더 채움', 전달됨: true, 서버id: 'c9' } });
  ok(방금.보냄 && 방금.보냄.body.id === 'c9', '완료 화면의 \'조건 더 채우기\' 는 방금 건 조건(서버가 돌려준 번호)을 고친다');
  const 보내는중 = await 저장해({ draft: { kind: 'home', memo: '더 채움', 보내는중: true } });
  ok(!보내는중.보냄 && /전달하는 중/.test(보내는중.알림), '전달 답이 오기 전에는 기다리게 한다');
  const 번호없음 = await 저장해({ draft: { kind: 'home', memo: '더 채움', 전달됨: true, 서버id: null } });
  ok(!번호없음.보냄 && 번호없음.간곳 === '#/my' && /수정에서/.test(번호없음.알림), '번호를 모르면 내 조건의 수정으로 안내한다 - 저장했다고 하지 않는다');
  ok(!/c\.pct=detailPct\(S\.draft\); if\(S\.draft\.memo\) c\.memo=S\.draft\.memo;/.test(js), '목록의 첫 조건만 고치던 옛 저장은 없다');

  /* 전달할 때 돌려받은 번호를 담는다 */
  ok(/d\.보내는중 = false; d\.서버id = j\.id \|\| null;/.test(js), '전달에 성공하면 서버가 돌려준 번호를 초안에 담는다');
  /* 전달된 초안으로 조건 등록 화면에 오면 '이미 전달된 조건' 화면으로 */
  ok(/if\(h==='#\/register' && S\.draft\.전달됨\)\{ location\.replace\('#\/contact'\); return; \}/.test(js), '전달된 초안의 조건 등록 화면은 \'이미 전달된 조건\' 화면으로 보낸다');
  ok(/mobileBack\('내 조건','#\/my'\)/.test(함수('function 전달된연락처(d){')), '\'이미 전달된 조건\' 화면의 휴대폰 뒤로는 내 조건으로 간다');
  ok(/case 'who': \{ const nd = d\.전달됨 \? \(S\.draft = blankDraft\(\)\) : d;/.test(js), '전달된 초안에서 유형을 고르면 새 초안으로 시작한다 - 전달된 것을 덮어 쓰지 않는다');

  /* 고칠 때 유형을 함께 보낸다 - 서버가 그 유형인 내 조건만 고친다 */
  ok(고친것.보냄 && 고친것.보냄.body.kind === 'home', '고칠 때 조건의 유형을 함께 보낸다');

  /* 중개사 화면 - '조건 고침' */
  const 고침몸 = js.slice(js.indexOf('const 고침시각 = t =>'), js.indexOf('\nfunction demandFromRow(d){'));
  const { 고침표, 고침알림 } = new Function('esc', `${고침몸}; return { 고침표, 고침알림 };`)(s => s);
  const 시각 = new Date(2026, 9, 15, 14, 5).toISOString();
  ok(고침표({ edited: null }) === '' && 고침알림({ edited: null, mine: true }) === '', '고친 적 없으면 아무것도 붙이지 않는다');
  ok(/조건 고침 · <span class="num">10\.15 14:05<\/span>/.test(고침표({ edited: 시각 })), '고친 조건에는 \'조건 고침\' 과 시각을 단다');
  ok(고침알림({ edited: 시각, mine: false }) === '' && /다시 확인해 주세요/.test(고침알림({ edited: 시각, mine: true })),
     '이미 제안한 조건이면 다시 확인하라는 안내를 붙인다');
  const 변환 = 함수('function demandFromRow(d){');
  ok(/edited: d\.edited_at \|\| null,/.test(변환), '서버의 고친 시각을 중개사 수요에 싣는다');
  const 목록화면 = js.slice(js.indexOf("V['#/partner/demands'] = "), js.indexOf("V['#/partner/demand'] = "));
  const 상세화면 = js.slice(js.indexOf("V['#/partner/demand'] = "), js.indexOf('\nV[', js.indexOf("V['#/partner/demand'] = ") + 5));
  ok(/\$\{고침표\(d\)\}/.test(목록화면) && /\$\{고침알림\(d\)\}/.test(목록화면), '수요 목록 카드에 고침 표시와 안내가 있다');
  ok(/\$\{고침표\(d\)\}/.test(상세화면) && /\$\{고침알림\(d\)\}/.test(상세화면), '수요 상세에도 있다');
  ok((js.match(/'demand-edit':'손님 조건 수정'/g) || []).length === 1 && !/const LG_ACT\b|LG_ACT\[/.test(js),
     '운영 기록 이름표는 한 벌이다 - 새 기록을 한 곳에만 넣어도 두 화면이 안다(2026-10-15 리뷰)');
  ok(/\$\{esc\(LOG_KO\[r\.action\]\|\|r\.action\)\}/.test(js) && /\$\{esc\(LOG_KO\[r\.action\] \|\| r\.action \|\| '조회'\)\}/.test(js),
     '열람 기록 표와 대시보드 최근 움직임이 같은 이름표를 쓴다');
  const 누가몸 = js.slice(js.indexOf('const logWho = r =>'), js.indexOf('\n\nfunction dashRecent(){'));
  const logWho = new Function(`${누가몸}; return logWho;`)();
  ok(logWho({ action: 'demand-edit', email: 'a@b.c' }) === '손님 a@b.c' && logWho({ action: 'demands', email: 'ops@x.y' }) === 'ops@x.y',
     '손님 조건 수정의 \'누가\' 는 손님이라고 밝힌다 - 운영자처럼 보이지 않게');
  const 거르기 = new Function(`${js.match(/const LG_ONLY = \[[^\]]*\];/)[0]}; return LG_ONLY;`)();
  ok(거르기.some(o => o.v === 'edit' && o.t === '손님 조건 수정') && 거르기.find(o => o.v === '').t === '운영 기록' && !거르기.some(o => o.t === '전체'),
     '열람 기록에서 손님 조건 수정만 따로 골라 볼 수 있고, 그것을 뺀 기본은 \'전체\' 가 아니라 \'운영 기록\' 이다');
  ok(/\$\{LG_ONLY\.map\(o => chip\(o\.t, \(LG\.only\|\|''\)===o\.v, o\.v\)\)\.join\(''\)\}/.test(js) && /subs:LG_ONLY \}/.test(js),
     '기록 탭의 칩과 옆 메뉴가 같은 거르기 목록을 쓴다 - 한 곳만 고쳐 어긋나지 않는다');
  const 이름표 = new Function(`${js.match(/const LOG_KO = \{[\s\S]*?\};/)[0]}; return LOG_KO;`)();
  ok(['demands', 'agents', 'listings', 'users', 'reports', 'stats'].every(k => /조회$/.test(이름표[k])),
     `기록 이름표가 무엇을 했는지까지 말한다 - '손님 계정' 이 아니라 '손님 계정 조회' (${이름표.users})`);

  /* 대시보드 '최근 움직임' 은 기록 탭의 거르기를 따르지 않는다 (2026-10-15 리뷰) */
  {
    const 기록몸 = 함수('function lgFetch(){') + '\n' + 함수('function lgRecentFetch(){');
    const 판 = { 보냄: [] };
    const LG = { rows: null, loading: false, only: 'edit', recent: null, recentLoading: false };
    const 줄 = only => [{ action: only === 'edit' ? 'demand-edit' : 'demands', at: '2026-10-15T00:00:00Z' }];
    const apiFetch = async (u, o) => { const b = JSON.parse(o.body); 판.보냄.push(b); return { ok: true, json: async () => ({ rows: 줄(b.only), at: 'x' }) }; };
    const 돌림 = new Function('LG', 'OPS', 'apiFetch', 'render', `${기록몸}; return { lgFetch, lgRecentFetch };`)(LG, { ok: true, pass: 'p' }, apiFetch, () => {});
    돌림.lgFetch(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    ok(LG.rows && LG.rows[0].action === 'demand-edit' && LG.recent === null, '\'손님 조건 수정\' 으로 거른 기록은 최근 움직임에 쓰지 않는다');
    돌림.lgRecentFetch(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    ok(LG.recent && LG.recent[0].action === 'demands' && !판.보냄[1].only, '최근 움직임은 거르기 없이(운영 기록에서) 따로 불러온다');
    LG.only = ''; LG.rows = null; LG.recent = null; 판.보냄.length = 0;
    돌림.lgRecentFetch(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    ok(판.보냄.length === 1 && LG.recent === LG.rows, '거르기가 없으면 같은 조회 한 번으로 둘 다 채운다');
    LG.recent = null; 판.보냄.length = 0;
    돌림.lgRecentFetch();
    ok(판.보냄.length === 0 && LG.recent === LG.rows, '거르기 없는 기록이 이미 있으면 다시 부르지 않고 그것을 쓴다 - 뼈대만 계속 돌지 않게');
  }
  ok(/const rows = LG\.recent\.slice\(0, 7\);/.test(js) && /if\(!LG\.recent\) lgRecentFetch\(\);/.test(js), '대시보드는 최근 움직임을 따로 든 것(LG.recent)에서 그린다');

  /* 유형이 빈 예전 주거 조건 - 초안이 주거로 연다 (2026-10-15 리뷰) */
  const S3 = { draft: 적던것, conds: [{ id: 'old', kind: null, src: { id: 'old', kind: null, dongs: ['풍산동'], memo: '예전 조건' } }] };
  돌려(S3, 'old');
  ok(S3.draft.kind === 'home' && S3.draft.who === 'home' && S3.draft.memo === '예전 조건', '유형이 빈 예전 조건은 주거로 연다 - 비운 채 보내 저장이 막히지 않게');
  const 예전저장 = await 저장해({ 편집: { id: 'old' }, draft: S3.draft });
  ok(예전저장.보냄 && 예전저장.보냄.body.kind === 'home', '그 조건을 고칠 때 유형을 주거로 보낸다');

  /* '다시 확인' 은 제안한 **뒤에** 고친 경우만 */
  const 앞 = new Date(2026, 9, 15, 13, 0).toISOString(), 뒤 = new Date(2026, 9, 15, 15, 0).toISOString();
  ok(/다시 확인해 주세요/.test(고침알림({ edited: 시각, mine: true, mineAt: 앞 })), '제안한 뒤에 손님이 고쳤으면 다시 확인하라고 한다');
  ok(고침알림({ edited: 시각, mine: true, mineAt: 뒤 }) === '', '고친 조건을 보고 제안했으면 안내하지 않는다 - 헛안내를 막는다');
  ok(/mineAt: d\.mine_at \|\| null,/.test(변환), '서버의 제안 시각을 중개사 수요에 싣는다');

  /* 수요 카드 머리줄은 접힌다 - 고침·마감 임박·업종·슬롯이 한 줄에 다 안 들어가는 휴대폰 */
  const 머리줄 = 목록화면.slice(목록화면.indexOf('<div class="card pad fade"'), 목록화면.indexOf('${고침알림(d)}'));
  ok((머리줄.match(/flex-wrap:wrap/g) || []).length >= 3, '수요 카드 머리줄과 양쪽 묶음이 좁으면 다음 줄로 접힌다');
  const 상세머리 = 상세화면.slice(상세화면.indexOf('<i class="ar-l" aria-hidden="true"></i>수요 목록') - 120, 상세화면.indexOf('${고침알림(d)}'));
  ok((상세머리.match(/flex-wrap:wrap/g) || []).length >= 2, '수요 상세의 머리줄도 접힌다');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
