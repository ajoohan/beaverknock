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
    const 전 = 판.부름;
    await 판.idvPickChannel('inicis'); await 판.idvPickChannel('inicis');
    ok(판.부름 === 전, '정말 꺼져 있으면 누를 때마다 서버에 묻지 않는다');
  }
  /* need_idv 뒤 다시 받기가 실패해 끝난(30초 쉬는 중) 상태에서 통신이 돌아와 버튼을 누른다 */
  {
    const 판 = 만들기(); 판.답 = { enabled: false, live: false, channels: [] };
    await 판.idvConfig();
    판.답 = 'fail'; 판.idvMustBeLive(); await 쉼(); await 쉼();
    const 전부름 = 판.부름;
    판.답 = 실연동;                      /* 30초가 지나지 않았다 - 시각은 그대로 둔다 */
    const 고름 = await 판.idvPickChannel('inicis');
    ok(고름 && 고름.창구.key === 'k1' && 판.부름 === 전부름 + 1,
       '창구를 모르는데 묻는 중도 아니면, 누른 지금 한 번 더 묻는다 - "아직 연결되지 않았습니다" 로 30초 기다리게 하지 않는다');
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
  /* 판정 함수 셋 - 'let 계정확인실패' 부터 '로그인전' 줄 끝까지 (줄 수에 기대지 않는다) */
  const 판정시작 = js.indexOf('let 계정확인실패 = false;');
  const 판정 = js.slice(판정시작, js.indexOf('\n', js.indexOf('const 로그인전 = ', 판정시작)));
  const 시작 = js.indexOf("  const OPEN = ['#/', '#/guide'");
  const 끝 = js.indexOf('  /* 손님 조건 전문 · 제안 · 매물 등록은');
  const 길목 = js.slice(시작, 끝);
  let 가림막 = 0;
  const 가기 = (h, S, 세션 = false, 실패 = false) => {
    let 간곳 = null, 그림 = '';
    const location = { replace: x => { 간곳 = x; } };
    const $ = () => ({ set innerHTML(v){ 그림 = v; } });
    const store = { get: () => 세션 ? { access_token: 't' } : null };
    new Function('h', 'S', 'location', 'store', '$', 'bkLoader', 'keepDraft', 'consentNeeded', 'bootDone',
      `const 세션있음 = () => { const s = store.get(); return !!(s && s.access_token); };
       ${판정.replace('let 계정확인실패 = false;', `let 계정확인실패 = ${실패};`)}
       ${길목}\nreturn;`)(h, S, location, store, $, () => '<i>loader</i>', () => {}, () => !!S.needConsent, () => { 가림막++; });
    return 간곳 || (그림 ? '기다림' : null);
  };
  const 손 = (o = {}) => ({ user: { id: 'u' }, agent: null, agentKnown: true, form: {}, ...o });
  ok(가기('#/partner/demands', 손({ user: null })) === '#/login', '로그인 전이면 로그인으로');
  가림막 = 0;
  ok(가기('#/partner/demands', 손({ user: null, agentKnown: false }), true) === '기다림',
     '세션은 있는데 계정을 읽는 중이면(느린 통신) 튕기지 않고 기다린다');
  ok(가림막 === 1, '기다림 화면도 가림막을 걷는다 - 돌아오는 길에서는 boot 가 걷지 않는다(BOOTED 가 서야 다시 그린다)');
  /* 휴대폰 본인확인은 페이지째 돌아온다 - 그 길에도 계정을 읽어야 기다림에서 풀려난다 */
  {
    const boot = js.slice(js.indexOf('(function boot(){'));
    ok(/if\(readIdvRedirect\(\(\) => \(store\.get\(\) \? hydrate\(\)\.catch\(\(\) => false\) : Promise\.resolve\(false\)\)\s*\.then\(\(\) => 계정다시그리기\(\)\)\)\) return;/.test(boot),
       '본인확인에서 돌아오는 길에도 계정을 읽고, 읽고 나면 다시 그린다');
    ok(!/readAuthRedirect\(\) \|\| readIdvRedirect\(\)/.test(boot), '본인확인 복귀가 계정 읽기 없이 끝나지 않는다');
    /* 결과는 계정 읽기(세션 갱신)가 끝난 뒤에 묻는다 - 실제로 돌려 순서를 본다 */
    const 몸 = 함수('function readIdvRedirect(먼저읽기){');
    const 순서 = [];
    let 끝내기;
    const 판 = { hash: '' };
    const f = new Function('location', 'history', 'URLSearchParams', 'idvFor', 'sessionStorage', 'S', 'IDV_FORM', 'IDV_KEEP', 'blankDraft', 'idvFinish',
      `${몸}; return readIdvRedirect;`);
    const 읽기 = f({ search: '?identityVerificationId=bk-1', pathname: '/', set hash(v){ 판.hash = v; } },
      { replaceState(){} }, URLSearchParams, { get: () => 'partner' },
      { getItem: () => null, removeItem(){} }, { form: {} }, 'f', 'k', () => ({}), id => 순서.push('확인 ' + id));
    const 돌아옴 = 읽기(() => new Promise(r => { 끝내기 = () => { 순서.push('계정 읽음'); r(); }; }));
    await new Promise(r => setTimeout(r, 0));
    ok(돌아옴 === true && 판.hash === '#/partner/join' && 순서.length === 0,
       '계정을 다 읽기 전에는 본인확인 결과를 묻지 않는다 - 만료된 열쇠로 물으면 성공한 인증을 실패로 알린다');
    끝내기(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    ok(순서.join(' → ') === '계정 읽음 → 확인 bk-1', `계정을 읽은 뒤에 결과를 묻는다 (${순서.join(' → ')})`);
  }
  /* 같은 판정이 손님 화면에도 - 전에는 파트너 화면에만 있었다 */
  ok(가기('#/agree', 손({ user: null }), true) === '기다림', '동의 화면도 계정을 읽는 동안은 로그인으로 보내지 않는다');
  ok(가기('#/agree', 손({ user: null }), false) === '#/login', '동의 화면은 로그인 전이면 로그인으로');
  ok(가기('#/kind', 손({ needConsent: true })) === '#/agree', '동의를 안 받은 계정은 동의 화면으로(가드 순서가 바뀌어도 그대로)');
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
  ok(/hydrate\(\)\.then\(ok => \{ 계정다시그리기\(\); return ok; \}\)/.test(js), '계정 확인이 늦게 끝나면 계정다시그리기 가 정한다');
  ok(/S\.lastRoute = h;\n  그린계정 = 지금계정\(\);/.test(js), '그릴 때마다 누구로 그렸는지 적어 둔다');
  /* 계정다시그리기 · 'online' 다시 확인을 실제로 돌린다 */
  {
    const 몸 = js.slice(js.indexOf('let 그린계정 = '), js.indexOf('const waitingFor = '));
    const 만들기 = (o = {}) => {
      const 판 = { S: { user: null, afterLogin: null, lastRoute: '#/', ...o.S }, 그림: 0, 확인: 0, 세션: true,
                  hash: o.hash || '#/', 결과: o.결과 ?? true, 손: null };
      const location = { get hash(){ return 판.hash; }, replace: x => { 판.hash = x; 판.간곳 = x; } };
      const hydrate = () => { 판.확인++; return new Promise(r => { 판.끝내기 = () => {
        if(판.결과 === 'throw') throw new Error('x');
        if(판.결과) 판.S.user = { id: 'u1' }; else 판.실패로(); r(판.결과); }; }); };
      const f = new Function('S', 'render', 'hydrate', 'location', 'addEventListener', '세션있음', '판', 'go',
        `let BOOTED = true; let 계정확인실패 = 판.실패 ?? true;
         ${몸}
         return { 계정다시그리기, 그렸다: () => { 그린계정 = 지금계정(); }, 실패보기: () => 계정확인실패, 실패로: () => { 계정확인실패 = true; } };`);
      판.S.lastRoute = o.S && 'lastRoute' in o.S ? o.S.lastRoute : '#/';
      Object.assign(판, f(판.S, () => { 판.그림++; }, hydrate, location, (e, fn) => { if(e === 'online') 판.손 = fn; }, () => 판.세션, 판,
        x => { 판.hash = x; 판.간곳 = x; }));
      return 판;
    };
    const 쉼 = () => new Promise(r => setTimeout(r, 0));
    {
      const 판 = 만들기(); 판.그렸다();            /* 로그아웃 모습으로 그려져 있다 */
      판.S.user = { id: 'u1' }; 판.계정다시그리기();
      ok(판.그림 === 1, '로그아웃 모습으로 그려졌는데 로그인이 확인되면 다시 그린다(상단바·동의 화면)');
      판.그렸다(); 판.계정다시그리기();
      ok(판.그림 === 1, '이미 그 계정으로 그려졌으면(readAgent 가 그렸으면) 또 그리지 않는다');
    }
    {
      const 판 = 만들기({ S: { lastRoute: null } }); 판.그렸다(); 판.계정다시그리기();
      ok(판.그림 === 1, '기다림 표시를 띄운 화면은 다시 그린다');
    }
    {
      const 판 = 만들기({ hash: '#/login', S: { afterLogin: '#/partner/demands' } });
      판.손(); 판.손();                              /* 망을 갈아타며 두 번 온다 */
      ok(판.확인 === 1, "'online' 이 연달아 와도 계정 확인은 한 번만 돈다");
      ok(판.실패보기() === false, '확인하는 동안은 다시 "확인 중" 이다');
      판.끝내기(); await 쉼(); await 쉼();
      ok(판.간곳 === '#/partner/demands' && 판.S.afterLogin === null,
         '오프라인이라 로그인 화면으로 갔던 분은 확인되면 가려던 곳으로 돌아간다');
    }
    {
      const 판 = 만들기({ hash: '#/kind' }); 판.그렸다();
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(판.그림 === 1 && !판.간곳, '공개 화면이면 그 자리에서 로그인 모습으로 한 번만 다시 그린다');
    }
    {
      /* 로그인 화면을 떠날 때 지우는 일은 render 의 규칙이 맡는다 - 통신 복귀가 또 지우면
         찾기 화면처럼 지켜야 할 자리에서까지 지워진다 */
      const 판 = 만들기({ hash: '#/find-id', S: { afterLogin: '#/partner/demands' } }); 판.그렸다();
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(!판.간곳 && 판.S.afterLogin === '#/partner/demands',
         '아이디 찾기 중에 통신이 돌아와도 가려던 곳을 지우지 않는다(찾고 나면 로그인 화면으로 돌아온다)');
    }
    {
      const 판 = 만들기({ hash: '#/login', S: { afterLogin: '#/my', pw: 'abc' } }); 판.그렸다();
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(!판.간곳 && 판.그림 === 1, '로그인 화면에서 비밀번호를 적는 중이면 화면을 빼앗지 않고 다시 그리기만 한다');
      ok(판.S.afterLogin === '#/my', '그때 가려던 곳은 남겨 둔다 - 곧 누를 로그인·계속하기 가 써야 한다');
      ok(판.S.pw === '', '적다 만 비밀번호는 지운다 - 화면이 "들어와 계십니다" 로 바뀌어 쓸 데가 없다');
    }
    {
      const 판 = 만들기({ hash: '#/login', S: { afterLogin: '#/my', authBusy: true } });
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(!판.간곳, '직접 로그인하는 중이면 그쪽에 맡긴다');
      ok(판.S.afterLogin === '#/my', '직접 로그인이 끝나면 가려던 곳으로 가야 하므로 남겨 둔다');
    }
    /* 운영 로그인 길 - 관리자 계정으로 바꿔 들어오려는 중이다 */
    {
      const 판 = 만들기({ hash: '#/login', S: { afterLogin: '#/ops/live', pw: 'admin-pass' } }); 판.그렸다();
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(판.S.pw === 'admin-pass', '운영 로그인 화면에서 적던 비밀번호는 지우지 않는다 - 양식이 그대로 보이므로');
      ok(!판.간곳 && 판.S.afterLogin === '#/ops/live', '저장돼 있던 다른 계정으로 운영 화면에 데려가지 않는다');
    }
    {
      const 판 = 만들기({ hash: '#/login', S: { afterLogin: '#/ops/live' } }); 판.그렸다();
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(!판.간곳, '적고 있지 않아도 마찬가지 - 계정을 바꾸러 온 길이다');
    }
    {
      const 판 = 만들기(); 판.그렸다();
      판.S.user = { method: 'verify', label: '본인확인', name: '한상혁', email: '' }; 판.계정다시그리기();
      ok(판.그림 === 1, "본인확인만 마친 손님(id·메일 없음)도 '로그아웃' 과 구분한다");
    }
    {
      const 판 = 만들기({ hash: '#/login', S: { afterLogin: '#/my' } }); 판.결과 = false;
      판.손(); 판.끝내기(); await 쉼(); await 쉼();
      ok(!판.간곳, '다시 확인이 실패하면 로그인 화면에 그대로 둔다');
      판.손();
      ok(판.확인 === 2, '실패한 뒤에는 다음 online 에 또 확인할 수 있다');
    }
    {
      const 판 = 만들기(); 판.실패 = false;
      const 판2 = (() => { const p = 만들기(); return p; })();
      판2.S.user = { id: 'x' }; 판2.손();
      ok(판2.확인 === 0, '이미 로그인돼 있으면 다시 확인하지 않는다');
      판2.S.user = null; 판2.세션 = false; 판2.손();
      ok(판2.확인 === 0, '저장된 세션이 없으면 다시 확인하지 않는다');
    }
  }
  ok(/\}catch\(e\)\{ if\(!S\.user\) 계정확인실패 = true; return false; \}/.test(js), '오프라인으로 계정 확인이 실패하면 표시해 둔다');
  /* 그린계정 은 render 끝에서만 적힌다. 그 전에 화면을 그리고 일찍 돌아가는 길(대기 표시 등)은
     반드시 S.lastRoute = null 을 남겨야 계정다시그리기 가 나중에 다시 그린다.
     render 안에서 #app 을 직접 채우는 곳마다 그 표시가 바로 뒤에 있는지 본다. */
  {
    const 몸 = 함수('function render(){');
    const 끝 = 몸.indexOf('  S.lastRoute = h;');
    const 앞 = 몸.slice(0, 끝);
    const 자리 = [...앞.matchAll(/\$\('#app'\)\.innerHTML\s*=/g)].map(m => m.index);
    ok(자리.length >= 2, `render 의 일찍 그리는 길을 찾았다 (${자리.length}곳)`);
    const 빠짐 = 자리.filter(i => { const 뒤 = 앞.slice(i, 앞.indexOf('return', i)); return !/S\.lastRoute = null/.test(뒤); });
    ok(빠짐.length === 0, `일찍 그리고 돌아가는 길은 모두 S.lastRoute = null 을 남긴다 (빠진 곳 ${빠짐.length})`);
    ok(/  S\.lastRoute = h;\n  그린계정 = 지금계정\(\);/.test(몸), '끝까지 그린 길은 누구로 그렸는지 적는다');
  }
  /* 로그인 뒤 이동은 한 곳 - 세 군데가 각자 적다가 '비우기만 하고 안 가는' 길이 생겼다 */
  ok((js.match(/S\.afterLogin \|\| '#\/my'/g) || []).length === 2
     && /function 로그인뒤로가기\(\)\{\s*const to = S\.afterLogin \|\| '#\/my';\s*S\.afterLogin = null;\s*go\(to\);/.test(js),
     '가려던 곳으로 가는 일은 로그인뒤로가기 한 곳에서 한다(나머지 하나는 소셜 로그인이 페이지를 떠나기 전 담아두는 자리)');
  {
    const 시작 = js.indexOf("V['#/login'] = () => {");
    const 로그인 = js.slice(시작, js.indexOf('const emailOk', 시작));
    ok(/if\(로그인됨화면\(\)\)\{/.test(로그인) && /data-act="login-continue"/.test(로그인) && /들어와 계십니다/.test(로그인),
       '이미 들어와 있으면 로그인 양식 대신 "들어와 계십니다 · 계속하기" 를 보인다');
    /* 그 조건을 실제로 돌린다 */
    const 줄 = js.slice(js.indexOf('const 로그인됨화면 = '), js.indexOf('\n', js.indexOf('const 로그인됨화면 = ')));
    const 운영 = js.slice(js.indexOf('const OPS_HOME = '), js.indexOf('\n', js.indexOf('const OPS_HOME = ')));
    const 판단 = (S, 세션 = true) => new Function('S', '세션있음', `${운영}; ${줄}; return 로그인됨화면();`)(S, () => 세션);
    const 계정 = { id: 'u1', email: 'a@b.c', method: 'email' };
    ok(판단({ user: 계정 }) === true, '계정으로 들어와 있으면 "들어와 계십니다"');
    ok(판단({ user: null }) === false, '로그인 전이면 양식');
    ok(판단({ user: { method: 'verify', name: '한상혁', email: '' } }, false) === false,
       '본인확인만 마친 손님(계정 세션 없음)은 양식을 본다 - 그래야 계정을 만든다');
    ok(판단({ user: 계정, authBusy: true }) === false, '직접 로그인하는 중이면 그 화면 그대로');
    ok(판단({ user: 계정, agBusy: true }) === false, '가입 동의를 저장하는 중이면 그 화면 그대로 - 카드가 끼어들지 않는다');
    ok(판단({ user: 계정, afterLogin: '#/ops/live' }) === false, '운영 화면으로 가는 길이면 관리자 계정으로 들어오도록 양식');
    ok(판단({ user: 계정, afterLogin: '#/partner/demands' }) === true, '다른 곳으로 가는 길이면 카드');
    ok(/case 'login-continue': 로그인뒤로가기\(\); return true;/.test(js), '계속하기 는 가려던 곳으로 잇는다');
    /* 돌아오는 방법(주소를 바꾸고 새로 읽기)은 아래 2026-10-15 묶음이 본다 - 전에는 여기서
       같은 주소로 replace 하는 줄을 그대로 요구해, 고장 난 길을 검사가 지키고 있었다 */
    ok(/data-act="logout" data-v="login"/.test(로그인), '"다른 계정으로 들어가기" 단추가 로그아웃(login)을 부른다');
  }
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

/* 운영 화면 주소는 한 곳 - 로그인 화면 예외가 같은 이름을 봐야 한다 */
ok((js.match(/'#\/ops\/live'/g) || []).length === 1 && /const OPS_HOME = '#\/ops\/live';/.test(js),
   '운영 화면 주소(#/ops/live)는 OPS_HOME 한 곳에만 적혀 있다');

/* ── 로그인 화면을 로그인하지 않고 떠나면 '가려던 곳' 을 지운다 - 그 규칙을 실제로 돌린다 ── */
{
  const 길정의 = js.slice(js.indexOf('const 로그인길 = '), js.indexOf('\n', js.indexOf('const 로그인길 = ')));
  const 규칙시작 = js.indexOf('  if(로그인길(S.lastRoute) && !로그인길(h)');
  const 규칙 = js.slice(규칙시작, js.indexOf('S.afterLogin = null;', 규칙시작) + 'S.afterLogin = null;'.length);
  const 떠나기 = (전, h, o = {}) => {
    const S = { lastRoute: 전, afterLogin: '#/ops/live', authBusy: false, ...o };
    new Function('S', 'h', `${길정의}; ${규칙}`)(S, h);
    return S.afterLogin;
  };
  ok(떠나기('#/login', '#/') === null, '운영 로그인을 열었다 그냥 나가면 운영 화면으로 가려던 기록을 지운다');
  ok(떠나기('#/login', '#/guide', { afterLogin: '#/partner/demands' }) === null, '어떤 목적지든 로그인하지 않고 나가면 지운다');
  ok(떠나기('#/login', '#/find-id') === '#/ops/live' && 떠나기('#/reset-pw', '#/login') === '#/ops/live',
     '아이디·비밀번호 찾기를 오가는 동안은 지킨다');
  ok(떠나기('#/reset-pw', '#/') === null, '찾기 화면에서 나가도 지운다');
  ok(떠나기('#/login', '#/agree', { afterLogin: '#/my' }) === '#/my', '로그인 직후 동의 화면으로 가는 길은 지킨다');
  ok(떠나기('#/login', '#/my', { afterLogin: '#/my', user: { id: 'u1' } }) === null,
     "로그인된 채 '들어와 계십니다' 에서 뒤로 가기로 나가도 지운다(목적지로 가는 길은 로그인뒤로가기 가 미리 비운다)");
  ok(/function 로그인뒤로가기\(\)\{\s*const to = S\.afterLogin \|\| '#\/my';\s*S\.afterLogin = null;\s*go\(to\);/.test(js),
     '로그인 뒤 이동은 가기 전에 기록을 비운다 - 그래서 규칙에 목적지 예외가 필요 없다');
  ok(떠나기('#/login', '#/partner', { afterLogin: '#/partner' }) === null,
     '로그인하지 않고 뒤로 가기로 원래 화면에 돌아가면(같은 주소여도) 지운다');
  ok(떠나기('#/login', '#/', { authBusy: true }) === '#/ops/live', '직접 로그인하는 중이면 지킨다');
  ok(떠나기('#/kind', '#/') === '#/ops/live', '로그인 화면이 아닌 곳끼리 오갈 때는 건드리지 않는다');
  const 렌더 = 함수('function render(){');
  ok(렌더.indexOf('if(로그인길(S.lastRoute)') > 0 && 렌더.indexOf('if(로그인길(S.lastRoute)') < 렌더.indexOf('const MINE ='),
     '가드보다 먼저 지운다 - 가드가 새 목적지를 적은 뒤에 지우면 안 된다');
}

/* ── 2026-10-13 본인확인을 마치면 '가입이 끝났습니다' 가 떴는데 신청은 보내지지 않았다 ──
   idvFinish 의 파트너 길을 실제로 돌린다. */
{
  const 몸 = 함수('async function idvFinish(id)');
  const 돌리기 = async (form, 답 = { ok: true, token: 't1', name: '한상혁', phone: '01024153437' }) => {
    const S = { form: { ...form }, draft: {}, idvBusy: false };
    const 보냄 = [];
    const f = new Function('S', 'apiFetch', 'render', 'toast', 'fmtPhone', 'idvFor', 'requestAnimationFrame', '$', 'REDUCED', 'sendAgent',
      `${몸}; return idvFinish;`);
    const idvFinish = f(S, async () => ({ ok: true, json: async () => 답 }), () => {}, () => {}, x => x,
      { get: () => 'partner' }, () => {}, () => null, () => true, x => 보냄.push(x));
    await idvFinish('bk-1');
    return { S, 보냄 };
  };
  const { S, 보냄 } = await 돌리기({ jRole: 'agent', jStep: 2 });
  ok(S.form.jStep === 2, `본인확인을 마치면 2단계('확인되었습니다 · 다음')에 머문다 (jStep ${S.form.jStep})`);
  ok(S.form.jVerified && S.form.jVerified.name === '한상혁', '확인된 이름·번호가 카드에 들어간다');
  ok(!S.form.jSent && 보냄.length === 0, '신청은 아직 보내지 않았다 - 다음(j-pass)이 보낸다');
  ok(S.idvToken === 't1', '서버로 보낼 본인확인 표를 쥐고 있다');
  const 역할없음 = await 돌리기({});
  ok(역할없음.S.form.jStep === 1, '역할을 잃었으면(드문 경우) 자격 선택으로 되돌린다');
  /* 완료 화면(3단계)은 보낸 뒤에만 - j-pass 가 3단계로 넘기며 곧바로 sendAgent 를 부른다 */
  ok(/S\.form\.jStep = 3; S\.form\.jSent = 'sending'; render\(\);\s*sendAgent\(S\.form\);/.test(js),
     '3단계로 넘어가는 길은 신청 보내기와 함께다');
  ok((js.match(/jStep:\s*S\.form\.jRole \? 3/g) || []).length === 0, '본인확인 뒤 3단계로 건너뛰는 길이 없다');
}
/* 동의 화면으로 잠깐 다녀오는 길은 가입 화면을 비우지 않는다 - 본인확인을 다시(요금도 다시) 받게 된다 */
{
  const 줄 = js.slice(js.indexOf("  if(S.lastRoute === '#/partner/join' && h !== '#/partner/join'"), js.indexOf('resetJoin();', js.indexOf("  if(S.lastRoute === '#/partner/join'")) + 'resetJoin();'.length);
  const 떠나기 = h => { let 비움 = 0; new Function('S', 'h', 'resetJoin', 줄)({ lastRoute: '#/partner/join' }, h, () => 비움++); return 비움; };
  ok(떠나기('#/agree') === 0, '가입 화면 → 동의 화면은 비우지 않는다');
  ok(떠나기('#/') === 1 && 떠나기('#/partner') === 1, '그 밖으로 떠나면 비운다');
}

/* ── 2026-10-13 손님 조건 전달: 서버가 본인확인을 요구했는데 화면은 '접수되었습니다' 에 머물렀다 ──
   saveDemand 를 실제로 돌린다. */
{
  const 지문 = js.slice(js.indexOf('const 짧은서명 = '), js.indexOf('\n', js.indexOf('const 짧은서명 = ')));
  const 몸 = 지문 + '\n' + 함수('function saveDemand(d, slotN, 자리){');
  const 돌리기 = async (답, 확인했었다 = true, o = {}) => {
    const S = {
      draft: { kind: 'apt', verified: 확인했었다, vstep: 'done', vat: '2026.10.13', name: '한', ...(o.draft || {}) },
      conds: [{ id: 'c1' }, { id: 'old' }], demands: [{ id: 'd1' }, { id: 'oldd' }],
      props: [{ id: 'p1', cond: 'c1' }, { id: 'p0', cond: 'old' }], inboxCond: 'c1', matched: 1,
      idvToken: 'tok', idv: {}, saved: true,
    };
    const 판 = { S, 간곳: null, 알림: '', 바뀜: 0, 고침: null, 보낸번호: null };
    if(o.user) S.user = o.user;
    판.보낸초안 = S.draft;
    const f = new Function('S', 'apiFetch', 'demandPayload', 'trapValue', 'FORM_T0', 'loadMine', 'render', 'toast', 'idvMustBeLive', 'go', 'console', 'regMiss', 'goFix', 'setTimeout', 'blankDraft', '세션있음',
      `${몸}; return saveDemand;`);
    const saveDemand = f(S, async (u, opt) => { 판.보낸번호 = JSON.parse(opt.body).client_req; if(o.사이) o.사이(S); return { ok: 답.ok, status: 답.status, json: async () => 답.body }; },
      () => ({ ...(o.내용 || { dep: 1 }) }), () => '', Date.now(), () => {}, () => {}, t => { 판.알림 = t; }, () => { 판.바뀜++; },
      x => { 판.간곳 = x; }, { warn(){} }, dd => { 판.빠짐본것 = dd; return o.빠짐 || null; }, m => { 판.고침 = m; }, fn => fn(),
      () => ({ kind: '', dongs: [] }), () => !!o.세션);
    saveDemand(S.draft, 5, { condId: 'c1', demandId: 'd1' });
    for(let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    return 판;
  };
  const 거절 = await 돌리기({ ok: false, status: 401, body: { need_idv: true } });
  ok(거절.간곳 === '#/contact', '서버가 본인확인을 요구하면 완료 화면에 두지 않고 연락처 화면으로 되돌린다');
  ok(거절.S.conds.map(c => c.id).join() === 'old' && 거절.S.demands.map(x => x.id).join() === 'oldd'
     && 거절.S.props.map(p => p.id).join() === 'p0',
     '먼저 그려 둔 이번 조건·수요·즉시 제안을 거둔다 - 다른 조건은 그대로');
  ok(거절.S.inboxCond === null && 거절.S.matched === 0, '완료 화면이 가리키던 것도 비운다');
  ok(거절.S.draft.kind === 'apt' && 거절.S.draft.name === '한' && 거절.S.draft.verified === false,
     '적은 조건은 그대로 두고 본인확인만 다시 받게 한다');
  ok(거절.바뀜 === 1, '본인확인이 꺼진 줄 알던 화면이면 버튼 화면으로 바꾼다(idvMustBeLive)');
  ok(/만료/.test(거절.알림), `확인했었으면 만료라고 말한다 - "${거절.알림}"`);
  const 처음부터 = await 돌리기({ ok: false, status: 401, body: { need_idv: true } }, false);
  ok(/받아야 전달됩니다/.test(처음부터.알림), `확인한 적이 없으면 받아야 한다고 말한다 - "${처음부터.알림}"`);
  const 성공 = await 돌리기({ ok: true, status: 200, body: {} });
  ok(!성공.간곳 && 성공.S.conds.length === 2, '서버가 받았으면 화면을 건드리지 않는다');
  /* 다른 거절(DB·빈도·값)도 같은 길 - 완료 화면에 남기지 않는다 */
  const 장애 = await 돌리기({ ok: false, status: 502, body: { error: 'DB에 닿지 못했습니다' } });
  ok(장애.간곳 === '#/contact' && 장애.S.conds.map(c => c.id).join() === 'old' && 장애.S.draft.verified === true,
     'DB 장애로 거절돼도 거두고 연락처 화면으로 - 본인확인은 그대로 둔다(다시 받을 필요 없다)');
  ok(/DB에 닿지 못했습니다/.test(장애.알림) && 장애.바뀜 === 0, `서버가 준 이유를 보여 준다 - "${장애.알림}"`);
  const 빠름 = await 돌리기({ ok: false, status: 429, body: { error: '너무 빠릅니다. 잠시 후 다시 시도해 주세요' } });
  ok(빠름.간곳 === '#/contact', '너무 빠르다는 거절도 되돌린다 - 다시 누르면 된다');
  /* 통신이 끊긴 경우 */
  {
    const 몸2 = 지문 + '\n' + 함수('function saveDemand(d, slotN, 자리){');
    const S = { draft: { kind: 'apt', verified: true }, conds: [{ id: 'c1' }], demands: [{ id: 'd1' }], props: [], matched: 1, inboxCond: 'c1' };
    let 간곳 = null, 알림 = '';
    new Function('S', 'apiFetch', 'demandPayload', 'trapValue', 'FORM_T0', 'loadMine', 'render', 'toast', 'idvMustBeLive', 'go', 'console',
      `${몸2}; return saveDemand;`)(S, async () => { throw new Error('offline'); }, () => ({}), () => '', 0, () => {}, () => {},
      t => { 알림 = t; }, () => {}, x => { 간곳 = x; }, { warn(){} })(S.draft, 5, { condId: 'c1', demandId: 'd1' });
    for(let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    ok(간곳 === '#/contact' && S.conds.length === 0 && /네트워크/.test(알림), '통신이 끊겨 실패해도 거두고 연락처 화면으로 되돌린다');
  }
  ok(/saveDemand\(d, slotN, \{condId: id, demandId: nd\.id\}\);/.test(js), '전달 버튼은 거둘 자리를 함께 넘긴다');
  /* 2026-10-15 리뷰: 전달은 연락처 화면에서만 하고 그 화면은 로그인해야 열린다 - '본인확인 손님'
     을 지어 넣던 길은 돌지 않았다. 걷었다. 다시 생기면 거절 때 거둘 곳이 없다. */
  {
    const 제출 = js.slice(js.indexOf("case 'submit': {"), js.indexOf("case 'detail-save'"));
    ok(!/S\.user = \{method:'verify'/.test(js) && !/임시손님/.test(js), '전달 때 본인확인 손님 자리를 지어 넣지 않는다');
    ok(/if\(S\.user && !S\.user\.name\) S\.user\.name = d\.name;/.test(제출), '계정에 이름이 없을 때만 이름을 채운다');
    const 연락처 = js.slice(js.indexOf("V['#/contact'] = "), js.indexOf('\nV[', js.indexOf("V['#/contact'] = ") + 5));
    ok(/<button[^>]*data-act="submit"/.test(연락처) && (js.match(/<button[^>]*data-act="submit"/g) || []).length === 1, '전달 단추는 연락처 화면에만 있다');
    ok(/if\(h==='#\/contact' && 로그인전\(\)\)\{/.test(js), '연락처 화면은 로그인 전이면 열리지 않는다 - 그래서 전달 때 S.user 가 늘 있다');
  }

  /* ── 2026-10-15 리뷰: 늦게 온 실패가 새로 적던 조건 화면을 빼앗았다 ── */
  {
    const 새조건 = await 돌리기({ ok: false, status: 502, body: { error: '막힘' } }, true,
      { 사이: S => { S.draft = { kind: 'shop', name: '새 조건' }; } });
    ok(새조건.간곳 === null && 새조건.S.draft.kind === 'shop', '다른 조건을 적는 중이면 화면을 옮기지 않고 그 초안도 건드리지 않는다');
    ok(새조건.S.conds.map(c => c.id).join() === 'old' && /앞서 보낸 조건은 전달되지 않았습니다/.test(새조건.알림),
       `보낸 조건은 거두고 전달되지 않았다고 알린다 - "${새조건.알림}"`);
    ok(새조건.S.보류초안 === 새조건.보낸초안, '보낸 조건은 버리지 않고 맡아 둔다 - 띠에서 이어 보낼 수 있다');
    const 빈초안 = await 돌리기({ ok: false, status: 502, body: { error: '막힘' } }, true,
      { 사이: S => { S.draft = { kind: '', dongs: [], mapLevel: 'hanam', mapView: 'list' }; } });
    ok(빈초안.간곳 === '#/contact' && 빈초안.S.draft === 빈초안.보낸초안 && !빈초안.S.보류초안,
       '새 초안에 유형이 아직 없으면(보기 상태만 바뀌었어도) 보낸 조건을 되살려 연락처 화면으로 데려간다');
    const 값없음 = await 돌리기({ ok: false, status: 400, body: { error: '지역을 하나 이상 골라주세요' } }, true,
      { 빠짐: { k: 'dongs', m: '동네를 하나 이상 선택해 주세요' }, 사이: S => { S.draft = { kind: 'office' }; } });
    ok(값없음.빠짐본것 === 값없음.보낸초안, '빠진 칸은 보낸 조건에서 찾는다 - 지금 적는 새 초안이 아니다');
    ok(값없음.간곳 === null && 값없음.고침 === null, '데려가지 않았으면 그 화면에서 칸을 찾아 깜빡이지 않는다');
    const 제자리 = await 돌리기({ ok: false, status: 400, body: {} }, true, { 빠짐: { k: 'dongs', m: '동네' } });
    ok(제자리.간곳 === '#/register' && 제자리.고침 && 제자리.고침.k === 'dongs', '같은 초안이면 전처럼 그 칸이 있는 화면으로 데려가 칸을 짚는다');
    ok(!/JSON\.stringify\(S\.draft\) === JSON\.stringify\(blankDraft\(\)\)/.test(js), '빈 초안을 초안 전체 문자열로 견주지 않는다');
  }

  /* ── 2026-10-15 리뷰: 늦게 온 '본인확인 만료' 가 새 조건을 위해 다시 받은 표까지 지웠다 ── */
  {
    const 같은표 = await 돌리기({ ok: false, status: 401, body: { need_idv: true } }, true, { 내용: { dep: 1, idv_token: 'tok' } });
    ok(같은표.S.idvToken === null && 같은표.S.idv === null, '보낸 표가 지금 표면 지운다 - 만료된 것이다');
    const 새표 = await 돌리기({ ok: false, status: 401, body: { need_idv: true } }, true,
      { 내용: { dep: 1, idv_token: 'tok' }, 사이: S => { S.draft = { kind: 'shop', verified: true }; S.idvToken = '새표'; S.idv = { name: '한' }; } });
    ok(새표.S.idvToken === '새표' && 새표.S.idv && 새표.S.draft.verified === true,
       '그 사이 다시 받은 표는 남긴다 - 새 조건이 또 거절되지 않게');
    ok(새표.보낸초안.verified === false && 새표.S.보류초안 === 새표.보낸초안, '만료된 것은 보낸 조건의 확인 표시뿐이다');
  }

  /* ── 맡아 둔 조건의 띠와 '이어서 보내기' ── */
  {
    const 띠몸 = 함수('function 보류띠(){');
    const 띠 = S => new Function('S', 'esc', 'draftTitle', `${띠몸}; return 보류띠();`)(S, s => s, d => d.제목);
    ok(띠({}) === '', '맡아 둔 조건이 없으면 띠를 그리지 않는다');
    const 그림 = 띠({ 보류초안: { 제목: '미사동 · 월세' } });
    ok(/전달되지 않은 조건이 있습니다/.test(그림) && 그림.includes('미사동 · 월세') && /data-act="draft-swap"/.test(그림),
       '띠는 무엇이 남았는지 말하고 이어 보낼 단추를 낸다');
    for(const v of ["V['#/kind'] = ", "V['#/register'] = ", "V['#/contact'] = ", "V['#/my'] = "]){
      const i = js.indexOf(v), 끝 = js.indexOf('\nV[', i + 5);
      ok(i > 0 && js.slice(i, 끝).includes('${보류띠()}'), `${v.slice(2, -4)} 화면에 띠가 있다`);
    }
    const 바꾸기 = js.slice(js.indexOf("case 'draft-swap': {"), js.indexOf('return true; }', js.indexOf("case 'draft-swap': {")) + 'return true; }'.length);
    const 돌려 = S => { const 판 = { 간곳: null }; new Function('S', 'go', 'toast', 'a', `switch(a){ ${바꾸기} }`)(S, x => { 판.간곳 = x; }, () => {}, 'draft-swap'); return 판; };
    const 앞 = { kind: 'home', 이름: '앞' }, 지금 = { kind: 'shop', 이름: '지금' };
    const S1 = { 보류초안: 앞, draft: 지금 }; const 판1 = 돌려(S1);
    ok(S1.draft === 앞 && S1.보류초안 === 지금 && 판1.간곳 === '#/contact', '바꾸면 앞 조건으로 연락처 화면에 가고, 지금 적던 것은 대신 맡는다');
    const S2 = { 보류초안: 앞, draft: { kind: '' } }; 돌려(S2);
    ok(S2.draft === 앞 && S2.보류초안 === null, '지금 초안이 비어 있으면 맡지 않는다 - 띠가 사라진다');
  }

  /* ── 2026-10-15 리뷰: 로그아웃 직후 새로 읽기가 서버 로그아웃 요청을 끊었다 ── */
  {
    const 몸 = 함수('function signOutRemote(){');
    let 옵션 = null; const 저장 = { v: { access_token: 'a' }, get(){ return this.v; }, set(x){ this.v = x; } };
    new Function('store', 'fetch', 'SB_URL', 'authHeaders', `${몸}; signOutRemote();`)(저장, (u, o) => { 옵션 = o; return Promise.resolve(); }, 'https://x', () => ({}));
    ok(옵션 && 옵션.keepalive === true && 옵션.method === 'POST', '서버 로그아웃 요청은 페이지를 떠나도 끝까지 간다(keepalive)');
    ok(저장.v === null, '브라우저의 세션은 먼저 지운다');
  }


  /* ── 변환이 그 자리에서 실패하면 되돌림을 미룬다 - submit 이 뒤이어 완료 화면으로 넘어가 덮었다 ── */
  {
    const S = { draft: { kind: 'apt' }, conds: [{ id: 'c1' }], demands: [{ id: 'd1' }], props: [], matched: 1, inboxCond: 'c1' };
    let 간곳 = null; const 예약 = [];
    new Function('S', 'apiFetch', 'demandPayload', 'trapValue', 'FORM_T0', 'loadMine', 'render', 'toast', 'idvMustBeLive', 'go', 'console', 'regMiss', 'goFix', 'setTimeout', 'blankDraft', '세션있음',
      `${몸}; return saveDemand;`)(S, async () => ({ ok: true }), () => { throw new Error('깨짐'); }, () => '', 0, () => {}, () => {},
      () => {}, () => {}, x => { 간곳 = x; }, { warn(){} }, () => null, () => {}, fn => 예약.push(fn), () => ({}), () => false)(S.draft, 5, { condId: 'c1', demandId: 'd1' });
    ok(간곳 === null && 예약.length === 1, '그 자리에서는 아무 데도 보내지 않고 되돌림을 예약한다');
    간곳 = '#/done';                     /* submit 이 완료 화면으로 넘어갔다 */
    예약[0]();
    ok(간곳 === '#/contact' && S.conds.length === 0, '예약된 되돌림이 완료 화면 뒤에 돌아 연락처 화면으로 데려간다');
  }

  /* ── 2026-10-15 리뷰: '다른 계정으로 들어가기' 가 제자리 해시 이동이라 새로 읽히지 않았다 ── */
  {
    const 나가기 = js.slice(js.indexOf("case 'logout': {"), js.indexOf("/* ── 본인확인 ── */"));
    ok(/if\(v === 'login'\)\{ history\.replaceState\(null, '', location\.pathname \+ '#\/login'\); location\.reload\(\); \}/.test(나가기),
       '다른 계정으로 들어가기는 주소를 바꾼 뒤 직접 다시 읽는다');
    ok(!/location\.replace\(location\.pathname \+ \(v === 'login'/.test(나가기), '같은 주소로 replace 하던 길은 없다');
    /* 실제 동작: 같은 문서 안에서 이 두 줄이 새로 읽기를 부르는가 */
    const 기록 = [];
    const 위치 = { pathname: '/', reload: () => 기록.push('reload'), replace: u => 기록.push('replace ' + u) };
    new Function('v', 'location', 'history', 나가기.match(/if\(v === 'login'\)[^\n]*\n\s*else[^\n]*/)[0])('login', 위치, { replaceState: (a, b, u) => 기록.push('주소 ' + u) });
    ok(기록.join() === '주소 /#/login,reload', `로그인 화면 주소로 바꾸고 새로 읽는다 (${기록.join()})`);
  }

  /* ── 같은 전달을 두 번 받지 않게 - 번호를 붙이고, 다시 누르면 같은 번호로 ── */
  {
    const 실패 = await 돌리기({ ok: false, status: 502, body: {} });
    ok(/^r[a-z0-9]{8,}$/.test(실패.보낸번호 || ''), `처음 보낼 때 전달 번호를 붙인다 (${실패.보낸번호})`);
    ok(실패.S.draft.reqId === 실패.보낸번호, '실패하면 번호를 그대로 둔다 - 다시 누르면 같은 번호로 가서 서버가 중복을 막는다');
    /* 같은 내용으로 다시 누르면 같은 번호 */
    const 처음 = await 돌리기({ ok: false, status: 502, body: {} }, true, { 내용: { dep: 80 } });
    const 다시 = await 돌리기({ ok: true, status: 200, body: { ok: true, already: true } }, true,
      { 내용: { dep: 80, idv_token: '새표', verified_at: '다른시각' }, draft: { reqId: 처음.S.draft.reqId, reqSig: 처음.S.draft.reqSig } });
    ok(다시.보낸번호 === 처음.보낸번호, '같은 조건으로 다시 누르면 같은 번호로 보낸다(본인확인을 다시 받아 표가 바뀌어도 같은 조건이다)');
    ok(!다시.간곳 && 다시.S.draft.reqId === null && 다시.S.draft.reqSig === null,
       "서버가 '이미 받았다' 고 해도 성공으로 받고 번호를 비운다 - 다음 조건은 새 번호");
    /* 고친 뒤 다시 누르면 새 번호 - 같은 번호면 서버가 고친 내용을 버린다 */
    const 고침 = await 돌리기({ ok: true, status: 201, body: { ok: true } }, true,
      { 내용: { dep: 60 }, draft: { reqId: 처음.S.draft.reqId, reqSig: 처음.S.draft.reqSig } });
    ok(고침.보낸번호 && 고침.보낸번호 !== 처음.보낸번호, `조건을 고친 뒤 다시 누르면 새 번호로 보낸다 - 고친 내용이 버려지지 않는다 (${처음.보낸번호} → ${고침.보낸번호})`);
    ok(/client_req: d\.reqId,/.test(js), '전달 내용에 번호가 실린다');
  }
  /* ── 값이 모자라 거절되면(400) 그 칸이 있는 화면으로 ── */
  {
    const 빠짐 = { k: 'dongs', m: '지역을 골라 주세요' };
    const 값오류 = await 돌리기({ ok: false, status: 400, body: { error: '지역을 골라 주세요' } }, true, { 빠짐 });
    ok(값오류.간곳 === '#/register' && 값오류.고침 === 빠짐, '빠진 칸이 있는 조건 화면으로 데려가 그 칸을 짚는다 - 연락처 화면에서는 고칠 수 없다');
    const 모름 = await 돌리기({ ok: false, status: 400, body: { error: '본문을 읽지 못했습니다' } });
    ok(모름.간곳 === '#/contact', '화면이 빠진 칸을 못 찾으면 연락처 화면으로(서버가 준 이유를 보인다)');
  }
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
