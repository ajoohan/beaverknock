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

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
