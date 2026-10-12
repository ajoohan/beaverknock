/* 무엇을 채워야 다음으로 넘어가는가 — 등록·제안·접수의 문턱 셋.
   문턱이 어긋나면 **아무 말 없이 막힌다.** 버튼은 회색인데 왜 회색인지는
   화면 어디에도 없다. 그래서 여기서 '무엇이 열고 무엇이 막는지' 를 못 박는다.
   (2026-09-24 에 gatetest 24건이 임시 폴더 청소로 사라져 다시 썼다) */
import * as 길 from './길.mjs';

const js = 길.js();
const 잘라 = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); return js.slice(i, j); };
const 함수 = head => {
  const i = js.indexOf(head);
  if(i < 0) throw new Error('못 찾음 ' + head);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
};

const 밑 = 잘라('const MUSTS', '/* ── 손님이 고르는 밴드')
         + 잘라('const HAREA = [', 'const FLOORS=')
         + "\nconst NONHOME = k => k === 'shop' || k === 'office' || k === 'storage';\n"
         + 잘라('const KIND_WORDS = {', 'const words = k =>')
         + 잘라('const words = k =>', '\n') + '\n'
         /* regMiss 가 조사를 고를 때 부른다 - '업종을' 인지 '업무를' 인지 */
         + 함수('function josa(word, withBatchim, without){') + '\n';
const M = new Function(`${밑}
  ${함수('function listingOk(f){')}
  ${함수('function proposeChecks(f){')}
  ${함수('function regMiss(d){')}
  /* lmoveArr 는 화면 전역(S)을 보므로 흉내만 낸다 - 여기서 재는 것은 문턱이지
     그 함수가 아니다. 입주 시기를 '골랐다/안 골랐다' 만 갈라 주면 된다. */
  return {listingOk, proposeChecks, regMiss};`).call(null);

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

/* ── 제안 보내기 문턱 ── */
const 제안칸 = f => M.proposeChecks(f).map(c => c[0]);
const 못채운 = f => M.proposeChecks(f).filter(c => !c[1]).map(c => c[0]);

const 주거제안 = { pkind:'home' }, 상가제안 = { pkind:'shop' };
ok(제안칸(주거제안).includes('방/욕실'),  '주거 제안은 방/욕실을 묻는다');
ok(!제안칸(상가제안).includes('방/욕실'), '상가 제안은 방/욕실을 묻지 않는다 - 가게에 방 수를 묻지 않는다');
/* 대표 지시(2026-09-23) - 상가에서 방향·방향기준을 걷었다. 매물 등록만 고치고
   제안 화면을 두면, 상가 물건을 불러왔을 때 빈 칸이 남아 **영영 못 보낸다.** */
ok(제안칸(주거제안).includes('방향') && 제안칸(주거제안).includes('방향 기준'),
   '주거 제안은 방향·방향 기준을 묻는다 (표시·광고 명시사항)');
ok(!제안칸(상가제안).includes('방향') && !제안칸(상가제안).includes('방향 기준'),
   '상가 제안은 방향을 묻지 않는다 - 매물 등록과 같은 규칙이어야 한다');
for(const k of ['소재지','건물명','공급면적','전용면적','가격','관리비','관리비 기준','층 표기','입주가능일','주차장'])
  ok(제안칸(상가제안).includes(k) && 제안칸(주거제안).includes(k), `'${k}' 은 두 유형 모두 묻는다`);

/* 관리비는 **0 원도 답이다.** 빈칸과 0 을 같이 막으면 관리비 없는 집을 못 올린다. */
const 상가채움 = { pkind:'shop', addr:'하남 미사', bname:'○○빌딩', areaSup:'100', area:'80',
  dep:'50000000', fee:'0', feeType:'확인불가', feeBasis:'표시하지 않음',
  floorMode:'정확한 층', floorNo:'1', moveIn:'즉시', park:'없음' };
ok(못채운(상가채움).length === 0, `상가 제안이 다 채워진다 - 못 채운 칸 ${JSON.stringify(못채운(상가채움))}`);
ok(못채운({ ...상가채움, fee:'' }).includes('관리비'), '관리비를 아예 비우면 막힌다');
ok(!못채운({ ...상가채움, fee:'0' }).includes('관리비'), '관리비 0 원은 통과한다 - 없는 것도 답이다');

/* 층 표기 세 갈래. '비공개' 는 그 자체로 답이라 더 묻지 않는다. */
ok(못채운({ ...상가채움, floorMode:'비공개', floorNo:'' }).length === 0, '층 비공개면 층 번호를 안 묻는다');
ok(못채운({ ...상가채움, floorMode:'정확한 층', floorNo:'' }).includes('층 표기'), '정확한 층인데 비면 막힌다');
ok(못채운({ ...상가채움, floorMode:'고·중·저', band:'중층', floorNo:'' }).length === 0, '고·중·저를 고르면 통과');
ok(못채운({ ...상가채움, floorMode:'고·중·저', band:'', floorNo:'' }).includes('층 표기'), '고·중·저인데 안 고르면 막힌다');
ok(못채운({ ...상가채움, floorMode:'' }).includes('층 표기'), '층 표기를 아예 안 고르면 막힌다');

/* ── 매물 등록 문턱 ── lmoveArr 를 못 쓰므로 입주 시기를 뺀 나머지를 본다 */
const 매물 = f => { try { return M.listingOk(f); } catch(e) { return 'lmoveArr'; } };
ok(매물({}) === 'lmoveArr' || 매물({}) === false, '빈 매물은 통과하지 못한다');

/* ── 조건 접수 문턱 ── 무엇이 비었는지 **한 가지만** 집어 준다(한 번에 하나씩 고치게) */
const 접수 = d => { const m = M.regMiss(d); return m ? m.k : null; };
ok(접수({ kind:'home' }) === 'deal', '주거는 거래 방식부터 묻는다');
ok(접수({ kind:'home', deal:'월세' }) === 'dongs', '거래 방식 다음은 동네');
ok(접수({ kind:'home', deal:'월세', dongs:['미사1동'] }) === 'dep', '동네 다음은 보증금');
ok(접수({ kind:'home', deal:'월세', dongs:['미사1동'], dep:'1' }) === 'htype', '보증금 다음은 주택 유형');
ok(접수({ kind:'home', deal:'월세', dongs:['미사1동'], dep:'1', htype:['아파트'] }) === null,
   '주거는 다섯 칸이면 넘어간다');
/* 상가는 업종부터 - 업종을 모르면 어느 자리를 보여줄지 정할 수 없다 */
ok(접수({ kind:'shop' }) === 'biz', '상가는 업종부터 묻는다');
ok(접수({ kind:'shop', biz:'카페' }) === 'areaMin', '업종 다음은 면적');
ok(접수({ kind:'shop', biz:'카페', areaMin:'12' }) === 'dongs', '면적 다음은 상권');
ok(접수({ kind:'shop', biz:'카페', areaMin:'12', dongs:['미사역 상권'] }) === 'dep', '상권 다음은 보증금');
ok(접수({ kind:'shop', biz:'카페', areaMin:'12', dongs:['미사역 상권'], dep:'1' }) === 'rent',
   '상가는 월세도 받는다');
ok(접수({ kind:'shop', biz:'카페', areaMin:'12', dongs:['미사역 상권'], dep:'1', rent:'1' }) === null,
   '상가는 여섯 칸이면 넘어간다');
/* 상가에는 주택 유형을 묻지 않는다 - 가게에 '아파트/빌라' 를 고르게 하면 안 된다 */
ok(접수({ kind:'shop', biz:'카페', areaMin:'12', dongs:['미사역'], dep:'1', rent:'1' }) !== 'htype',
   '상가는 주택 유형을 묻지 않는다');
/* 사무실·창고도 상가와 같은 길을 탄다(NONHOME) */
for(const k of ['office','storage'])
  ok(접수({ kind:k }) === 'biz', `${k} 도 상가와 같은 순서로 묻는다`);

/* 막을 때는 **무엇을 적어야 하는지 말한다.** 회색 버튼만으로는 알 수 없다. */
const 말 = M.regMiss({ kind:'home' });
ok(말 && 말.m && 말.m.length > 4 && /주세요|세요/.test(말.m), `막을 때 할 말이 있다 - "${말 && 말.m}"`);
ok(M.regMiss({ kind:'shop' }).m.includes('적어'), `상가도 마찬가지 - "${M.regMiss({kind:'shop'}).m}"`);
/* 조사를 '을(를)' 로 적어 두면 화면에 그대로 나온다. josa() 가 있는데 여기만 안 쓰고
   있었다 - 받침에 따라 하나만 고른다(2026-09-24). */
ok(M.regMiss({ kind:'shop' }).m.startsWith('업종을'),
   `상가 업종 - "${M.regMiss({kind:'shop'}).m}" (받침 있으니 '을')`);
ok(M.regMiss({ kind:'storage' }).m.startsWith('보관하실 물품을'),
   `창고 - "${M.regMiss({kind:'storage'}).m}" (물품 - 받침 있으니 '을')`);
ok(M.regMiss({ kind:'office' }).m.endsWith('적어주세요'),
   `사무실 - "${M.regMiss({kind:'office'}).m}"`);
/* 주석은 걷어내고 본다 - josa() 옆 설명이 바로 '6가지을(를)' 을 예로 들고 있어서,
   그대로 재면 **설명하는 글이 어겼다고 나온다.** 재는 것은 화면에 나갈 글이다. */
const 글만 = 길.js().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const 남은조사 = [...글만.matchAll(/.{0,20}[을은이와가]\([를는가과이]\).{0,20}/g)].map(x => x[0].trim());
ok(남은조사.length === 0,
   남은조사.length ? `'을(를)' 표기가 남아 있다 - ${남은조사.slice(0,3).join(' / ')}`
                 : "화면에 나갈 글에 '을(를)' 같은 표기가 없다");

/* ── 규칙과 적힌 말이 같은가 ── (2026-09-24 코드리뷰)
   대조 3단계는 주거일 때 물건의 월세에 **관리비를 더해서** 손님 예산과 견준다.
   그런데 화면은 여태 '매월 낼 수 있는 최대' 라고만 적었다. 규칙과 말이 다르면
   손님은 월세만 적고 관리비까지 더해 걸러진다 - 왜 사라졌는지 알 길이 없다.
   상가는 더하지 않으므로(feeIncluded: !shop) 거기에 적으면 그것대로 거짓말이다. */
const js2 = 길.js();
ok(/feeIncluded: !shop/.test(js2), '주거만 관리비를 더해 견준다 (feeIncluded: !shop)');
const 주거월세 = js2.slice(js2.indexOf('return w.rent ?'), js2.indexOf('return w.rent ?') + 700);
ok(/매월 낼 수 있는 최대 · 관리비 포함/.test(주거월세),
   '주거 월세 칸이 **관리비 포함**이라고 말한다');
const 상가월세 = js2.slice(js2.indexOf('<div data-req="rent">'), js2.indexOf('<div data-req="rent">') + 400);
ok(/매월 낼 수 있는 최대/.test(상가월세) && !/관리비 포함/.test(상가월세),
   '상가 월세 칸은 관리비를 말하지 않는다 - 거기는 더하지 않는다');

/* ── 과녁 44px ── (2026-09-24 결정 · 2026-09-25 방식 바꿈)
   전에는 보이지 않는 판(::after)을 덮어 누를 자리만 넓혔다. 자리를 안 먹는 대신
   **옆 것의 자리를 먹는다** - 그래서 줄 사이를 벌려 두어야 했고 데스크톱에는
   아예 걸지 못했다. 이제 상자를 키운다. 옆을 먹을 수가 없다. */
const css = 길.css();
ok(/\.tapx:not\(p \.tapx\)\{[^}]*min-height:44px/.test(css),
   '링크 과녁은 상자를 키워 44px 로 만든다');
ok(/^\.chip\{[^}]*min-height:44px/m.test(css),
   '칩도 같은 규칙 - 폭에 상관없이 44px');
ok(!/\.tapx::after/.test(css) && !/\.footlinks a::after/.test(css),
   '덮개(::after)는 남아 있지 않다 - 두 방식을 같이 두면 모바일에서 이중으로 넓어진다');
/* 문장 속 링크는 뺀다 - 22px 짜리 줄에서 44px 로 키우면 글줄이 벌어진다 */
ok(/:not\(p \.tapx\)/.test(css),
   '문장 속 링크는 뺀다 (2.5.8 예외) - 줄 안에 나란히 선 링크는 원래 작다');
ok(/\.tapx:not\(p \.tapx\)\{[^}]*align-items:center/.test(css),
   '키운 상자 안에서 글자가 가운데 선다 - 안 그러면 위로 쏠린다');

/* ── 파트너가 자기 화면으로 가는 문 (2026-09-28 이훈희 님 제보) ──
   문턱을 세우는 것만큼 **문을 내는 것**도 이 파일의 일이다.
   승인된 중개사가 첫 화면으로 들어오면 파트너 화면으로 가는 길이 아예 없었다.
   원인은 하나였다 - `S.agent` 를 채우는 곳이 `loadFeed()` 뿐인데 라우터는
   그것을 파트너 수요 목록에서만 부른다. 아무도 묻지 않으니 답이 없었다. */
const api = (await import('node:fs')).readFileSync(new URL(길.api('my.js')), 'utf8');
ok(/body\.what === 'agent'/.test(api),
   "서버가 '내가 파트너인가' 에 답하는 자리가 있다 (/api/my, what:'agent')");
ok(/import \{ approvedAgent, meAgent \} from '\.\/feed\.js'/.test(api),
   '자격을 보는 눈은 feed 와 같은 것을 쓴다 - 두 군데서 다르게 보면 어긋난다');
ok(/agent: null, note: 'lookup-failed'/.test(api),
   '못 물어봤으면 막지 않고 손님으로 둔다 - 진짜 문턱은 화면마다 서버가 다시 본다');
ok(!/agent-me\.js|whoami/.test(api), '새 주소를 내지 않았다 - 함수 상한(12개)이 꽉 찼다');

ok(/async function readAgent\(미리\)/.test(js), '화면도 로그인 직후 한 번 물어본다');
/* 2026-10-12: 둘을 한 번의 호출(what:'me')로 받고 나눠 읽는다 - 못 받으면 예전처럼 따로 묻는다 */
ok(/await Promise\.all\(\[readConsent\(둘 && 둘\.consent\), readAgent\(둘 && 둘\.agent\)\]\)/.test(js),
   '동의와 나란히 읽는다 - 둘 다 "내가 누구인가" 라 앞뒤로 기다릴 이유가 없다');
ok(/if\(agentKey\(\) !== 전 && S\.lastRoute !== null\) render\(\)/.test(js),
   '첫 그림이 나간 뒤에 답이 와도 다시 그린다 - boot 이 1.2초에서 끊기 때문이다');

ok(/function partnerDoor\(kind\)\{/.test(js), '손님 화면에서 파트너 화면으로 가는 문이 있다');
ok(/if\(!S\.agent\) return '';/.test(js),
   '파트너가 아닌 분에게는 보이지 않는다 - 아무 말도 하지 않는다');
ok(/S\.agent\.status === 'approved'/.test(js) && /'#\/partner\/verify'/.test(js),
   '아직 자격 확인 전이면 수요 목록이 아니라 그 자리로 보낸다');
{
  const nav = 함수('function navUser(active)');
  ok(/partnerDoor/.test(nav), '손님 상단바에 그 문이 있다 - 전에는 내 조건·제안함뿐이었다');
  ok(/isMo\(\)\?'':partnerDoor\('link'\)/.test(nav) && /isMo\(\)\?partnerDoor\(\):''/.test(nav),
     '데스크톱은 메뉴에, 모바일은 오른쪽에 - 한 화면에 하나만 선다');
}
ok(/\$\{isMo\(\) && S\.agent \? partnerDoor\(\) : ''\}/.test(js),
   '첫 화면에서도 문이 두 번 서지 않는다 (처음에 실제로 두 번 섰다)');
ok(/S\.agent \? partnerDoor\('link'\) : `<a data-go="#\/partner">파트너 안내<\/a>`/.test(js),
   '파트너로 확인된 분에게는 안내 대신 자기 화면으로 가는 길을 보여준다');
ok(/맞는 손님이 기다립니다/.test(js),
   "첫 화면의 파트너 띠도 이미 들어와 계신 분께 '먼저 두드리세요' 라고 하지 않는다");

/* 이 가드는 **원래부터 있었다.** S.agent 가 늘 비어 있어서 한 번도 돌지 못했을 뿐이다.
   위에서 S.agent 를 채워 주기 시작했으므로 이제 실제로 돈다. */
ok(/h==='#\/partner\/join' && S\.agent && !\['ok','sending','already'\]\.includes\(S\.form\.jSent\)/.test(js),
   '이미 신청한 계정은 가입 화면을 다시 걸지 않는다');
ok(/S\.agent\.status === 'approved' \? '#\/partner\/demands' : '#\/partner\/verify'/.test(js),
   '승인됐으면 수요 목록으로, 아니면 자격 확인으로 보낸다');

/* ── 로그인 전에는 내 것을 묻지 않는다 (2026-10-08) ──
   파트너 안내(#/partner)는 누구나 여는데, 라우터가 거기서 내 물건·내 제안을 불러
   로그인 안 한 방문마다 /api/feed 를 두 번 두드리고 401 을 두 번 받았다. */
for(const 이름 of ['loadListings', 'loadMyProps', 'loadMine', 'loadFeed']){
  const 몸 = js.slice(js.indexOf(`function ${이름}(`), js.indexOf(`function ${이름}(`) + 260);
  ok(/if\(!세션있음\(\)\)/.test(몸), `${이름} 은 세션이 없으면 서버를 부르지 않는다`);
}
/* 세션 판정은 한 곳 - 각자 적으면 그중 하나가 또 빠진다 */
ok((js.match(/const 세션있음 = /g) || []).length === 1, '세션 판정 함수는 하나뿐이다');
ok(/const waitingFor = ready => 세션있음\(\) && !ready;/.test(js), '기다림 표시도 같은 판정을 쓴다');
ok(!/function load(Feed|Mine|Listings|MyProps)\([^)]*\)\{\s*\n\s*const sess = store\.get\(\);/.test(js),
   '불러오는 함수들이 세션을 따로 읽지 않는다');
/* 공개 안내 화면(#/partner)에서는 내 목록을 부르지 않는다 - 로그인한 손님도 403 을 받았다 */
ok(!/h==='#\/partner'\) loadMyProps|h==='#\/partner'\) loadListings/.test(js), '#/partner 에서 내 제안·내 물건을 부르지 않는다');

/* ── 2026-10-12 실연동을 켠 날: 로그인하고 돌아오면 가입 화면이 '준비 중' 양식에 갇혔다 ──
   boot 가 돌아오는 길(readAuthRedirect)에서는 본인확인 설정을 묻지 않았다. */
{
  const boot = js.slice(js.indexOf('(function boot(){'));
  ok(boot.indexOf('idvConfig()') >= 0 && boot.indexOf('idvConfig()') < boot.indexOf('readAuthRedirect()'),
     '로그인·본인확인에서 돌아오는 길에도 본인확인 설정을 먼저 묻는다');
  ok(/if\(h === '#\/partner\/join' \|\| h\.startsWith\('#\/contact'\)\) idvConfig\(\)/.test(js),
     '가입·연락처 화면에 들어올 때마다 설정을 확인한다(오래된 탭 포함)');
  const 가입 = js.slice(js.indexOf('V["#/partner/join"]'), js.indexOf('function sendVerify'));
  ok(/if\(!S\.idvCfg\) body =/.test(가입) && /else if\(live\) body =/.test(가입),
     '설정을 모르면 어느 양식도 그리지 않는다 - 이름만 받는 양식으로 가면 다음이 되돌아온다');
}

/* ── idvConfig · need_idv · 창구 고르기를 실제로 돌린다 ── */
{
  const 시작 = js.indexOf('let idvCfgAt = 0');
  const 끝 = js.indexOf('\n}\n', js.indexOf('function idvConfig()')) + 3;
  const 고르기시작 = js.indexOf('function idvMustBeLive()');
  const 고르기끝 = js.indexOf('async function idvStart(');
  const 몸 = js.slice(시작, 끝) + '\n' + js.slice(고르기시작, 고르기끝);
  const idvChannels = cfg => (cfg && Array.isArray(cfg.channels)) ? cfg.channels : [];
  const 쉼 = () => new Promise(r => setTimeout(r, 0));
  const 만들기 = (BOOTED = true) => {
    const 판 = { S: {}, 그림: 0, 답: null, 부름: 0 };
    const fetch = async () => {
      판.부름++;
      if(판.답 === 'fail') throw new Error('net');
      if(판.답 === 500) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => 판.답 };
    };
    const f = new Function('S', 'fetch', 'render', 'BOOTED', 'idvChannels',
      `${몸}; return { idvConfig, idvMustBeLive, idvPickChannel, 시각: v => { idvCfgAt = v; }, 시각보기: () => idvCfgAt };`);
    return Object.assign(판, f(판.S, fetch, () => 판.그림++, BOOTED, idvChannels));
  };
  const 실연동 = { enabled: true, live: true, channels: [{ k: 'inicis', key: 'k1' }] };
  {
    const 판 = 만들기(); 판.답 = 실연동;
    await 판.idvConfig();
    ok(판.S.idvCfg.live === true && 판.그림 === 1, '처음 받은 답으로 설정이 생기고 한 번 다시 그린다');
    판.시각(Date.now() - 10 * 60 * 1000); 판.답 = 'fail';
    판.idvConfig(); await 쉼(); await 쉼();
    ok(판.S.idvCfg.live === true && 판.그림 === 1,
       '5분 뒤 다시 묻다 통신이 끊겨도 갖고 있던 실연동 설정을 버리지 않는다(화면도 그대로)');
    판.시각(Date.now() - 10 * 60 * 1000); 판.답 = 500;
    판.idvConfig(); await 쉼(); await 쉼();
    ok(판.S.idvCfg.live === true, '서버가 500 을 줘도 마찬가지다');
    판.시각(Date.now() - 10 * 60 * 1000); 판.답 = { enabled: true, live: false, channels: [] };
    판.idvConfig(); await 쉼(); await 쉼();
    ok(판.S.idvCfg.live === false && 판.그림 === 2, '진짜 답이 바뀌었으면 그 답을 따르고 다시 그린다');
  }
  {
    const 판 = 만들기(); 판.답 = 'fail';
    const cfg = await 판.idvConfig();
    ok(cfg.enabled === false, '갖고 있던 답이 없으면 그때만 "안 붙음" 이다');
    const 남은 = 5 * 60 * 1000 - (Date.now() - 판.시각보기());
    ok(남은 <= 31 * 1000, `처음부터 실패했으면 5분이 아니라 30초 뒤에 다시 묻는다 (${Math.round(남은 / 1000)}초)`);
  }
  {
    const 판 = 만들기(false); 판.답 = 실연동;
    await 판.idvConfig();
    ok(판.그림 === 0, '첫 화면을 그리기 전에는 다시 그리지 않는다 - 계정을 몰라 가드가 엉뚱하게 튕길 수 있다');
  }
  /* need_idv: 화면은 '안 붙음' 이라 알고 있었는데 서버가 본인확인을 요구했다 */
  {
    const 판 = 만들기(); 판.답 = { enabled: false, live: false, channels: [] };
    await 판.idvConfig(); 판.그림 = 0;
    판.답 = 'fail';
    판.idvMustBeLive(); await 쉼(); await 쉼();
    ok(판.S.idvCfg.live === true && 판.S.idvCfg.enabled === true,
       '서버가 본인확인을 요구하면 다시 받기가 실패해도 실연동으로 둔다 - 이름만 받는 양식으로 안 간다');
    판.시각(0); 판.답 = 실연동;
    const 고름 = await 판.idvPickChannel('inicis');
    ok(고름 && 고름.창구.key === 'k1', '창구를 모르면 진짜 답을 기다렸다가 그 창구로 연다');
    ok(판.그림 >= 1, '창구가 생기면 다시 그린다 - 버튼 이름이 간편인증으로 바뀐다');
  }
  {
    const 판 = 만들기(); 판.답 = 실연동;
    await 판.idvConfig(); 판.그림 = 0;
    판.시각(Date.now() - 10 * 60 * 1000);
    판.답 = { ...실연동, channels: [...실연동.channels, { k: 'danal', key: 'k2' }] };
    await 판.idvConfig(); await 쉼(); await 쉼();
    ok(판.그림 === 1, '실연동 그대로 창구만 늘어도(다날) 다시 그린다 - 버튼이 둘이 된다');
    ok((await 판.idvPickChannel('danal')).창구.key === 'k2', '고른 창구로 연다');
    ok((await 판.idvPickChannel('옛이름')).창구.key === 'k1', '모르는 이름이면 첫 창구로 연다');
  }
  {
    const 판 = 만들기(); 판.답 = { enabled: false };
    ok(await 판.idvPickChannel('inicis') === null, '안 붙어 있으면 열 창구가 없다');
  }
}

/* ── 가입할 때 넣은 메일을 또 묻지 않는다 - 실제로 돌려 본다 ── */
{
  const 시작 = js.indexOf('const accountEmail = ');
  const 끝 = js.indexOf('V["#/partner/join"]');
  const S = { user: { email: 'jin@plustonic.com' } };
  const esc = x => String(x);
  const { joinEmailField, accountEmail } = new Function('S', 'esc', js.slice(시작, 끝) + '; return { joinEmailField, accountEmail };')(S, esc);
  ok(joinEmailField({}) === '' && accountEmail() === 'jin@plustonic.com', '계정 메일이 있으면 이메일 칸을 그리지 않는다');
  S.user.email = '';
  ok(/data-in="j-email"/.test(joinEmailField({})), '계정 메일이 없으면(카카오 미동의) 그때만 칸을 보인다');
  ok(/email: accountEmail\(\) \|\| f\['j-email'\] \|\| ''/.test(js), '신청에는 계정 메일을 담는다');
}

/* ── 2026-10-12 가입 전 계정이 파트너 화면(수요 목록·품질 점수)을 그대로 봤다 ──
   로그인이 필요한 화면의 길목 전체(MINE · #/contact · #/partner/join · 파트너 화면)를
   떼어 실제로 돌린다. 로그인 판정 함수도 원본 그대로 쓴다. */
{
  const 판정 = js.slice(js.indexOf('let 계정확인실패 = false;'), js.indexOf('const 로그인전 = ') + 60).split('\n').slice(0, 3).join('\n');
  const 시작 = js.indexOf("  const MINE = h==='#/my'");
  const 끝 = js.indexOf('  /* 손님 조건 전문 · 제안 · 매물 등록은');
  const 길목 = js.slice(시작, 끝);
  const 가기 = (h, S, 세션 = false, 실패 = false) => {
    let 간곳 = null, 그림 = '';
    const location = { replace: x => { 간곳 = x; } };
    const $ = () => ({ set innerHTML(v){ 그림 = v; } });
    const store = { get: () => 세션 ? { access_token: 't' } : null };
    new Function('h', 'S', 'location', 'store', '$', 'bkLoader', 'keepDraft',
      `const 세션있음 = () => { const s = store.get(); return !!(s && s.access_token); };
       ${판정.replace('let 계정확인실패 = false;', `let 계정확인실패 = ${실패};`)}
       ${길목}\nreturn;`)(h, S, location, store, $, () => '<i>loader</i>', () => {});
    return 간곳 || (그림 ? '기다림' : null);
  };
  const 손 = (o = {}) => ({ user: { id: 'u' }, agent: null, agentKnown: true, form: {}, ...o });
  ok(가기('#/partner/demands', 손({ user: null })) === '#/login', '로그인 전이면 로그인으로');
  ok(가기('#/partner/demands', 손({ user: null, agentKnown: false }), true) === '기다림',
     '세션은 있는데 계정을 읽는 중이면(느린 통신) 튕기지 않고 기다린다');
  /* 같은 판정이 손님 화면에도 - 전에는 파트너 화면에만 있었다 */
  for(const h of ['#/my', '#/inbox', '#/proposal/p1', '#/contact', '#/partner/join']){
    ok(가기(h, 손({ user: null }), true) === '기다림', `${h} 도 계정을 읽는 동안은 로그인으로 보내지 않는다`);
    ok(가기(h, 손({ user: null }), false) === '#/login', `${h} 는 로그인 전이면 로그인으로`);
  }
  ok(가기('#/my', 손({ user: null }), true, true) === '#/login',
     '계정 확인이 통신 문제로 실패했으면 영영 기다리지 않고 로그인으로');
  ok(가기('#/kind', 손({ user: null }), true) === null, '로그인이 필요 없는 화면은 기다리지 않는다');
  ok(가기('#/partner', 손({ user: null }), true) === null, '공개 안내(#/partner)도 기다리지 않는다');
  ok(가기('#/partner/settings', 손()) === '#/partner/join', '파트너가 아니라고 확인되면 가입으로');
  ok(가기('#/partner/demands', 손({ agentKnown: false })) === null, '파트너인지 모를 때는 튕기지 않는다');
  ok(가기('#/partner/demands', 손({ agent: { id: 'a', status: 'approved' } })) === null, '파트너는 그대로 들어간다');
  ok(가기('#/partner/join', 손()) === null, '가입 화면은 파트너 문 밖이다');
  ok(가기('#/partner/join', 손({ agent: { id: 'a', status: 'pending' }, form: { jSent: 'already' } })) === null,
     "'already' 안내는 남긴다 - 왜 반영되지 않았는지 읽어야 한다");
  ok(가기('#/partner/join', 손({ agent: { id: 'a', status: 'pending' }, form: {} })) === '#/partner/verify',
     '이미 신청한 계정이 가입 화면으로 오면 자격 확인으로');
  ok(!/if\((MINE|PARTNER_ONLY) && !S\.user/.test(js) && !/h==='#\/(contact|partner\/join)' && !S\.user/.test(js),
     '로그인 가드가 S.user 를 따로 보지 않는다 - 판정은 로그인전() 한 곳');
  ok(/if\(BOOTED\) render\(\); return ok;/.test(js), '계정 확인이 늦게 끝나면 성공이든 실패든 다시 그린다 - 기다림에서 풀려나야 한다');
  ok(/\}catch\(e\)\{ if\(!S\.user\) 계정확인실패 = true; return false; \}/.test(js), '오프라인으로 계정 확인이 실패하면 표시해 둔다');
}

/* ── readAgent 를 실제로 돌린다 - '파트너 아님' 이 확정되는 것도 다시 그린다 ── */
{
  const 몸 = js.slice(js.indexOf('const agentKey = '), js.indexOf('async function saveConsent'));
  const S = { agent: null, agentKnown: false, lastRoute: '#/partner/demands' };
  let 그림 = 0;
  const 받은답 = m => ({ ok: m.status === 200, j: m.body });
  const { readAgent } = new Function('S', 'render', '받은답', 'apiFetch',
    몸 + '; return { readAgent };')(S, () => 그림++, 받은답, async () => { throw new Error('x'); });
  await readAgent({ status: 200, body: { agent: null } });
  ok(S.agentKnown === true && 그림 === 1, "모름 → '파트너 아님' 확정이면 다시 그린다(가드가 가입으로 보내게)");
  await readAgent({ status: 200, body: { agent: null } });
  ok(그림 === 1, '같은 답이 다시 오면 그리지 않는다 - 가입 양식을 적는 중에 흔들지 않는다');
  await readAgent({ status: 200, body: { agent: { id: 'a1' } } });
  ok(그림 === 2, '파트너가 되면 다시 그린다');
  await readAgent();
  ok(S.agent === null && S.agentKnown === false, "못 물었으면(통신 실패) '모름' 으로 둔다 - '아님' 으로 단정하면 파트너가 가입으로 튕긴다");
  ok(/S\.agent=null; S\.agentKnown=false;/.test(js), '로그아웃 때 확인 여부도 지운다');
  ok(/S\.agentKnown = false; readAgent\(\);/.test(js), '가입이 끝나면 파트너 정보를 다시 받는다 - 완료 화면 단추가 가입으로 튕기지 않게');
  ok(!/data-go="#\/partner\/demands"[^>]*>먼저 둘러보기/.test(js), '안내 화면에서 파트너 아닌 분을 수요 목록으로 보내지 않는다');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
