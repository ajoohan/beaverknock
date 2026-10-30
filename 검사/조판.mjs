/* 조판과 칩 — 눈으로는 잘 안 보이지만 틀리면 티가 나는 것들.
   ── 왜 있나 ──
   ① 가운뎃점 붙이기(2026-09-27)는 **보이지 않는 글자**를 화면에 심는다.
      잘 돌면 아무도 모르고, 잘못 돌면 복사한 글에 유령 글자가 따라붙는다.
      눈으로 볼 수 없는 것은 재서 지켜야 한다.
   ② 칩의 표(하나만=점 / 여럿=체크)는 규칙이 두 군데에 나뉘어 있다 -
      만드는 쪽(chipsHTML)과 그리는 쪽(CSS). 한쪽만 고치면 조용히 어긋난다. */
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const js = 길.js(), css = 길.css(), html = 길.html();
const WJ = '⁠', NB = ' ';

/* ── ① 가운뎃점 규칙을 화면에서 쓰는 그대로 꺼내 돌려 본다 ──
   규칙을 여기 다시 적으면 화면이 바뀌어도 검사는 통과한다 - 그건 검사가 아니다.
   실제 소스에서 두 줄을 뽑아 같은 입력을 먹인다. */
const 규칙 = js.match(/\.replace\(\/ \+· \+\/g[\s\S]{0,400}?\);/);
ok(!!규칙, '가운뎃점 규칙이 소스에 있다');

const 붙이기 = s => s
  .replace(/ +· +/g, NB + '·' + ' ')
  .replace(/([^\s ⁠])·(?![\s⁠])/g, '$1' + WJ + '·' + WJ);

/* 소스의 두 줄과 여기 적은 두 줄이 같은지 먼저 맞춘다 */
ok(/\.replace\(\/ \+· \+\/g, NB \+ '·' \+ ' '\)/.test(js),
   '띄어 쓴 점은 앞말에 붙인다 - 소스와 검사가 같은 규칙을 본다');
ok(/\.replace\(\/\(\[\^\\s\\u00A0\\u2060\]\)·\(\?!\[\\s\\u2060\]\)\/g, '\$1' \+ WJ \+ '·' \+ WJ\)/.test(js),
   '붙은 점은 양쪽을 막는다 - 소스와 검사가 같은 규칙을 본다');

ok(붙이기('집·가게') === '집' + WJ + '·' + WJ + '가게',
   '집·가게 는 통째로 움직인다 (뒤만 막으면 점 앞에서 끊긴다)');
ok(붙이기('공인중개사 · 소유자') === '공인중개사' + NB + '· 소유자',
   '띄어 쓴 점은 앞말에 붙고, 뒤 빈칸은 끊을 자리로 남는다');
ok(붙이기('미사1·2동 · 월세') === '미사1' + WJ + '·' + WJ + '2동' + NB + '· 월세',
   '한 줄에 두 방식이 섞여도 각각 맞게 처리한다');
ok(붙이기(붙이기('집·가게')) === 붙이기('집·가게'),
   '두 번 돌려도 그대로다 - 다시 그릴 때마다 접착제가 쌓이면 안 된다');
ok(붙이기('· 앞이 비었음') === '· 앞이 비었음', '앞에 아무것도 없으면 건드리지 않는다');

/* 뒤돌아보기(lookbehind)는 못 읽는 브라우저에서 **파일 전체를 죽인다**.
   한 줄 줄이자고 쓸 자리가 아니다. */
ok(!/\(\?<[=!]/.test(js), '정규식에 뒤돌아보기를 쓰지 않는다 - 옛 사파리에서 통째로 죽는다');

/* 입력칸 안의 값은 건드리지 않는다 - 적어 넣은 글자가 바뀌면 안 된다 */
ok(/closest\('textarea'\)/.test(js), '글 적는 칸 안은 건드리지 않는다');
ok(/NodeFilter\.SHOW_TEXT/.test(js), '글자 마디만 훑는다 - 태그 속성은 손대지 않는다');

/* ── ② 나가는 문에서는 붙임을 걷는다 ──
   화면에서는 안 보이지만 복사하면 따라간다. 중개사에게 붙여넣는 글에
   유령 글자가 섞이면 검색도 안 걸리고 앱에 따라 이상한 칸으로 보인다. */
ok(/const 붙임없이 = t =>[\s\S]{0,200}u2060/.test(js), '붙임을 걷는 함수가 있다');
const 걷기 = t => String(t == null ? '' : t).replace(/⁠/g,'').replace(/ /g,' ');
ok(걷기(붙이기('집·가게 · 월세')) === '집·가게 · 월세',
   '걷고 나면 처음 글자로 돌아온다 - 복사한 글에 유령이 없다');
ok(/const txt = 붙임없이\(el\.textContent\)/.test(js),
   '복사 단추가 걷어서 넘긴다 - 여기가 글자가 밖으로 나가는 문이다');
ok(/붙임없이\(c\.textContent\)/.test(js) && /붙임없이\(sib\.textContent\)/.test(js),
   '낭독기에 읽히는 이름도 걷어서 만든다');

/* ── ③ 칩: 하나만 고르는 자리와 여럿 고르는 자리 ──
   체크표는 '이것도' 라는 뜻이다. 하나만 고르는 줄에 붙으면 여러 개를 고를 수
   있다고 말하는 셈인데, 실제로는 앞의 것이 꺼진다 - 화면이 거짓말을 한다. */
ok(/class="chips \$\{multi\?'multi':'one'\}"/.test(js),
   'chipsHTML 이 고르는 방식을 클래스로 내보낸다');
ok(/role="\$\{multi\?'group':'radiogroup'\}"/.test(js),
   '묶음의 역할도 가른다 - 낭독기는 이걸로 "하나만 고르세요" 를 안다');
ok(/aria-pressed="\$\{k\}"/.test(js) && /role="radio" aria-checked="\$\{k\}"/.test(js),
   '칩 하나하나가 **골라졌는지**를 보조기기에 말한다 (전에는 방법이 아예 없었다)');

/* ── ③-2 라디오라고 말했으면 라디오처럼 움직여야 한다 ──
   낭독기가 "라디오 단추, 3 중 2" 라고 읽으면 듣는 사람은 화살표로 옮길 수
   있다고 기대한다. 이름만 달고 동작을 안 붙이면 안 붙인 것만 못하다. */
ok(/tabindex="\$\{i===문\?0:-1\}"/.test(js),
   '라디오 묶음은 Tab 으로 한 번만 들어간다 - 고른 칸 하나만 문이다');
ok(/const 문 = multi \? -1 : Math\.max\(0, list\.findIndex\(켜짐\)\)/.test(js),
   '아직 안 골랐으면 첫 칸이 문이다 - 문이 없으면 Tab 으로 들어갈 수가 없다');
ok(/closest\('\.chips\.one > \.chip\[role="radio"\]'\)/.test(js),
   '화살표 처리기가 하나만 고르는 줄에만 걸린다 - 여럿 고르는 줄은 Tab 으로 다닌다');
ok(/\(i \+ \(앞으로 \? 1 : -1\) \+ 줄\.length\) % 줄\.length/.test(js),
   '끝에서 화살표를 더 누르면 처음으로 돌아온다');
/* 2026-10-08 바꿈: 옮기는 즉시 고르면, 고를 때 다른 칸을 비우는 칩(거래방식 → 월세,
   매물 유형 → 방 수·화장실)을 **지나가기만 해도** 적어 둔 값이 지워졌다. */
const 화살표 = js.slice(js.indexOf('하나만 고르는 칩 줄은 화살표로 옮긴다'), js.indexOf('주소 자동완성 - 손을 마우스로'));
ok(화살표.length > 200 && !/다음\.click\(\)/.test(화살표),
   '화살표는 옮기기만 한다 - 지나가기만 해도 적어 둔 값이 지워지면 안 된다');
ok(/줄\.forEach\(c => c\.setAttribute\('tabindex', c === 다음 \? '0' : '-1'\)\)/.test(화살표),
   '옮긴 칩이 문이 된다 - Tab 으로 나갔다 들어와도 그 자리다');
ok(/if\(e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey\) return;/.test(js),
   '조합키가 눌린 화살표는 넘긴다 - 브라우저의 제 기능을 빼앗지 않는다');
ok(/\.filter\(b => b\.matches\('\.chip\[role="radio"\]'\) && !b\.disabled\)/.test(js),
   '못 고르는 칸은 건너뛴다 - 입주시기처럼 지난 달이 막혀 있는 줄이 있다');

/* ── ③-3 다시 그려도 손가락이 있던 자리를 놓치지 않는다 ──
   칩 하나 고를 때마다 #app 을 통째로 다시 만든다. 그냥 두면 초점이 <body> 로
   떨어져서, 조건 등록의 칩 마흔 개를 **하나 고를 때마다 맨 위에서 다시 Tab**
   해야 한다. 키보드로는 못 쓰는 화면이 된다. */
ok(/const 잡고있던곳 = same \? 초점표\(document\.activeElement\) : null;/.test(js),
   '다시 그리기 **전에** 어디를 잡고 있었는지 적어 둔다');
ok(js.indexOf('const 잡고있던곳') < js.indexOf('app.innerHTML = html + modalHTML()'),
   '적어 두는 것이 지우는 것보다 먼저다 - 지운 뒤에는 알 방법이 없다');
ok(/되돌린초점\(app, 잡고있던곳\)/.test(js), '그린 뒤에 같은 자리를 찾아 돌려준다');
ok(/same \? 초점표/.test(js),
   '화면이 바뀌면 돌려주지 않는다 - 새 화면의 엉뚱한 자리에 붙으면 더 혼란스럽다');
ok(/const act = q\('data-act'\);\s*\n\s*if\(act\) return act \+ \(q\('data-v'\) \|\| ''\);/.test(js),
   "자리는 data-act+data-v 로 찾는다 - 새 버튼은 다른 물건이지만 **같은 일을 하는 자리**다");
ok(/CSS\.escape/.test(js), '값을 선택자에 넣을 때 이스케이프한다 - 동 이름에 따옴표가 섞일 수 있다');
ok(/되돌린초점[\s\S]{0,700}?try\{ el\.focus\(\{ preventScroll: true \}\); \}catch/.test(js),
   '초점을 돌려주면서 화면을 끌어당기지 않는다');
/* IME 를 여기서 읽으면 선언(let)보다 위라 통째로 죽는다 - 2026-09-27 에 한 번 밟았다 */
const 되돌림 = js.slice(js.indexOf('function 되돌린초점'), js.indexOf('function render()'))
  .replace(/\/\*[\s\S]*?\*\//g, '');            /* 주석은 돌지 않는다 - 거기 적힌 이름은 세지 않는다 */
ok(!/\bIME\b/.test(되돌림),
   '되돌린초점 안에서 IME 를 읽지 않는다 - 그 변수(let)보다 위에 있어서 읽으면 죽는다');

/* ── 한글을 적는 중에는 누가 불러도 다시 그리지 않는다 (2026-10-08) ──
   늦게 온 응답(readAgent · loadFeed)이 render() 를 부르면 조합이 'ㅁ' 에서 끊겼다.
   render 가 IME 를 읽으므로 그 선언은 **var** 여야 한다 - let 이면 위 줄처럼 죽는다. */
ok(/\nvar IME = false, 밀린그리기 = null, 밀린전체 = false;/.test(js) && !/\nlet IME\b/.test(js),
   'IME 상태는 var 로 둔다 - render() 가 그보다 위에서 읽는다');
const 그리기머리 = js.slice(js.indexOf('function render(){'), js.indexOf('function render(){') + 200);
ok(/if\(IME && 적는중\(\) && S\.lastRoute === \(location\.hash \|\| '#\/'\)\)\{ 밀린전체 = true; return; \}/.test(그리기머리),
   '조합 중이면 같은 화면 다시 그리기를 미룬다 (화면이 바뀌는 것은 미루지 않는다)');
ok(/else if\(밀린전체\)\{ 밀린전체 = false; render\(\); \}/.test(js), '조합이 끝나면 미뤄 둔 그리기를 한다');
ok(/a\.setSelectionRange\(Math\.min\(커서\[0\], n\), Math\.min\(커서\[1\], n\)\)/.test(js),
   '다시 그린 뒤 커서를 있던 자리에 돌려놓는다');

ok(/\.chip\.on::before\{[^}]*border-radius:var\(--r-full\)[^}]*background:currentColor/.test(css),
   '기본은 점이다 - 하나만 고르는 자리가 더 많다');
ok(/\.chips\.multi \.chip\.on::before\{[^}]*rotate\(-45deg\)/.test(css),
   '여럿 고르는 자리에만 체크표를 단다');
ok(/\.chips\.tags \.chip\.on::before\{display:none\}/.test(css),
   "지우는 표(✕)를 단 태그에는 고른 표를 또 달지 않는다 - '✓ 미사1동 ✕' 는 기호가 둘이다");

/* 색을 못 보는 분께도 표가 남아 있어야 한다 - 색만으로 말하면 안 된다 */
ok(/currentColor/.test(css.slice(css.indexOf('.chip.on::before'), css.indexOf('.chip.on::before')+400)),
   '표는 글자색을 따라간다 - 채운 칩 위에서도 보인다');

/* 여럿 고르는 자리라고 적어 둔 곳은 실제로 배열을 받는다 */
const 다중 = [...js.matchAll(/chipsHTML\(([^;]*?),\s*true\s*\)/g)].map(m => m[1]);
ok(다중.length >= 8, `여럿 고르는 칩 줄이 ${다중.length}곳`);
ok(다중.every(a => !/\|\|\s*''/.test(a)),
   "여럿 고르는 자리에 빈 문자열 기본값(|| '')을 넘기지 않는다 - 배열이어야 한다");
const 단일 = [...js.matchAll(/chipsHTML\(([^;]*?),\s*false\s*\)/g)].map(m => m[1]);
ok(단일.every(a => !/\|\|\s*\[\]/.test(a)),
   '하나만 고르는 자리에 빈 배열 기본값을 넘기지 않는다');

/* 손으로 적은 칩 줄 중 여럿 고르는 것에는 multi 가 붙어 있다 */
for(const [이름, 표시] of [['HAREA','희망 면적'], ['ASSET_KINDS','관심 유형'], ['EXCLUDE_KINDS','제외 유형']]){
  const i = js.indexOf(`\${${이름}.map`);
  ok(i > 0 && js.lastIndexOf('class="chips', i) > 0
     && /class="chips multi"/.test(js.slice(js.lastIndexOf('class="chips', i), i)),
     `${표시}(${이름})은 여럿 고르는 줄로 적혀 있다`);
}

/* ── ④ 그림씨(이모지)를 단추에 쓰지 않는다 ──
   기기마다 다른 글꼴로 그려진다. 같은 단추가 사람마다 다르게 보이면
   그건 우리가 그린 화면이 아니다. */
const 본문 = html.slice(html.lastIndexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const 그림씨 = 본문.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];
ok(그림씨.length === 0, `화면에 나가는 그림씨 ${그림씨.length}개 - 아이콘은 SVG 로 그린다`);
ok(/const ICO = \(\(\) => \{/.test(js), '지도·사진 단추의 그림을 직접 그린다(ICO)');
for(const k of ['plus','minus','reset','photo'])
  ok(new RegExp(`${k}:\\s*s\\(`).test(js), `ICO.${k} 가 있다`);

/* ── ④-2 위치는 쓰지 않는다 (2026-10-17) ──
   '현재 위치로' 단추·파트너 '사무소 근처' 가 휴대폰 위치를 물었다. 위치정보법상 신고 대상인지
   따져야 해서 통째로 걷었다 - 되살아나면 신고부터 확인해야 하니 여기서 막는다. */
{
  const 코드 = js.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/navigator\.geolocation|getCurrentPosition|watchPosition/.test(코드), '휴대폰 위치를 묻는 코드가 없다');
  ok(!/data-act="geo"/.test(코드) && !/ICO\.locate|locate:\s*s\(/.test(코드) && !/detectRegion/.test(코드), '\'현재 위치로\' 단추와 그 그림·처리가 없다');
  const 중심몸 = js.slice(js.indexOf('const 사무소중심 = addr =>'), js.indexOf('const GG_SI = ['));
  const 목록 = js.slice(js.indexOf('const SEOUL_GU = ['), js.indexOf('const 사무소중심 = addr =>'))
    + js.slice(js.indexOf('const GG_SI = ['), js.indexOf('];', js.indexOf('const GG_SI = [')) + 2);
  const 사무소중심 = new Function(`${목록}\n${중심몸}\nreturn 사무소중심;`)();
  ok(사무소중심('경기도 하남시 미사강변대로 220')?.t === '하남시' && 사무소중심('서울특별시 강남구 테헤란로 1')?.t === '강남구',
     '파트너 \'사무소 근처 n km\' 는 사무소 주소에서 시·구를 찾는다');
  ok(사무소중심('광주광역시 서구 상무대로 1') === null && 사무소중심('') === null && 사무소중심(null) === null,
     '이름이 띄어쓰기 단위로 똑같아야 맞는다 - \'광주광역시\' 가 경기 \'광주시\' 로 잡히지 않는다');
  ok(사무소중심('인천광역시 중구 운서동 1') === null && 사무소중심('부산광역시 중구 중앙대로 1') === null && 사무소중심('대구 중구 동성로 1') === null,
     '다른 시·도의 \'중구\' 는 서울 중구로 잡지 않는다(2026-10-17 리뷰)');
  ok(사무소중심('서울 중구 세종대로 110')?.t === '중구' && 사무소중심('경기 성남시 분당구 판교로 1')?.t === '성남시' && 사무소중심('하남시 미사강변대로 220')?.t === '하남시',
     '\'서울\'·\'경기\' 로 줄여 써도, 시·도 없이 시·구로 시작해도 찾는다');
  ok(사무소중심('경기도 고양시 덕양구 강서로 1')?.t === '고양시' && 사무소중심('서울특별시 강서구 공항대로 1')?.t === '강서구',
     '경기 주소의 구 이름이 서울 구로 잡히지 않는다 - 시·도 안에서만 찾는다');

  /* '5km 이내' 를 실제로 눌러 본다 (2026-10-17 리뷰 - 전에는 글자만 봤다) */
  const 처리 = (() => { const i = js.indexOf("case 'sc-km': {"); let d = 0, j = i;
    for(; j < js.length; j++){ if(js[j] === '{') d++; else if(js[j] === '}'){ d--; if(d === 0) break; } } return js.slice(i, j + 1); })();
  const 거리 = js.match(/const kmBetween = \(a, b\) =>[\s\S]*?;\n/)[0] + js.match(/const GEO_K = [^\n]*\n/)[0];
  const 눌러 = (addr, km) => { const 판 = { 알림: '', 그림: 0 };
    const S = { agent: addr === undefined ? null : { addr }, scope: { regions: ['기존'], regionsSet: false } };
    new Function('S', 'toast', 'render', 'a', 'v', `${목록}\n${중심몸}\n${거리}\nswitch(a){ ${처리} }`)(S, t => { 판.알림 = t; }, () => { 판.그림++; }, 'sc-km', km);
    return { ...판, S }; };
  const 하남 = 눌러('경기도 하남시 미사강변대로 220', '10');
  ok(하남.S.scope.regions.includes('하남시') && 하남.S.scope.regions.includes('강동구') && 하남.S.scope.regionsSet === true && 하남.그림 === 1,
     `사무소 근처 10km 를 누르면 사무소 시·구 기준으로 골라 저장할 지역으로 표시한다 (${하남.S.scope.regions.join(',')})`);
  const 인천 = 눌러('인천광역시 중구 운서동 1', '5');
  ok(인천.S.scope.regions.join() === '기존' && /직접 골라/.test(인천.알림), '주소에서 시·구를 못 찾으면 고른 지역을 건드리지 않고 직접 고르라고 한다');
  const 없음 = 눌러(undefined, '5');
  ok(없음.S.scope.regions.join() === '기존' && /직접 골라/.test(없음.알림), '파트너 정보를 아직 못 받았어도 깨지지 않는다');
  ok(/\(중심 => 중심\s*\? `사무소 주소\(\$\{esc\(중심\.t\)\}\)/.test(js), '안내 글은 기준 시·구를 한 번만 구해 쓴다');
}
ok(/aria-label="\$\{찼다 \? /.test(js), '사진 칸은 몇 번째인지까지 낭독기에 말한다');

/* ── ⑤ 누르는 것의 경계선 (2026-10-08) ──
   칩·입력칸·체크 상자는 테두리가 곧 '여기를 누르세요' 다. 개편에서 n200 으로
   낮췄더니 1.25:1 이 되어 칩이 테두리 없는 글자처럼 보였다. 3:1 을 지킨다. */
const 대비 = (a, b) => {
  const L = h => { const c = [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255)
    .map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126*c[0] + .7152*c[1] + .0722*c[2]; };
  const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
const 뿌리 = css.match(/:root\{([\s\S]*?)\n\}/)[1];
const 토큰 = k => (뿌리.match(new RegExp(`--${k}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
const 경계 = 토큰('edge');
ok(!!경계, '--edge 토큰이 있다');
for(const [바탕, 이름] of [['#FFFFFF','흰 바탕'], ['#F4F4FD','연보라 바탕(--warm 끝)'], [토큰('ind50'),'ind50 카드']])
  ok(경계 && 대비(경계, 바탕) >= 3, `경계선이 ${이름}에서 3:1 이상 (${경계 ? 대비(경계, 바탕).toFixed(2) : '-'})`);
ok(/\.chip\{border:1\.5px solid var\(--edge\)/.test(css), '칩 테두리가 --edge');
ok(/\.inp\{width:100%;border:1\.5px solid var\(--edge\)/.test(css), '입력칸 테두리가 --edge');
ok(/\.chk \.box\{[^}]*border:1\.8px solid var\(--edge\)/.test(css), '체크 상자 테두리가 --edge');
ok(!/\.chip:hover\{/.test(css) && /\.chip:not\(:disabled\):hover\{/.test(css), '꺼진 칩은 손을 올려도 반응하지 않는다');

/* ── ⑥ 약관·처리방침도 같은 색이다 ──
   개편 때 index.html 의 :root 만 바꾸고 legal-base.css 는 그대로 남아,
   약관을 누르면 예전 탁한 인디고·베이지 화면이 열렸다. 겹치는 이름은 값이 같아야 한다. */
const fs = await import('node:fs');
const 법 = fs.readFileSync(new URL('../legal-base.css', import.meta.url), 'utf8');
const 법뿌리 = 법.match(/:root\{([\s\S]*?)\}/)[1];
const 겹침 = [...법뿌리.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)];
ok(겹침.length >= 10, `legal-base.css 의 색 토큰을 읽었다 (${겹침.length}개)`);
const 어긋남 = 겹침.filter(([, k, v]) => 토큰(k) && 토큰(k).toUpperCase() !== v.toUpperCase()).map(([, k]) => k);
ok(어긋남.length === 0, `약관 화면의 색이 본 화면과 같다${어긋남.length ? ' - 다른 것: ' + 어긋남.join(', ') : ''}`);
const 메일 = fs.readFileSync(new URL('../api/_notify.js', import.meta.url), 'utf8');
ok(!/#3D3F8F|#1F1D1A|#6E6859/i.test(메일), '알림 메일에 예전 색이 남아 있지 않다');

/* 메일 글꼴은 사이트와 같은 Pretendard, 못 부르면 본고딕 계열로 (2026-10-22) - 실제로 만들어 본다 */
{
  const { notifyMany } = await import('../api/_notify.js');
  /* 환경과 요청 머리를 바꿔 가며 한 통씩 만들어 본다. 보내지는 않는다 - fetch 를 가로챈다. */
  const 기본한통 = { subject: '글꼴', rows: [['지역', '강남구']], link: '/#/inbox', cta: '보기' };
  const 만들어 = async (site, headers = {}, 한통 = 기본한통, 보내기 = notifyMany) => {
    const 옛키 = process.env.RESEND_API_KEY, 옛fetch = globalThis.fetch, 옛곳 = process.env.ALERT_SITE;
    let 본문 = null;
    process.env.RESEND_API_KEY = 'test';
    if (site === undefined) delete process.env.ALERT_SITE; else process.env.ALERT_SITE = site;
    globalThis.fetch = async (u, o) => { 본문 = JSON.parse(o.body); return { ok: true }; };
    try { await 보내기({ headers }, [한통]); }
    finally {
      globalThis.fetch = 옛fetch;
      if (옛키 === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = 옛키;
      if (옛곳 === undefined) delete process.env.ALERT_SITE; else process.env.ALERT_SITE = 옛곳;
    }
    return (본문 && 본문[0]) || {};
  };
  const 한통 = await 만들어('https://beaverknock.co.kr');
  const h = 한통.html || '';
  ok(/<!--\[if !mso\]><!--><style>@font-face\{font-family:"Pretendard Variable"[^}]*src:url\(https:\/\/beaverknock\.co\.kr\/fonts\/pretendard-variable\.woff2\)[^<]*<\/style><!--<!\[endif\]-->/.test(h),
     '메일이 사이트의 Pretendard 파일을 부르고, 그 선언은 아웃룩에서 숨긴다');
  ok(/<!--\[if mso\]><style>[^<]*font-family:'Malgun Gothic',sans-serif!important[^<]*<\/style><!\[endif\]-->/.test(h),
     '아웃룩에는 맑은 고딕을 따로 못 박는다 (Times New Roman 으로 떨어지지 않게)');
  /* 조건부 주석 안의 선언은 빼고, 글자 칸마다 붙은 목록만 센다 */
  const 칸 = h.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, '');
  const 글꼴들 = [...칸.matchAll(/font-family:([^;"]+);/g)].map(m => m[1]);
  ok(글꼴들.length === 4 && 글꼴들.every(f => /^'Pretendard Variable'.*'Apple SD Gothic Neo'.*'Noto Sans KR'.*'Malgun Gothic',sans-serif$/.test(f)),
     `메일의 바탕·표 두 칸·단추 넷 다 Pretendard → 본고딕 계열 순서다 (${글꼴들.length}곳)`);
  ok(!/font-family:-apple-system/.test(h), '예전 글꼴 목록(-apple-system 먼저)이 남아 있지 않다');

  /* 글자판은 직접 만든다 - 맡기면 <style> 속 글꼴 선언이 미리보기 첫 줄에 섞일 수 있다 */
  const t = 한통.text || '';
  ok(/^글꼴\n/.test(t) && t.includes('지역: 강남구') && t.includes('보기: https://beaverknock.co.kr/#/inbox'),
     '메일에 글자판 본문이 있고, 제목·내용·링크가 들어 있다');
  ok(!/[<>{}]|font-face/.test(t), '글자판에는 태그나 글꼴 선언이 섞이지 않는다');

  /* 빈 값은 HTML 과 같이 빈칸으로. 단추 기본 문구도 두 본문이 같은 말을 한다 */
  const 빈 = await 만들어('https://beaverknock.co.kr', {}, { subject: '빈값', rows: [['물건', undefined], ['사무소', null]], link: '/#/ops/live' });
  ok(/\n물건: \n사무소: \n/.test(빈.text || '') && !/undefined|null/.test(빈.text || ''),
     "글자판에 빈 값이 'undefined'·'null' 로 찍히지 않는다");
  ok((빈.html || '').includes('>운영 화면에서 보기</a>') && (빈.text || '').includes('\n운영 화면에서 보기: https://beaverknock.co.kr/#/ops/live\n'),
     '단추 문구를 안 주면 HTML·글자판 둘 다 같은 기본 문구를 쓴다');

  /* 메일 속 주소는 ALERT_SITE 먼저, 없으면 도메인 모양의 host 만 */
  const 주소 = m => ((m.html || '').match(/<a href="([^"]*)"/) || [])[1];
  ok(주소(await 만들어('https://beaverknock.co.kr/')) === 'https://beaverknock.co.kr/#/inbox',
     'ALERT_SITE 끝의 / 는 떼고 쓴다');
  ok(주소(await 만들어(undefined, { 'x-forwarded-host': 'beaverknock.co.kr' })) === 'https://beaverknock.co.kr/#/inbox',
     'ALERT_SITE 가 없으면 요청 host 를 쓴다');
  const 나쁜 = await 만들어(undefined, { host: 'x.com)"><script>' });
  ok(주소(나쁜) === 'https://beaverknock.co.kr/#/inbox' && !/x\.com\)/.test(나쁜.html || ''),
     'host 가 도메인 모양이 아니면 버리고 기본 주소를 쓴다 (HTML·CSS 에 그대로 넣지 않는다)');
  ok(주소(await 만들어('beaverknock.co.kr', { host: 'x.vercel.app' })) === 'https://beaverknock.co.kr/#/inbox',
     'ALERT_SITE 에 https:// 를 빼고 넣어도 받는다');
  /* 경고는 인스턴스마다 한 번이다(모듈 안의 표시). 앞의 검사들과 표시를 나눠 쓰지 않게
     모듈을 새로 불러온다 - 주소 뒤 ?꼬리 가 다르면 node 는 다른 모듈로 읽는다. */
  const { notifyMany: 새로보내기 } = await import('../api/_notify.js?경고검사');
  const 옛경고 = console.warn, 경고 = [];
  console.warn = (...a) => 경고.push(a.join(' '));
  let 버림, 또;
  try {
    버림 = 주소(await 만들어('javascript:alert(1)', { host: 'beaverknock.co.kr' }, 기본한통, 새로보내기));
    또 = 주소(await 만들어('javascript:alert(1)', { host: 'beaverknock.co.kr' }, 기본한통, 새로보내기));
  } finally { console.warn = 옛경고; }
  ok(버림 === 'https://beaverknock.co.kr/#/inbox' && 또 === 버림, 'ALERT_SITE 가 주소 모양이 아니면 쓰지 않는다');
  ok(경고.length === 1 && /ALERT_SITE/.test(경고[0]),
     `ALERT_SITE 를 버릴 때는 로그에 이유를 남기고, 같은 인스턴스에선 한 번만 남긴다 (${경고.length}번)`);
}

/* 로그인한 사람에게는 '30초 간편가입' 을 보이지 않는다 (2026-10-22) - 휴대폰·PC 두 곳 모두.
   글자 모양이 아니라 첫 화면 템플릿을 통째로 꺼내 실제로 그려 본다. 화면이 부르는 다른 이름들
   (로고·비버 그림·바닥글…)은 빈 글자를 돌려주는 가짜로 채운다 - 여기서 보는 건 문구 하나다.
   가짜는 소스에 실제로 선언된 이름에만 준다. 아무 이름에나 주면 화면 코드의 오타(없는 함수)
   까지 덮어서, 실제로는 하얀 화면인데 검사는 통과한다. */
{
  const 머리 = "V['#/'] = () => ", 시작 = html.indexOf(머리), 끝 = html.indexOf('\n</div>`;', 시작);
  const 몸 = html.slice(시작 + 머리.length, 끝 + '\n</div>`'.length);
  /* 맨 바깥(줄 맨 앞)에서 선언된 이름만 모은다. 함수 안의 짧은 지역 이름(d, r …)까지 넣으면
     첫 화면이 그 이름을 잘못 불러도 가짜로 채워져 넘어간다. 구조분해(const {a, b} =)도 넣는다. */
  const 이름 = '[A-Za-z_$가-힣][\\w$가-힣]*';
  /* 'const a = 1, b = f(x, y);' 처럼 한 줄에 여럿을 선언하면 둘째부터도 모은다.
     괄호·따옴표 안의 쉼표는 건너뛰고, 바깥 쉼표에서만 나눈다. */
  const 한줄이름들 = 줄 => {
    const 조각 = []; let 깊이 = 0, 따옴 = null, 시작 = 0;
    for (let i = 0; i < 줄.length; i++) {
      const c = 줄[i];
      if (따옴) { if (c === '\\') i++; else if (c === 따옴) 따옴 = null; continue; }
      if (c === '"' || c === "'" || c === '`') 따옴 = c;
      else if ('([{'.includes(c)) 깊이++;
      else if (')]}'.includes(c)) 깊이--;
      else if (깊이 === 0 && (c === ',' || c === ';')) { 조각.push(줄.slice(시작, i)); 시작 = i + 1; if (c === ';') break; }
    }
    if (시작 < 줄.length && 깊이 === 0 && !따옴) 조각.push(줄.slice(시작));
    return 조각.map(p => (p.trim().match(new RegExp(`^(${이름})\\s*(?:=|$)`)) || [])[1]).filter(Boolean);
  };
  const 선언 = new Set([
    ...[...js.matchAll(new RegExp(`^(?:async\\s+)?function\\s*\\*?\\s*(${이름})`, 'gm'))].map(m => m[1]),
    /* 첫 이름은 따로도 잡는다 - 줄 안의 정규식(/'/ 같은)에 나누기가 엇나가도 첫 이름은 남게 */
    ...[...js.matchAll(new RegExp(`^(?:const|let|var)\\s+(${이름})`, 'gm'))].map(m => m[1]),
    ...[...js.matchAll(/^(?:const|let|var)\s+([^\n]*)/gm)].flatMap(m => 한줄이름들(m[1])),
    ...[...js.matchAll(/^(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/gm)]
      .flatMap(m => m[1].split(',').map(s => s.replace(/^\s*\.\.\./, '').split(':').pop().split('=')[0].trim()).filter(Boolean)),
  ]);
  const 첫화면 = (mo, user) => {
    const 판 = { S: { user, agent: null }, isMo: () => mo };
    /* 불러도(빈 글자) 배열처럼 써도(빈 배열) 글자로 끼워도(빈 글자) 되는 만능 가짜 */
    const 만능 = new Proxy(() => '', {
      get: (t, k) => k === Symbol.toPrimitive ? () => ''
        : k in Array.prototype ? (k === 'join' ? () => '' : () => []) : 만능,
    });
    const 가짜 = new Proxy(판, {
      has: (o, k) => k in o || (선언.has(k) && !(k in globalThis)),
      get: (o, k) => k in o ? o[k] : (k === Symbol.unscopables ? undefined : 만능),
    });
    return new Function('판', `with(판){ return ${몸}; }`)(가짜);
  };
  let 오류 = '';
  const 결과 = [true, false].map(mo => {
    try {
      const 전 = 첫화면(mo, null), 후 = 첫화면(mo, { name: '한상혁' });
      return 전.includes('30초 간편가입</b>') && !후.includes('30초 간편가입</b>') && 후.includes('내 조건 걸어두기');
    } catch (e) { 오류 = e.message; return false; }
  });
  ok(시작 > 0 && 끝 > 시작 && 결과.every(Boolean),
     `첫 화면을 그려 보면 '30초 간편가입' 은 로그인 전에만 나온다 (휴대폰 ${결과[0] ? '맞음' : '틀림'} · PC ${결과[1] ? '맞음' : '틀림'})${오류 ? ' - ' + 오류 : ''}`);

  /* 응답 머리 - 다른 사이트가 이 화면을 틀 안에 넣지 못하게 (2026-10-22, 클릭재킹 막기) */
  const 설정 = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const 전부 = (설정.headers || []).find(h => h.source === '/(.*)');
  const 머리값 = k => ((전부 && 전부.headers) || []).find(h => h.key.toLowerCase() === k.toLowerCase())?.value;
  ok(머리값('X-Frame-Options') === 'DENY' && /frame-ancestors 'none'/.test(머리값('Content-Security-Policy') || ''),
     '모든 주소가 다른 사이트의 틀 안에 들어가는 것을 막는다 (X-Frame-Options · frame-ancestors)');
  ok(머리값('X-Content-Type-Options') === 'nosniff' && 머리값('Referrer-Policy') === 'strict-origin-when-cross-origin',
     '파일 종류 추측 금지(nosniff)와 링크 출처 제한(Referrer-Policy)도 모든 주소에 붙는다');
  /* 글자로 쓴 <iframe 만이 아니라 코드로 만드는 틀(createElement('iframe'))도 찾는다.
     본인확인 창(포트원)이 띄우는 틀은 포트원 화면을 담는 것이라 여기 해당하지 않는다 - 그건 우리 소스에 없다. */
  ok(!/<iframe|createElement\(\s*['"`]i?frame['"`]|\.innerHTML\s*[+]?=\s*['"`][^'"`]*<i?frame/i.test(html),
     '사이트 스스로도 화면을 틀 안에 넣지 않는다 - 글자로도 코드로도 (DENY 와 부딪히지 않는다)');
}

/* ── ⑦ 짙은 파트너 칸의 주 단추는 흰 단추다 ── */
ok(/if\(kind === 'onDark'\) return `<a class="btn partner"/.test(js), 'partnerDoor 가 짙은 칸용 흰 단추를 낸다');
ok(/\$\{partnerDoor\('onDark'\)\}/.test(js), '첫 화면 파트너 칸이 그 단추를 쓴다');

/* ── ⑧ 전 화면 UI 품질 개선 (2026-10-15) ──
   재서 찾은 것들이다. 숫자 하나가 되돌아가면 눈으로는 한참 뒤에야 알아챈다. */
{
  /* 아이폰은 16px 미만 입력칸을 누르면 화면을 키운 채로 둔다. 주석만 16 이고 값은 15 였다. */
  const 굵은손 = css.match(/@media \(pointer:coarse\)\{([^}]*\{[^}]*\})\s*\}/);
  ok(!!굵은손 && /\.inp, input, select, textarea\{font-size:16px!important\}/.test(굵은손[1]),
     '손가락 기기에서는 입력칸 글자가 16px 이다 (인라인 13.5px 까지 덮는다)');

  /* 마지막에 걸린 규칙이 이긴다 - 44 를 적어 두고 아래에서 40 으로 되돌리던 줄이 있었다 */
  const 마지막 = re => { const all = [...css.matchAll(re)]; return all.length ? all[all.length - 1][1] : null; };
  ok(마지막(/body\.mo \.btn\.sm\{min-height:(\d+)px\}/g) === '44', '휴대폰의 작은 버튼은 44px 이다');
  ok(마지막(/body\.mo \.btn\.door,body\.mo \.btn\.enter\{min-height:(\d+)px\}/g) === '44',
     '휴대폰 상단바 로그인 단추도 44px 이다 (뒤에서 40 으로 덮지 않는다)');

  /* 11px 은 영문 대문자 머리표·숫자 동그라미·차트 날짜 축에만 남긴다 */
  const 열하나 = (html.match(/font-size:11px/g) || []).length;
  ok(열하나 <= 6, `11px 글자는 영문 머리표·숫자 동그라미·날짜 축 여섯 곳뿐이다 (지금 ${열하나})`);
  ok(!/font-size:11px/.test(js), '화면을 그리는 코드에는 11px 글자가 없다');

  /* 파트너 상단바 - 휴대폰 한 줄에 다 들어가야 한다. 실제 함수를 돌린다. */
  const 몸 = js.match(/function navPartner\(active, 탭있음 = true\)\{[\s\S]*?\n<\/div>`;\}/);
  ok(!!몸, 'navPartner 를 찾았다');
  if(몸){
    /* 넓은 화면은 왼쪽 세로 메뉴(파트너옆, 2026-10-29)를 낸다 - 그 함수와 아이콘도 함께 꺼낸다 */
    const 아이콘 = js.slice(js.indexOf('const DZ_ICO = {'), js.indexOf('/* 인사말 - 시간에 따라'));
    const 옆 = js.slice(js.indexOf('function 파트너옆(active){'), js.indexOf('/* ── 중개사 대시보드 ── */'));
    const 그려 = (mo, 탭 = true) => new Function('isMo', 'S', 'ownerSide', 'logoLockup', 'agentBadge', 'esc', 'navAuth', '탭', 'userMenu',
      `${아이콘}\n${옆}\n${몸[0]}; return navPartner('d', 탭);`)(() => mo,
      { user: { id: 'u' }, agent: { office: '하남미사부동산', status: 'approved' } },
      () => false, () => '', () => '<span class="badge">인증됨</span>', s => s, () => '', 탭, () => '<div class="umenu">이름 메뉴</div>');
    const 폰 = 그려(true), 큰 = 그려(false), 탭없는폰 = 그려(true, false);
    ok(!폰.includes('하남미사부동산') && 폰.includes('class="umenu"') && !폰.includes('data-act="logout"'),
       '휴대폰 파트너 상단바는 사무소 이름을 빼고 이름 메뉴 하나(마이페이지·로그아웃이 그 안에)만 둔다 (2026-10-30)');
    ok(큰.includes('하남미사부동산') && 큰.includes('>마이페이지<') && 큰.includes('data-go="#/account"'),
       '넓은 화면에서는 사무소 이름과 마이페이지가 왼쪽 메뉴 아래에 있다');
    ok(탭없는폰.includes('class="umenu"') && !탭없는폰.includes('하남미사부동산'),
       '탭바를 그리지 않는 화면도 휴대폰에서 이름 메뉴로 마이페이지·로그아웃에 닿는다 (2026-10-15 리뷰)');
  }
  /* 탭바를 그리지 않는 파트너 화면은 그렇다고 말해야 하고, 그리는 화면은 기본값으로 둔다 */
  const 화면몸 = 이름 => { const i = js.indexOf(이름 + ' = '); const 끝 = js.indexOf('\nV[', i + 10); return i < 0 ? '' : js.slice(i, 끝 > 0 ? 끝 : undefined); };
  for(const 이름 of ["V['#/partner/demand']", 'V["#/partner/listing/new"]']){
    const 화면 = 화면몸(이름);
    ok(!!화면 && !/tabbar\(/.test(화면) && /navPartner\('[a-z]+', false\)/.test(화면), `${이름} 은 탭바가 없어 navPartner(…, false) 로 그린다`);
  }
  for(const 이름 of ["V['#/partner/demands']", "V['#/partner/proposals']"]){
    const 화면 = 화면몸(이름);
    ok(/tabbar\('[a-z]+','p'\)/.test(화면) && /navPartner\('[a-z]+'\)/.test(화면), `${이름} 은 탭바가 있어 기본값으로 그린다`);
  }

  /* 배지 옆 설명이 두 줄이 되면 배지까지 세로로 늘었다 */
  const 다름줄 = [...js.matchAll(/<div style="display:flex;([^"]*)"><span class="badge (?:b-warn|b-ok)" style="flex:none/g)];
  ok(다름줄.length === 4 && 다름줄.every(m => /align-items:flex-start/.test(m[1])),
     `다름·일치 배지 줄 네 곳이 위로 맞춘다 - 설명이 길어도 배지가 늘지 않는다 (${다름줄.length}곳)`);

  /* 읽음·보냄·종료 같은 '지난 것' 을 카드째 흐리게(opacity) 하면 안의 글자까지 4.5:1 아래로
     떨어진다 - 3.07~4.26 이었다. 회색 바탕으로 가른다. (준비 중인 소셜 단추는 꺼진 것이라 예외) */
  const 흐림 = [...js.matchAll(/\?'opacity:\.\d+;?'/g)].map(m => m[0]);
  ok(흐림.length === 1 && 흐림[0] === "?'opacity:.62;'", `상태를 흐림으로 가르는 곳은 '준비 중' 단추 하나뿐이다 (${흐림.join(' ')})`);

  /* 운영 목록 위 도구줄 - 거르기 줄과 동작 줄 */
  ok((js.match(/<div class="opsTools">/g) || []).length === 2, '조건관리·회원관리가 같은 도구줄 틀을 쓴다');
  ok(/body\.mo \.opsTools \.row \.inp\{flex:1 1 100%/.test(css), '휴대폰에서는 찾기 칸이 한 줄을 다 쓴다');

  /* 대시보드 날짜 축 - 사이가 점뿐이면 막대가 어느 날인지 셀 수 없다 */
  const 축 = js.match(/<div class="axis">\$\{\(\(\)=>\{([\s\S]*?)\}\)\(\)\}<\/div>/);
  ok(!!축, '날짜 축 코드를 찾았다');
  if(축){
    const 축그려 = (mo, days) => new Function('isMo', 'esc', 'days', 축[1])(() => mo, s => s, days);
    const 날 = Array.from({ length: 14 }, (_, i) => ({ mon: 10, lab: String(i + 2) }));
    const 큰축 = 축그려(false, 날), 폰축 = 축그려(true, 날);
    ok(!큰축.includes('·') && 큰축.includes('<span>10/2</span>') && 큰축.includes('<span>9</span>') && 큰축.endsWith('<span>오늘</span>'),
       '넓은 화면 축은 날마다 날짜를 달고 끝은 오늘이다');
    ok((폰축.match(/<span><\/span>/g) || []).length === 7 && 폰축.endsWith('<span>오늘</span>'), '휴대폰 축은 하루 걸러 단다');
    ok(폰축.includes('<span>10/3</span>'), '휴대폰에서도 보이는 첫 날짜에 월이 붙는다 (2026-10-15 리뷰)');
    /* 9/25 ~ 10/8 - 10월 1일(i=6)이 휴대폰에서는 건너뛰는 칸이다(끝에서 하루 걸러 보인다) */
    const 걸친 = Array.from({ length: 14 }, (_, i) => { const d = new Date(2026, 8, 25 + i); return { mon: d.getMonth() + 1, lab: String(d.getDate()) }; });
    const 폰걸친 = 축그려(true, 걸친), 큰걸친 = 축그려(false, 걸친);
    ok(폰걸친.includes('<span>9/26</span>') && 폰걸친.includes('<span>10/2</span>') && !폰걸친.includes('10/1'),
       '달이 바뀐 날이 건너뛰어져도 다음에 보이는 날짜에 새 월이 붙는다');
    ok(큰걸친.includes('<span>9/25</span>') && 큰걸친.includes('<span>10/1</span>') && 큰걸친.includes('<span>26</span>'),
       '넓은 화면은 첫날과 달이 바뀐 날에 월을 붙인다');
  }

  /* 운영 회원의 고르기 자리 - 넓히되 옆 배지를 덮지 않는다(간격 8px), 그리고 누구의 칸인지 이름이 있다 */
  const 고르기 = css.match(/\.pickhit\{[^}]*margin:([^;]+);/);
  const 여백 = 고르기 ? 고르기[1].trim().split(/\s+/).map(v => parseFloat(v)) : [];
  ok(여백.length === 4 && (44 - 18) / 2 + 여백[1] <= 8,
     `고르기 자리가 오른쪽으로 8px(옆 배지와의 간격)보다 더 나가지 않는다 (margin: ${고르기 && 고르기[1]})`);
  const 고르기칸 = [...js.matchAll(/<label class="pickhit"><input type="checkbox" data-act="ag-pick"[^>]*>/g)].map(m => m[0]);
  ok(고르기칸.length === 2 && 고르기칸.every(s => s.includes(`aria-label="\${esc(r.name||'이름 없는 신청')} 신청 고르기"`)),
     `신청 줄 고르기 칸 두 곳에 누구의 칸인지 이름이 있다 (${고르기칸.length}곳)`);
}

/* ── ⑨ 로그인 길 라벨 · 내 이름 메뉴 (2026-10-17) ──
   회색 '카카오 계정' 글자만으로는 어느 길로 들어왔는지 한눈에 안 들어왔다 - 로그인 버튼과 같은 색·표시로.
   '내 조건 확인' 은 첫 화면 메뉴(이용 안내·FAQ 옆)가 아니라 오른쪽 위 내 이름 아래로. */
{
  const 꺼내 = head => { const i = js.indexOf(head); let d = 0, j = i; for(; j < js.length; j++){ if(js[j] === '{') d++; else if(js[j] === '}'){ d--; if(d === 0) return js.slice(i, j + 1); } } return ''; };
  /* SNS(버튼의 색·표시) 부터 계정표까지 - 라벨이 버튼과 같은 값을 쓰는지 실제 코드로 본다 */
  const 표몸 = js.slice(js.indexOf('const SNS = ['), js.indexOf('\n}', js.indexOf('function 계정표(')) + 2);
  const 계정표 = new Function('esc', `${표몸}\nreturn 계정표;`)(s => String(s));
  ok(/background:#FEE500/.test(계정표('kakao')) && /카카오 계정/.test(계정표('kakao')) && /<svg/.test(계정표('kakao')),
     '카카오로 들어왔으면 카카오 노랑과 말풍선 표시로 \'카카오 계정\'');
  ok(/background:#03C75A/.test(계정표('naver')) && /background:#fff/.test(계정표('google')) && /#4285F4/.test(계정표('google')),
     '네이버는 초록, Google 은 흰 바탕에 G 표시 - 로그인 버튼과 같은 색');
  ok(/이메일 계정/.test(계정표('email')) && /var\(--n50\)/.test(계정표('email')) && 계정표('') === '',
     '이메일은 브랜드가 없으니 중립색 · 모르면 아무것도 그리지 않는다');
  ok(/\$\{계정표\(S\.user\.method\)\}/.test(js) && !/badge b-mute" style="flex:none">\$\{esc\(S\.user\.label/.test(js),
     '내 조건의 계정 카드가 회색 글자 대신 라벨을 쓴다');

  const 첫화면 = js.slice(js.indexOf("V['#/'] = () =>"), js.indexOf('<!-- 모바일: 세로'));
  ok(!/내 조건 확인/.test(첫화면) && !/data-go="#\/my"/.test(첫화면), '첫 화면 메뉴에 \'내 조건 확인\' 이 없다 - 내 이름 아래로 옮겼다');
  const 메뉴 = 꺼내('function userMenu(){');
  ok(/data-go="\$\{href\}"/.test(메뉴) && /줄\('#\/my', '내 조건'/.test(메뉴) && /줄\('#\/inbox', '받은 제안'/.test(메뉴) && /data-act="logout"/.test(메뉴),
     '내 이름 메뉴에 내 조건 · 받은 제안 · 로그아웃이 있다');
  ok(/aria-controls="umenuPop" aria-expanded="\$\{S\.umenu\?'true':'false'\}"/.test(메뉴) && /id="umenuPop"/.test(메뉴) && /\$\{계정표\(S\.user\.method\)\}/.test(메뉴),
     '메뉴 단추는 펼침 상태와 펼치는 곳을 낭독기에 알리고, 메뉴 머리에 로그인 길 라벨이 있다');
  ok(!/<[^>]*role="menu/.test(메뉴) && /aria-current="page"/.test(메뉴),
     'role="menu" 를 달지 않는다 - 화살표 키를 약속하지 않는 링크 묶음이다(2026-10-17 리뷰). 지금 화면은 aria-current 로');
  ok(/function go\(hash\)\{[\s\S]{0,200}?S\.umenu = false;\s*\n\s*if\(location\.hash === hash\) return render\(\);/.test(js),
     '같은 화면 항목을 눌러도 메뉴가 닫힌다 - go() 가 hashchange 없이 다시 그리기 전에 닫는다');
  ok(/\? userMenu\(\)/.test(js) && /return userMenu\(\);/.test(js) && /\$\{S\.user \? userMenu\(\) : navAuth\('guest'\)\}/.test(js),
     '손님 쪽 상단바 세 곳(첫 화면·손님 화면·제안 상세)이 같은 메뉴를 쓴다');
  ok(/S\.umenu = false; render\(\); opsAuto\(\);/.test(js) && /if\(!S\.umenu \|\| e\.target\.closest\('\.umenu'\)\) return;/.test(js) && /e\.key !== 'Escape' \|\| !S\.umenu/.test(js),
     '화면이 바뀌거나 바깥을 누르거나 Esc 를 누르면 닫힌다');
  ok(/\.nav:has\(\.umenu\.open\)\{z-index:70!important\}/.test(css), '펼친 메뉴가 첫 화면 본문 뒤로 깔리지 않는다(같은 층 z-index 3)');
  ok(/body\.mo \.umenu-btn/.test(css) && /\.umenu-btn\{[^}]*min-height:44px/.test(css), '메뉴 단추는 손가락 과녁 44px');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
