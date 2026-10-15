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
  let 행 = { id: 조건번호, kind: 'home' }, 패치답 = 204;
  globalThis.fetch = async (url, opt = {}) => {
    const u = decodeURIComponent(String(url)), m = (opt.method || 'GET').toUpperCase();
    기록.push({ u, m, body: opt.body ? JSON.parse(opt.body) : null });
    if (m === 'GET') return new Response(JSON.stringify(행 ? [행] : []), { status: 200 });
    if (m === 'PATCH') return new Response(패치답 === 204 ? null : '', { status: 패치답 });
    return new Response('[]', { status: 200 });
  };
  const 고치기 = async (id, set) => { 기록 = []; const res = 응답(); await demandEdit(res, { id: 사용자 }, { what: 'demand-edit', id, set }); return res; };

  const 이상한번호 = await 고치기('d1; drop', { memo: 'x' });
  ok(이상한번호.code === 400 && 기록.length === 0, '번호 모양이 이상하면 DB 를 부르지도 않는다');

  행 = null;
  const 남의것 = await 고치기(조건번호, { memo: '남의 조건 고치기' });
  ok(남의것.code === 404 && !기록.some(x => x.m === 'PATCH'), '내 조건이 아니면(조회에 안 나오면) 고치지 않는다');
  ok(기록[0] && 기록[0].u.includes('user_id=eq.' + 사용자) && 기록[0].u.includes('id=eq.' + 조건번호), '조회는 번호와 토큰의 사용자로 함께 거른다');

  행 = { id: 조건번호, kind: 'home' };
  const 주거 = await 고치기(조건번호, {
    memo: '  아이가 있어요  ', floor_bands: ['중층', '', 3, '고층'], dir_want: ['남'], age_band: '10년 이내',
    household: '3인', elevator: '있음', loan_plan: '있음',
    dep: 1, rent: 1, dongs: ['강남'], name: '바꾼 이름', phone: '01099999999', user_id: '남', key_ok: '괜찮습니다' });
  const 패치 = 기록.find(x => x.m === 'PATCH');
  ok(주거.code === 200 && 패치, '주거 조건을 고친다');
  ok(패치 && 패치.u.includes('id=eq.' + 조건번호) && 패치.u.includes('user_id=eq.' + 사용자), '고칠 때도 번호와 사용자로 함께 거른다 - 남의 행에 닿지 않는다');
  ok(패치 && Object.keys(패치.body).sort().join() === ['age_band', 'dir_want', 'elevator', 'floor_bands', 'household', 'loan_plan', 'memo'].sort().join(),
     `주거는 상세 칸만 고친다 - 지역·예산·이름·연락처·주인·상가 칸은 무시 (${패치 && Object.keys(패치.body).join(',')})`);
  ok(패치 && 패치.body.memo === '아이가 있어요' && 패치.body.floor_bands.join() === '중층,고층', '값은 다듬어서 넣는다(공백·빈 값·글자 아닌 것 걸러냄)');

  행 = { id: 조건번호, kind: 'shop' };
  await 고치기(조건번호, { memo: '코너', park_need: '2', shop_note: '1층', key_ok: '무권리만', sign_need: '상관없음', floor_bands: ['중층'] });
  const 상가 = 기록.find(x => x.m === 'PATCH');
  ok(상가 && 상가.body.park_need === 2 && 상가.body.key_ok === '무권리만' && !('floor_bands' in 상가.body), '상가는 상가 칸(권리금·간판 포함)만 고친다');
  행 = { id: 조건번호, kind: 'office' };
  await 고치기(조건번호, { memo: '역 근처', park_need: 'abc', key_ok: '무권리만' });
  const 오피스 = 기록.find(x => x.m === 'PATCH');
  ok(오피스 && !('key_ok' in 오피스.body) && 오피스.body.park_need === null, '오피스에는 권리금 칸이 없고, 숫자가 아닌 주차는 비운다');

  const 빈것 = await 고치기(조건번호, { dep: 5 });
  ok(빈것.code === 400 && !기록.some(x => x.m === 'PATCH'), '고칠 수 있는 칸이 하나도 없으면 고치지 않는다');
  패치답 = 500;
  const 실패 = await 고치기(조건번호, { memo: 'x' });
  ok(실패.code === 502, 'DB 가 거절하면 실패로 답한다 - 화면이 \'고쳤습니다\' 라고 하지 않게');
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
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
