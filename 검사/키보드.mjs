/* 키보드로만 다니는 사람 — 마우스가 없어도 끝까지 갈 수 있는가.
   ── 왜 있나 ──
   2026-09-27 에 재 보니 **클릭은 받는데 초점은 못 받는 자리가 마흔 곳**이었다.
   `href` 없는 `<a>` 는 브라우저가 링크로 보지 않아서 Tab 이 통째로 건너뛴다 -
   바닥글의 이용 안내·자주 묻는 질문·파트너 안내·브랜드, 로그인 화면의
   아이디 찾기·비밀번호 찾기·회원가입, 로고, 뒤로 가기가 전부 거기 있었다.
   즉 **키보드만 쓰는 사람은 이 서비스의 주요 이동 경로에 닿을 수 없었다.**
   눈으로 보면 멀쩡해서, 재지 않으면 영영 모른다. */
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const js = 길.js(), css = 길.css();

/* ── ① href 없는 <a> 를 그려진 뒤에 한 번에 채운다 ──
   템플릿 마흔 곳을 손으로 고치면 반드시 빠뜨린다 - 지난 점검에서 배운 것이다. */
ok(/function 키보드로도닿게\(뿌리\)\{/.test(js), '그려진 뒤에 채우는 자리가 있다');
ok(/키보드로도닿게\(app\);/.test(js), 'render 가 매번 부른다 - 화면마다 손으로 달지 않는다');
ok(/querySelectorAll\('a\[data-go\],a\[data-act\]'\)/.test(js),
   '클릭을 받는 <a> 를 전부 훑는다');
ok(/if\(a\.hasAttribute\('href'\)\) return;/.test(js),
   '진짜 링크는 건드리지 않는다 - 이미 초점을 받는다');
ok(/setAttribute\('tabindex','0'\)/.test(js), 'Tab 이 닿게 한다');
ok(/a\.hasAttribute\('data-go'\) \? 'link' : 'button'/.test(js),
   "어디로 가는 것(data-go)은 link, 무언가를 하는 것(data-act)은 button 으로 읽힌다");
ok(/if\(!a\.hasAttribute\('tabindex'\)\)/.test(js) && /if\(!a\.hasAttribute\('role'\)\)/.test(js),
   '이미 적어 둔 것이 있으면 덮어쓰지 않는다');

/* ── ② 닿기만 하고 눌리지 않으면 반쪽이다 ──
   role 만 붙인 <a> 는 엔터를 눌러도 브라우저가 아무 일도 하지 않는다. */
const 누르기 = js.slice(js.indexOf("closest('a[tabindex=\"0\"][role]')") - 700,
                        js.indexOf("closest('a[tabindex=\"0\"][role]')") + 700);
ok(/e\.key !== 'Enter' && e\.key !== ' '/.test(누르기), '엔터와 띄어쓰기를 듣는다');
ok(/if\(e\.key !== 'Enter' && !버튼\) return;/.test(누르기),
   '링크는 띄어쓰기로 눌리지 않는다 - 링크의 약속이 그렇다');
ok(/e\.preventDefault\(\);/.test(누르기), '띄어쓰기로 화면이 내려가지 않게 막는다');
ok(/if\(e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey\) return;/.test(누르기),
   '조합키가 눌렸으면 넘긴다 - 브라우저의 제 기능을 빼앗지 않는다');
ok(/if\(!el \|\| el\.hasAttribute\('href'\)\) return;/.test(누르기),
   '진짜 링크는 브라우저가 알아서 한다 - 두 번 눌리면 안 된다');

/* ── ③ 지도는 눈으로 고르는 화면이다 ──
   길(path)이 57개다. 하나하나 초점을 주면 Tab 을 쉰일곱 번 눌러야 한다 -
   그게 더 못 쓸 화면이다. 그림은 감추고 **같은 일을 하는 목록**으로 보낸다. */
ok(/<svg class="map"[^>]*aria-hidden="true"[^>]*focusable="false"/.test(js),
   '지도 그림은 낭독기에서 감춘다 - 이름 없는 길 57개를 읽어줘도 고를 수가 없다');
ok(!/<svg class="map"[\s\S]{0,140}role="group"/.test(js),
   '감춘 그림에 역할을 남겨두지 않는다 - 감췄으면 감춘 것이다');
ok(/<p class="sr">지도는 마우스나 손가락으로 고르는 화면입니다/.test(js),
   '대신 목록이 있다고 말해 준다 - 말해 주지 않으면 없는 것과 같다');
ok(/data-act="region-view" data-v="map" aria-pressed="\$\{map\}"/.test(js)
   && /data-act="region-view" data-v="list" aria-pressed="\$\{!map\}"/.test(js),
   '지도/목록 토글이 지금 어느 쪽인지 말한다');

/* 낭독기에만 읽히는 글은 **화면 안에** 있어야 한다.
   display:none · visibility:hidden 은 낭독기에서도 사라진다 - 안 쓴 것과 같다. */
const sr = css.slice(css.indexOf('.sr{'), css.indexOf('.sr{') + 260);
ok(/position:absolute/.test(sr) && /width:1px/.test(sr) && /height:1px/.test(sr),
   '.sr 은 1px 로 접어 둔다');
ok(!/display:none/.test(sr) && !/visibility:hidden/.test(sr),
   '.sr 을 display:none 으로 감추지 않는다 - 그러면 낭독기에서도 사라진다');
ok(/clip:rect\(0 0 0 0\)/.test(sr) && /clip-path:inset\(50%\)/.test(sr),
   '옛 clip 과 새 clip-path 를 같이 둔다 - 한쪽만 쓰면 건너뛰는 낭독기가 있다');

/* ── ④ 초점을 지우지 않는다 ── */
ok(/:focus-visible\{\s*outline:2px solid var\(--ind\)/.test(css),
   '초점 테를 지우지 않는다 - 키보드로 다니는 사람에게는 이것이 유일한 단서다');
/* 초점 테를 끈 자리를 **전부 찾아** 하나씩 따진다.
   `outline:none` 자체가 나쁜 것은 아니다 - 마우스로 찍었을 때만 끄는 것은
   오히려 단정하다. 나쁜 것은 **끄고 나서 아무것도 주지 않는 것**이다.
   그래서 끈 자리마다 둘 중 하나를 요구한다:
     ① 선택자가 :not(:focus-visible) 로 마우스만 겨냥한다, 또는
     ② 같은 요소에 :focus-visible 로 테를 다시 주는 규칙이 어딘가에 있다. */
{
  const 벗긴곳 = [];
  const 규칙 = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while((m = 규칙.exec(css))){
    const 선택자 = m[1].trim(), 속 = m[2];
    if(!/outline\s*:\s*(none|0)\b/.test(속)) continue;
    if(/:not\(:focus-visible\)/.test(선택자)) continue;          /* ① 마우스만 겨냥 */
    const 이름 = (선택자.match(/\.[a-zA-Z][\w-]*/g) || []);
    const 되살림 = 이름.length &&
      이름.every(n => new RegExp(n.replace('.','\\.') + ':focus-visible').test(css));  /* ② 다시 준다 */
    if(!되살림) 벗긴곳.push(선택자.slice(0, 60));
  }
  ok(벗긴곳.length === 0,
     `초점 테를 끄고 아무것도 주지 않은 자리 ${벗긴곳.length}곳${벗긴곳.length?' - '+벗긴곳.join(' / '):''}`);
}

/* ── ⑤ 갇히지 않는다 ──
   양수 tabindex 는 순서를 통째로 헝클어뜨린다. 하나라도 있으면 나머지가 전부
   그 뒤로 밀린다 - 쓰지 않는 것이 규칙이다. */
ok(!/tabindex="[1-9]/.test(js), '양수 tabindex 를 쓰지 않는다 - 순서가 통째로 헝클어진다');
ok(/FOCUSABLE/.test(js) && /e\.key === 'Escape'/.test(js),
   '덮개(모달)는 Esc 로 닫히고 Tab 이 그 안에서 돈다');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
