/* 매칭이 읽는 칸이 **실제로 실려 오는지** 본다.
   여태 세 번 같은 자리에서 샜다 - 입주시기 · 주택유형 · 상가 주차.
   셋 다 '대조하는 코드는 있는데 값이 안 실려 온' 것이다. 코드만 보면 되는 것처럼
   보이고, 시험용 초안(case 'submit')에는 실려 있어서 눈으로도 잘 안 잡힌다.
   그래서 이름을 맞대어 본다 - matchStages 가 읽는 m.X 는 전부 실려야 한다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';
const js = 길.html()
  .match(/<script>([\s\S]*)<\/script>/)[1];

/* 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 */
const block = (from) => {
  const i = js.indexOf('{', from);
  let dep = 0;
  for(let j = i; j < js.length; j++){
    if(js[j] === '{') dep++;
    else if(js[j] === '}'){ dep--; if(!dep) return js.slice(i, j + 1); }
  }
  throw new Error('끝을 못 찾음');
};

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

/* ── matchStages 가 읽는 것 ── */
const ms = block(js.indexOf('function matchStages(L, d){'));
/* _m 배열도 m 이라는 이름을 쓴다(_m.push 등) - 배열 메서드는 걷어낸다 */
const ARRAY = new Set(['push','map','sort','reduce','filter','forEach','length','includes','slice','join']);
const reads = [...new Set((ms.match(/\bm\.[a-zA-Z_]+/g) || []).map(s => s.slice(2)))]
  .filter(k => !ARRAY.has(k)).sort();
ok(reads.length >= 15, `matchStages 가 읽는 칸 ${reads.length}개 - ${reads.join(' ')}`);

/* ── 진짜 경로: 서버 행 → 중개사 수요 카드 ──
   ⚠ block 은 js 전체에서 센다 - 잘라낸 조각 안의 위치를 그대로 넘기면
     엉뚱한 자리를 읽는다. 처음에 그렇게 해서 '전부 빠졌다' 는 거짓말을 봤다. */
const dfrAt = js.indexOf('function demandFromRow(d){');
const real = block(js.indexOf('m:{', dfrAt));
const keysOf = s => new Set((s.match(/(^|[\s{,])([a-zA-Z_]+)\s*:/g) || [])
  .map(x => x.replace(/[\s{,:]/g, '')));
const realKeys = keysOf(real);

const 샌것 = reads.filter(k => !realKeys.has(k));
ok(샌것.length === 0,
   샌것.length ? `**demandFromRow 에서 빠진 칸: ${샌것.join(' · ')}** - 조용히 대조 안 된다`
              : 'demandFromRow 가 읽는 칸을 전부 싣는다');

/* ── 시험용 초안 경로도 같이 봐야 한다 ──
   여기만 실어두고 진짜 경로를 빠뜨리면, 시험할 때는 되는데 실제로는 안 된다. */
const sub = js.indexOf("case 'submit': {");
/* 초안은 주거·상가를 삼항으로 갈라 싣는다 - 두 덩이를 다 읽어 합집합으로 본다.
   한쪽만 읽으면 다른 쪽 칸이 통째로 '빠졌다' 고 나온다. */
/* 조건식 자체를 앵커로 삼지 않는다 - 전에 `m: d.kind===` 를 찾고 있었는데
   그 조건을 NONHOME(d.kind) 로 바꾸자 검사가 '전부 빠졌다' 고 했다.
   바뀌는 것이 아니라 **자리**(`m:` 다음 삼항)를 찾는다. */
const tern = sub + js.slice(sub).search(/\n\s*m:\s*\S/);
if(tern < sub) throw new Error("case 'submit' 안에서 m: 을 못 찾음");
const shop = block(js.indexOf('?', tern));
const home = block(js.indexOf('?', tern) + shop.length);
const draftKeys = new Set([...keysOf(shop), ...keysOf(home)]);
const 초안샌것 = reads.filter(k => !draftKeys.has(k));
ok(초안샌것.length === 0,
   초안샌것.length ? `초안 경로에서 빠진 칸: ${초안샌것.join(' · ')}`
                 : '초안 경로도 읽는 칸을 전부 싣는다');

/* ── 우선순위가 실제로 닿는가 - 표에 적힌 것은 전부 어딘가에서 add 되어야 한다 ── */
const rankHome = js.match(/\{ 주택유형:[^}]*\}/)[0];
const rankShop = js.match(/\{ 입주시기:[^}]*\}/)[0];
const names = s => [...s.matchAll(/([가-힣]+):/g)].map(m => m[1]);
const added = new Set([...ms.matchAll(/add\('([^']+)'/g)].map(m => m[1]));
/* musts 칩에서 오는 것은 mustKey 가 이름을 옮겨 준다 */
for(const k of ['주차', '반려동물']) if(/mustKey/.test(ms)) added.add(k);
for(const k of [...names(rankHome), ...names(rankShop)])
  ok(added.has(k), `'${k}' 이 실제로 확인 목록에 오른다`);

/* ── 유형이 양쪽에 다 있는가 ──
   1단계가 `L.kind === d.kind` 로 가른다. 손님은 넷(WHO)을 고르는데 중개사가
   둘만 올릴 수 있으면, 나머지 둘의 손님에게는 **맞는 물건이 영영 한 건도 없다.**
   화면은 아무 말도 안 한다 - 그냥 '맞는 물건 없음' 으로 보인다. */
const who = new Set([...js.matchAll(/^\s{2}(home|shop|office|storage):\s*\{kind:'(\w+)'/gm)].map(m => m[2]));
const lk  = new Set([...js.matchAll(/\{k:'(\w+)',t:'[^']+'\}/g)].map(m => m[1]));
ok(who.size === 4, `손님이 고르는 유형 ${who.size}가지 - ${[...who].join(' ')}`);
ok(lk.size === 4,  `중개사가 올리는 유형 ${lk.size}가지 - ${[...lk].join(' ')}`);
const 못올리는 = [...who].filter(k => !lk.has(k));
ok(못올리는.length === 0,
   못올리는.length ? `**${못올리는.join('·')} 조건은 맞는 물건이 영영 없다**` : '네 유형이 양쪽에 다 있다');
/* 유형을 글자로 되짚지 않는다 - 칩 글자만 바꿨다가 유형이 영영 안 바뀐 적이 있다 */
ok(!/v\.startsWith\('상가'\)/.test(js), '유형을 칩 글자로 되짚지 않는다');
ok(!/kind:\s*shop\s*\?\s*'shop'\s*:\s*'home'/.test(js), '고른 유형을 둘로 접어 보내지 않는다');

/* ── 지운 칸을 아직 붙잡고 있지 않은가 (0027·0028) ── */
ok(!/x\.fac_free/.test(js),    '매물의 fac_free 를 더 이상 읽지 않는다');
ok(!/L\.fac\b/.test(js),       '매물의 fac 을 더 이상 읽지 않는다');
ok(!/fac:\s*\[\]/.test(ms),    'matchStages 안에 빈 fac 이 남아 있지 않다');

console.log(ran + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
