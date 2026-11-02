/* 홈 네 걸음. 데스크톱(원+선)과 모바일(한 줄 알약)이 **같은 기계**를 쓴다 -
   .steps/.run 하나로 돌고 시간표도 같은 STEP_ONE 을 본다.
   한쪽만 고치면 다 차기 전에 되감기거나, 한쪽이 영영 회색으로 남는다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';
const html = 길.html();
const js  = html.match(/<script>([\s\S]*)<\/script>/)[1];
/* style 블록이 둘이다 - 첫 번째는 글꼴 몇 줄뿐이라 .steps 가 든 쪽을 고른다 */
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map(m => m[1]).find(s => s.includes('.steps'));

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

/* ── 시간표가 한자리에 있는가 ── */
const F = +js.match(/const STEP_FILL = ([\d.]+)/)[1];
const K = +js.match(/STEP_LINK = ([\d.]+)/)[1];
ok(Math.abs((F + K) - 1.55) < 1e-9, `한 걸음 ${F}+${K}=${(F + K).toFixed(2)}초`);
/* CSS 의 전환 길이와 짝이어야 한다 - 화면만 고치고 CSS 를 두면 어긋난다.
   CSS 는 앞의 0 을 떼고 적는다(.85s) - 견줄 때 같은 모양으로 맞춘다. */
const sec = n => String(n).replace(/^0\./, '.') + 's';
ok(css.includes(`transition:transform ${sec(K)} linear`), `선 전환이 ${sec(K)} (CSS 와 짝)`);
ok(css.includes(`transform ${sec(F)} cubic-bezier`),      `원 잉크가 ${sec(F)} (CSS 와 짝)`);

/* ── 두 화면이 같은 시간표를 쓰는가 ── */
ok(js.includes('const at = +(i * STEP_ONE)'),                   '데스크톱이 STEP_ONE 을 본다');
ok(js.includes('<li class="ms" style="--d:${(i*STEP_ONE).toFixed(2)}s;--dd:calc(var(--d) + ${STEP_FILL}s)">'), '모바일이 같은 STEP_ONE 을 본다(원은 걸음마다, 선은 원이 찬 뒤에)');
ok(js.includes('class="steps mini"'),                           '모바일 줄도 .steps 다 (같은 기계)');

/* ── 되감기: 흐린 동안 시간표를 통째로 끈다 ──
   켜 둔 채로 run 을 떼면 ④ 번이 제 지연시간만큼 기다렸다 거꾸로 빠져나간다. */
const rw = css.slice(css.indexOf('.steps.rewind .no'), css.indexOf('.steps.rewind .no::after') + 60);
for(const k of ['.no', '.stt', '.sd', '.ms', '.no::before', '.link i'])
  ok(rw.includes('.steps.rewind ' + k), `되감는 동안 ${k} 의 시간표가 꺼진다`);
ok(/\.steps\.rewind\{opacity:\.\d+\}/.test(css), '되감는 동안 흐려진다');

/* ── 굵기는 건드리지 않는다 - font-weight 는 전환되지 않아 차례가 무너진다 ── */
/* 휴대폰 네 걸음 (2026-11-02 '더 고급스럽게') - 알약 2×2 대신 번호 원 넷 한 줄 */
const off = css.slice(css.indexOf('.steps.mini .ms{'), css.indexOf('}', css.indexOf('.steps.mini .ms{')));
const 글켜짐 = css.slice(css.indexOf('.steps.mini.run .ms-t{'), css.indexOf('}', css.indexOf('.steps.mini.run .ms-t{')));
ok(off.includes('font-weight:') && /\.ms-t\{[^}]*font-weight:600/.test(css), '굵기는 처음부터 고정이다');
ok(글켜짐.includes('color:var(--n900)') && !글켜짐.includes('font-weight'), '켜질 때는 글자색만 바뀐다(굵기 그대로)');
ok(/\.steps\.mini\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(css), '번호 원 넷이 같은 폭으로 한 줄 - 2×2 로 들쭉날쭉하지 않다');
ok(css.includes('.steps.mini.run .ms-on{opacity:1;transform:scale(1)}') && /\.ms-on\{[^}]*transition:transform \.7s cubic-bezier/.test(css)
   && /\.ms-seg i\{[^}]*transition:transform \.85s cubic-bezier/.test(css), `원이 ${sec(F)}, 원 사이 선이 ${sec(K)} - 데스크톱과 같은 시간표`);
ok(/\.steps\.mini\.run \.ms-n::after\{animation:msKnock /.test(css), '원이 찬 순간 노크 파동이 한 번 퍼진다');
ok(css.includes('.steps.mini.rewind{opacity:1}') && css.includes('.steps.mini.rewind .ms-on,.steps.mini.rewind .ms-seg i{opacity:0;transition:opacity .42s ease-out!important}'),
   '휴대폰은 되감을 때 줄 전체를 흐리지 않는다(깜빡임) - 칠한 층만 사라진다');

/* ── 돌리는 쪽 ── */
ok(js.includes('function stopSteps()'), '앞선 바퀴를 정리하는 자리가 있다');
ok(js.indexOf('  stopSteps();') < js.indexOf("const el = $('#app .steps')"),
   'runSteps 는 먼저 정리하고 시작한다');
ok(js.includes('setTimeout(arm, 120)'), '프레임이 안 와도 시계로 출발한다');
ok(js.includes("if(el.classList.contains('run') || el.classList.contains('rewind'))"),
   '흐려진 채 멈춰 있던 것을 처음으로 돌려놓는다');
ok(js.includes("if(REDUCED()){ el.classList.add('done','run'); return; }"),
   '움직임을 줄여달라고 하면 돌리지 않는다');
ok(js.includes('void el.offsetWidth'), '되돌린 것을 확정시키는 자리가 있다');

/* ── 가운뎃점은 뺐다 - 알약과 함께 두면 375px 한 줄을 넘는다 ── */
ok(!js.includes('ms-dot') && !css.includes('ms-dot'), '가운뎃점이 남아 있지 않다');

/* ── 한 바퀴 길이 ── */
const H = +js.match(/const STEP_HOLD = ([\d.]+)/)[1];
const R = +js.match(/STEP_REWIND = ([\d.]+)/)[1];
const ALL = 3 * (F + K) + F + 0.45 + 1.2;
ok(Math.abs(ALL - 7.0) < 1e-9, `네 걸음이 다 차는 데 ${ALL.toFixed(2)}초`);
const cyc = ALL + H + 2 * R;
ok(cyc > 8 && cyc < 13, `한 바퀴 ${cyc.toFixed(2)}초`);

console.log(ran + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
