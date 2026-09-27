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
for(const k of ['locate','plus','minus','reset','photo'])
  ok(new RegExp(`${k}:\\s*s\\(`).test(js), `ICO.${k} 가 있다`);
ok(/aria-label="\$\{찼다 \? /.test(js), '사진 칸은 몇 번째인지까지 낭독기에 말한다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
