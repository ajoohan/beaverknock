/* 운영자·중개사 대시보드 (2026-10-29 · 대표님 시안: 왼쪽 보라 세로 메뉴 · 인사말 · 아이콘 카드 · 선 그래프 · 오른쪽 할 일).
   ── 왜 있나 ──
   ① 선 그래프는 점 사이를 곡선으로 잇는다. 그대로 두면 0 과 2 사이에서 곡선이 바닥선 아래로 튀었다.
   ② 세로 메뉴는 넓은 화면에서만 선다. 휴대폰에서 세로 메뉴는 화면 폭을 다 먹는다 - 위 머리 + 아래 탭이다.
   ③ 대시보드는 한 화면에서 다 보여준다 - 들어오면 필요한 것을 함께 받는다. */
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const js = 길.js(), css = 길.css();

const 시작 = js.indexOf('/* ══════════ 대시보드 틀'), 끝 = js.indexOf('/* ── 중개사 왼쪽 메뉴 (PC) ──');
ok(시작 > 0 && 끝 > 시작, '대시보드 틀 모듈을 찾았다');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const M = new Function('esc', `${js.slice(시작, 끝)}\nreturn { dzLine, dzPill, dzKpi, dzHello, dzTodo, dzStatus, DZ_ICO };`)(esc);

/* ── ① 선 그래프 ── */
{
  const h = 180, 위 = 0, 아래 = h;
  const 숫자들 = svg => [...svg.matchAll(/d="([^"]+)"/g)].flatMap(m => m[1].match(/-?\d+(\.\d+)?/g).map(Number));
  const 높이들 = svg => [...svg.matchAll(/d="([^"]+)"/g)].flatMap(m => { const n = m[1].match(/-?\d+(\.\d+)?/g).map(Number); return n.filter((_, i) => i % 2); });
  const 거친 = M.dzLine([{ name:'보낸 제안', v:[0,2,0,2,0,2,0,0,2,1,0,2,0,1] }, { name:'열람', v:[0,1,0,1,0,0,0,0,1,1,0,1,0,0] }]);
  const ys = 높이들(거친);
  ok(ys.length > 20 && ys.every(y => y >= 위 && y <= 아래 - 14 + 0.01), `곡선이 바닥선 아래로도 칸 위로도 튀지 않는다 (가장 낮은 곳 ${Math.max(...ys).toFixed(1)}, 바닥 ${아래 - 14})`);
  ok(/<div class="dz-yl" aria-hidden="true"><span[^>]*>2<\/span><span[^>]*>1<\/span><span[^>]*>0<\/span><\/div>/.test(거친), '세로 눈금 숫자(최대·중간·0)가 붙는다 - 1건→2건이 크게 뛴 것처럼 보이지 않게');
  ok(/role="img" aria-label="보낸 제안 12건, 열람 5건"/.test(거친), '그래프는 낭독기에 합계를 말한다');
  const 영 = M.dzLine([{ name:'a', v:[0,0,0,0] }]);
  ok(높이들(영).every(y => Math.abs(y - (h - 14)) < 0.01) && /<span[^>]*>1<\/span><span[^>]*>0<\/span><\/div>/.test(영) && (영.match(/<span style/g) || []).length === 2,
     '값이 모두 0 이면 바닥에 깔고 눈금은 0·1 둘');
  ok(숫자들(거친).every(Number.isFinite), '경로에 NaN 이 없다');
}

/* ── 카드 · 알약 · 할 일 ── */
{
  ok(M.dzPill(3) === '<span class="dz-pill up">▲ 3</span>' && M.dzPill(-2) === '<span class="dz-pill dn">▼ 2</span>' && M.dzPill(0) === '<span class="dz-pill">= 0</span>',
     '증감 알약은 색과 함께 ▲▼ 기호와 숫자로 말한다');
  const 카드 = M.dzKpi({ ico:'users', cap:'걸린 조건', v:1234, act:'ops-tab', v2:'demand' });
  ok(/^<button type="button" class="dz-card dz-kpi" data-act="ops-tab" data-v="demand" aria-label="걸린 조건 1234">/.test(카드) && /1,234/.test(카드), '누를 수 있는 카드는 단추 · 이름과 숫자를 말한다 · 천 단위 쉼표');
  ok(/class="sk"/.test(M.dzKpi({ ico:'users', cap:'x', v:null })) && /불러오는 중/.test(M.dzKpi({ ico:'users', cap:'x', v:null, go:'#/a' })), '아직 못 받은 값은 0 이 아니라 회색 띠');
  ok(/<p class="dz-calm">손댈 일 없음<\/p>/.test(M.dzTodo([], '손댈 일 없음')) && /<span class="dz-tn num">3<\/span>/.test(M.dzTodo([{ t:'신고', n:3, go:'#/x' }])), '할 일 - 없으면 없다고, 있으면 개수');
  ok(/width:100%/.test(M.dzStatus({ t:'a', state:'b', pct:140 })) && /width:0%/.test(M.dzStatus({ t:'a', state:'b', pct:-5 })), '상태 막대는 0~100% 안에서만');
  const { 인사 } = M.dzHello('한상혁');
  ok(/^(늦은 밤이에요|좋은 아침이에요|좋은 오후예요|좋은 저녁이에요), 한상혁님$/.test(인사) && !/님/.test(M.dzHello('').인사), '인사말은 시간대별 · 이름이 없으면 이름 없이');
}

/* ── ② 넓은 화면에서만 세로 메뉴 ── */
{
  ok(/if\(!isMo\(\)\) return 파트너옆\(active\);/.test(js), '중개사 - 넓은 화면은 왼쪽 세로 메뉴, 휴대폰은 위 머리 그대로');
  ok(/body:not\(\.mo\) \.dz-scr, body:not\(\.mo\) \.scr:has\(> \.psb\)\{display:grid;grid-template-columns:200px/.test(css) && css.includes('body:not(.mo) .scr.ctx-scr:has(> .psb){grid-template-columns:180px minmax(0,1fr)}'),"세로 메뉴는 넓은 화면에만 · 폭 200px, 계약서 화면만 180px");
  /* 2026-10-29 전 화면 진단 - 보라 메뉴 위 작은 글자가 3.4~4.35:1 이었다. 흰 글자 + 옅은 면(.1~.12)으로 4.5:1 을 넘긴다 */
  ok(css.includes('.dz-tag{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.12);color:#fff}')
     && /letter-spacing:\.06em;color:rgba\(255,255,255,\.92\)\}/.test(css) && /background:rgba\(255,255,255,\.12\);color:#fff;font-variant-numeric:tabular-nums\}/.test(css)
     && /\.opsSub button\{[^}]*color:rgba\(255,255,255,\.94\)/.test(css) && /\.opsSub button\.on\{background:rgba\(255,255,255,\.1\);color:#fff;font-weight:700;box-shadow:inset 3px 0 0 #fff\}/.test(css)
     && /color:\$\{m==="dark" \? "rgba\(255,255,255,\.9\)" : sub\}">파트너/.test(js),
     '메뉴 위 작은 글자(꼬리표·묶음 이름·건수·하위 메뉴·로고 옆 파트너)는 4.5:1 을 넘는다');
  /* 단추가 너무 둥글다(2026-10-29 대표님) - 누르는 것은 각진 둥근 모서리, 알약은 상태 꼬리표에만 */
  ok(/--r-btn:10px; --r-ctl:8px;/.test(css) && /\.btn\{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var\(--r-btn\);/.test(css)
     && /\.chip\{border:1\.5px solid var\(--edge\);background:var\(--white\);color:var\(--n700\);border-radius:var\(--r-ctl\);/.test(css)
     && /\.seg\{[^}]*border-radius:var\(--r-btn\)/.test(css) && /\.seg button\{[^}]*border-radius:var\(--r-ctl\)/.test(css),
     '단추 10px · 칩·탭 단추 8px (알약 999px 아님)');
  ok(/body\.mo \.dz-more::after\{content:"";position:absolute;left:-6px;right:-6px;top:-5px;bottom:-5px\}/.test(css), "휴대폰 '전체 보기' 는 덮개로 누르는 자리를 44px 로");
  ok(/@media \(max-width:420px\)\{ body\.mo \.footlinks\{display:grid!important;grid-template-columns:repeat\(3,max-content\)/.test(css)
     && /<span class="nw">사업자등록번호 \$\{esc\(CORP\.no\)\} ·<\/span>/.test(js) && /\.nw\{white-space:nowrap\}/.test(css),
     '휴대폰 바닥 - 링크는 셋씩 두 줄, 사업자 정보는 항목마다 끊기지 않는다');
  const 운 = js.slice(js.indexOf('V[OPS_HOME] = () => {'), js.indexOf('\n};\n', js.indexOf('V[OPS_HOME] = () => {')));
  ok(/if\(isMo\(\)\) return `[\s\S]*<aside class="opsNav">\$\{메뉴\}<\/aside>/.test(운) && /<aside class="dz-side opsSide" aria-label="운영 메뉴">/.test(운),
     '운영자 - 휴대폰은 가로로 미는 메뉴, 넓은 화면은 왼쪽 보라 메뉴');
  ok(/tab === 'home' \? \(\(\) => \{ const \{ 인사, 날 \} = dzHello/.test(운) && /data-act="ops-reload">전체 새로고침/.test(운), '운영 대시보드는 인사말로 연다 · 새로고침은 머리에');
  const 옆 = js.slice(js.indexOf('function 파트너옆(active){'), js.indexOf('/* ── 중개사 대시보드 ── */'));
  ok(/\['#\/partner\/home', '대시보드', 'home', 'h'\]/.test(옆) && /\.\.\.\(own \? \[\] : \[\['#\/partner\/contracts', '계약서', 'doc', 'ct'\]\]\)/.test(옆),
     '중개사 세로 메뉴 첫 칸은 대시보드 · 계약서는 공인중개사에게만');
  ok(/aria-current="page"/.test(옆) && /\.dz-side :focus-visible\{outline:2px solid #fff/.test(css), '지금 화면은 aria-current · 보라 바탕에서 초점 테두리는 흰색');
  ok(/\[\['#\/partner\/home','홈','h'\]/.test(js) && /h:'M4 4 h7 v7 H4 Z/.test(js), '휴대폰 아래 탭 맨 앞은 홈(대시보드)');
  ok(/const 곳 = 열림 \? '#\/partner\/home' : '#\/partner\/verify';/.test(js), '자격이 열린 파트너의 입구는 대시보드');
}

/* ── ③ 들어오면 함께 받는다 ── */
{
  ok(/if\(h==='#\/partner\/home'\)\{ loadFeed\(false\); loadMyProps\(false\); loadListings\(false\); ctLoadList\(\); \}/.test(js),
     '중개사 대시보드는 수요·내 제안·내 물건·계약서를 함께 받는다');
  ok(/S\.route === '#\/partner\/home'/.test(js), '계약서 목록이 오면 대시보드도 다시 그린다');
  ok(/createdAt: x\.created_at \|\| null,/.test(js), '보낸 시각을 실어 흐름 그래프가 날마다 센다');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
