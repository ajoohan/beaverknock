/* 동작 — 화면 코드의 조각을 **실제로 돌려 본다** (2026-10-09).
   ── 왜 있나 ──
   한글 조합 미루기 · 커서 되돌리기 · 엔터 처리기 검사는 지금까지 소스에
   특정 글자가 있는지만 봤다. 같은 글자를 남긴 채 조건 순서나 판정을 바꾸면
   검사는 통과하고 한글은 다시 끊긴다. 그래서 **소스에서 그 조각을 그대로 떼어**
   가짜 document 위에서 돌린다. 조각을 여기 다시 적으면 검사가 아니다. */
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const js = 길.js();
const 떼기 = (시작, 끝, 끝포함 = true) => {
  const i = js.indexOf(시작); if(i < 0) throw new Error('못 찾음: ' + 시작.slice(0, 40));
  const j = js.indexOf(끝, i + 시작.length); if(j < 0) throw new Error('끝 못 찾음: ' + 끝.slice(0, 40));
  return js.slice(i, 끝포함 ? j + 끝.length : j);
};

/* ── 가짜 document ── */
function 가짜문서(){
  const 귀 = {};
  return {
    귀, activeElement: null,
    addEventListener(t, f){ (귀[t] ||= []).push(f); },
    울림(t, e = {}){ (귀[t] || []).forEach(f => f(e)); },
  };
}
const 앱안 = { closest: s => s === '#app' ? {} : null };
const 입력칸 = (값 = '', 커서 = 0) => ({
  tagName: 'INPUT', value: 값, selectionStart: 커서, selectionEnd: 커서,
  closest: s => s === '#app' ? {} : null,
  setSelectionRange(a, b){ this.selectionStart = a; this.selectionEnd = b; },
});

/* ═════ ① 한글을 적는 중에는 다시 그리지 않는다 ═════ */
{
  const 적는중src = 떼기('const 적는중 = () => {', '};');
  const 문턱 = 떼기("if(IME && 적는중() && S.lastRoute === (location.hash || '#/')){", 'return; }');
  const 조합src = 떼기('var IME = false, 밀린그리기 = null, 밀린전체 = false;', '}, 0);\n});');

  const 만들기 = () => {
    const document = 가짜문서(), 타이머 = [], 셈 = { n: 0 };
    const S = { lastRoute: '#/register' }, location = { hash: '#/register' };
    const f = new Function('document', 'S', 'location', 'setTimeout', '셈', 'redrawKeepingCaret', `
      ${적는중src}
      function render(){ ${문턱} 셈.n++; }
      ${조합src}
      return { render, get IME(){ return IME; }, get 밀린(){ return 밀린전체; } };`);
    const 틀 = f(document, S, location, fn => 타이머.push(fn), 셈, () => {});
    return { document, 타이머, 셈, S, location, 틀, 흘리기: () => { while(타이머.length) 타이머.shift()(); } };
  };

  { const t = 만들기(); t.틀.render();
    ok(t.셈.n === 1, '조합 중이 아니면 바로 그린다'); }
  { const t = 만들기(); t.document.activeElement = 입력칸('미사');
    t.document.울림('compositionstart'); t.틀.render();
    ok(t.셈.n === 0 && t.틀.밀린, '조합 중이면 같은 화면 다시 그리기를 미룬다');
    t.document.울림('compositionend');
    ok(t.셈.n === 1 && !t.틀.밀린, '조합이 끝나면 미뤄 둔 그리기를 한 번 한다'); }
  { const t = 만들기(); t.document.activeElement = 입력칸('미사');
    t.document.울림('compositionstart'); t.틀.render();
    t.document.울림('focusout', { target: 앱안 });
    ok(t.셈.n === 0, '칸을 떠난 그 순간에는 아직 그리지 않는다 (새 칸을 덮지 않게)');
    t.흘리기();
    ok(t.셈.n === 1 && !t.틀.IME, 'compositionend 없이 칸을 떠나도 미뤄 둔 그리기를 한다'); }
  { const t = 만들기(); t.document.activeElement = 입력칸('미사');
    t.document.울림('compositionstart'); t.location.hash = '#/contact'; t.틀.render();
    ok(t.셈.n === 1, '화면이 바뀌는 그리기는 미루지 않는다'); }
  { const t = 만들기(); t.document.activeElement = { tagName: 'BUTTON', closest: () => ({}) };
    t.document.울림('compositionstart'); t.틀.render();
    ok(t.셈.n === 1, '입력칸에 있지 않으면(단추 등) 미루지 않는다'); }
}

/* ═════ ② 다시 그린 뒤 커서가 있던 자리 ═════ */
{
  const 적는중src = 떼기('const 적는중 = () => {', '};');
  const 잡기 = 떼기('  let 커서 = null;', '  app.innerHTML', false);
  const 놓기 = 떼기('  if(커서 && 적는중()){', '}catch(_){}\n  }');
  const f = new Function('document', 'same', '새것', `
    ${적는중src}
    ${잡기}
    document.activeElement = 새것;          /* innerHTML 로 바뀐 뒤 되돌린초점이 새 칸에 초점을 준 상태 */
    ${놓기}
    return 새것;`);
  { const document = 가짜문서(); document.activeElement = 입력칸('미사강변', 2);
    const 새것 = f(document, true, 입력칸('미사강변', 0));
    ok(새것.selectionStart === 2 && 새것.selectionEnd === 2, '다시 그린 뒤에도 커서가 2 에 있다'); }
  { const document = 가짜문서(); document.activeElement = 입력칸('미사강변', 4);
    const 새것 = f(document, true, 입력칸('미사', 0));
    ok(새것.selectionStart === 2, '글자가 줄었으면 끝으로 당긴다 (범위를 넘지 않는다)'); }
  { const document = 가짜문서(); document.activeElement = 입력칸('미사강변', 2);
    const 새것 = f(document, false, 입력칸('', 0));
    ok(새것.selectionStart === 0, '화면이 바뀌면 커서를 옮기지 않는다'); }
}

/* ═════ ③ 엔터·띄어쓰기 - 한 번만, 자기 자리에서만 ═════ */
{
  const src = 떼기("document.addEventListener('keydown', e => {\n  if(e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;", '\n});');
  const document = 가짜문서();
  new Function('document', src)(document);
  ok((document.귀.keydown || []).length === 1, '처리기 조각을 떼어 걸었다');

  /* 두 선택자를 그대로 흉내 낸다: a[tabindex="0"][role] , [tabindex="0"][role="button"] */
  const 요소 = (tag, at, 부모 = null) => ({
    tagName: tag, at, 부모, 눌림: 0,
    getAttribute(k){ return this.at[k] ?? null; }, hasAttribute(k){ return k in this.at; },
    click(){ this.눌림++; },
    closest(){ let x = this; while(x){ if(x.at.tabindex === '0' && (x.tagName === 'A' ? !!x.at.role : x.at.role === 'button')) return x; x = x.부모; } return null; },
  });
  const 누르기 = (el, key, 조합 = {}) => {
    document.activeElement = 조합.초점 || el;
    let 막음 = false;
    document.울림('keydown', { key, target: el, altKey: !!조합.alt, ctrlKey: !!조합.ctrl, metaKey: false, preventDefault(){ 막음 = true; } });
    return 막음;
  };
  { const a = 요소('A', { tabindex: '0', role: 'button' }); 누르기(a, 'Enter');
    ok(a.눌림 === 1, 'role=button 링크는 엔터로 한 번 눌린다'); }
  { const a = 요소('A', { tabindex: '0', role: 'button' }); const 막음 = 누르기(a, ' ');
    ok(a.눌림 === 1 && 막음, '띄어쓰기로도 눌리고, 화면이 내려가지 않게 막는다'); }
  { const a = 요소('A', { tabindex: '0', role: 'link' }); 누르기(a, ' ');
    ok(a.눌림 === 0, '링크는 띄어쓰기로 눌리지 않는다'); 누르기(a, 'Enter');
    ok(a.눌림 === 1, '링크는 엔터로 눌린다'); }
  { const a = 요소('A', { tabindex: '0', role: 'link', href: '/terms' }); 누르기(a, 'Enter');
    ok(a.눌림 === 0, '진짜 링크(href)는 브라우저에 맡긴다 - 두 번 눌리지 않는다'); }
  { const 카드 = 요소('DIV', { tabindex: '0', role: 'button' });
    const 속단추 = 요소('BUTTON', {}, 카드);
    누르기(속단추, 'Enter', { 초점: 속단추 });
    ok(카드.눌림 === 0, '카드 안 단추에서 친 엔터가 바깥 카드를 누르지 않는다'); }
  { const a = 요소('A', { tabindex: '0', role: 'button' }); 누르기(a, 'Enter', { ctrl: true });
    ok(a.눌림 === 0, '조합키가 눌린 엔터는 넘긴다'); }
}

console.log(`\n${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
