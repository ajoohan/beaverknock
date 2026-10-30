/* 운영자·중개사 대시보드 (2026-10-29 · 대표님 시안: 왼쪽 보라 세로 메뉴 · 인사말 · 아이콘 카드 · 선 그래프 · 오른쪽 할 일).
   ── 왜 있나 ──
   ① 선 그래프는 점 사이를 곡선으로 잇는다. 그대로 두면 0 과 2 사이에서 곡선이 바닥선 아래로 튀었다.
   ② 세로 메뉴는 넓은 화면에서만 선다. 휴대폰에서 세로 메뉴는 화면 폭을 다 먹는다 - 위 머리 + 아래 탭이다.
   ③ 대시보드는 한 화면에서 다 보여준다 - 들어오면 필요한 것을 함께 받는다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const js = 길.js(), css = 길.css();

const 시작 = js.indexOf('/* ══════════ 대시보드 틀'), 끝 = js.indexOf('/* ── 중개사 왼쪽 메뉴 (PC) ──');
ok(시작 > 0 && 끝 > 시작, '대시보드 틀 모듈을 찾았다');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const M = new Function('esc', `${js.slice(시작, 끝)}\nreturn { dzLine, dzPill, dzKpi, dzNow, dzTodo, dzStatus, DZ_ICO, DZ_WX };`)(esc);

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
  /* 머리 (2026-10-30 대표님 '인사는 필요없고, 접속한 날짜 요일 시간 날씨가 나오게') */
  const 지금 = M.dzNow(new Date(2026, 9, 30, 19, 5));
  ok(지금.날 === '10월 30일 금요일' && 지금.때 === '오후 7:05' && M.dzNow(new Date(2026, 9, 31, 9, 0)).때 === '오전 9:00', '머리는 날짜·요일 · 시간(오전/오후)');
  ok(!/dzHello|좋은 저녁이에요|좋은 아침이에요/.test(js) && js.includes('<h1 class="dz-h1"><span data-dzdate>${esc(날)}</span> <span class="dz-time num" data-dzclock>')
     && js.includes('<div class="dz-now"><h1 class="dz-h1">') && !js.includes("dzNowHTML('운영 대시보드')")
     && js.includes("<div class=\"ptop\">${S.route === '#/partner/home' ? dzNowHTML() : adm경로(adm위치(S.route || ''))}")
     && js.includes("<div class=\"ptop\">${tab === 'home' ? dzNowHTML() : adm경로(") && js.includes("${isMo() ? `<div class=\"dz-head\">${dzNowHTML()}</div>` : ''}"),
     "인사말·'대시보드' 글자 없이 날짜·요일·시간, 그 오른쪽에 날씨 - 넓은 화면은 머리 줄에 올려 본문은 바로 카드부터(중개사·운영 둘 다), 휴대폰은 본문 맨 위");
  ok(['sun', 'moon', 'cloud', 'overcast', 'rain', 'snow'].every(k => M.DZ_WX[k]) && js.includes("const c = document.querySelector('#app [data-dzclock]'); if(!c) return;"),
     '날씨 아이콘 여섯(해·달·구름·흐림·비·눈) · 시계는 글자만 바꾼다(화면 전체를 다시 그리지 않는다)');
}

/* ── ② 넓은 화면에서만 세로 메뉴 ── */
{
  ok(/if\(!isMo\(\)\) return 파트너옆\(active\);/.test(js), '중개사 - 넓은 화면은 왼쪽 세로 메뉴, 휴대폰은 위 머리 그대로');
  ok(/body:not\(\.mo\) \.dz-scr, body:not\(\.mo\) \.scr:has\(> \.psb\)\{display:grid;grid-template-columns:200px/.test(css) && css.includes('body:not(.mo) .scr.ctx-scr:has(> .psb){grid-template-columns:180px minmax(0,1fr)}'),"세로 메뉴는 넓은 화면에만 · 폭 200px, 계약서 화면만 180px");
  /* 2026-10-29 전 화면 진단 - 보라 메뉴 위 작은 글자가 3.4~4.35:1 이었다. 흰 글자 + 옅은 면(.1~.12)으로 4.5:1 을 넘긴다 */
  ok(css.includes('.dz-tag{font-size:13px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.12);color:#fff}')
     && /letter-spacing:\.06em;color:rgba\(255,255,255,\.92\)\}/.test(css) && /background:rgba\(255,255,255,\.12\);color:#fff;font-variant-numeric:tabular-nums\}/.test(css)
     && /\.opsSub :is\(button,a\)\{[^}]*color:rgba\(255,255,255,\.94\)/.test(css) && css.includes('.dz-menu .opsSub :is(button,a).on{background:rgba(255,255,255,.12);color:#fff;font-weight:800}')
     && /color:\$\{m==="dark" \? "rgba\(255,255,255,\.9\)" : sub\}">파트너/.test(js),
     '메뉴 위 작은 글자(꼬리표·묶음 이름·건수·하위 메뉴·로고 옆 파트너)는 4.5:1 을 넘는다');
  /* 마감 검토(2026-10-29) - 영문 머리표·글자 화살표·옆 줄무늬는 쓰지 않는다 (브랜드 견본판만 예외) */
  {
    const 브랜드 = js.slice(js.indexOf('V["#/brand"]'), js.indexOf('\n};\n', js.indexOf('V["#/brand"]')));
    const 밖 = js.replace(브랜드, '');
    ok(!/<span class="eyebrow">/.test(밖), '제품 화면에 영문 머리표(eyebrow)가 없다');
    ok(!/>← /.test(js) && !/ →<\//.test(js) && /\.ar-l,\.ar-r\{display:inline-block;/.test(css), '이동·뒤로 표시는 글자 화살표가 아니라 그림 아이콘');
    ok(!/저장 ●/.test(js) && /<span class="dirty-dot" aria-hidden="true"><\/span>저장/.test(js), "저장할 것이 있으면 점(도형) - '●' 글자가 아니다");
    ok(!/inset 3px 0 0 (#fff|var\(--ind\))/.test(css + js) && !/border-left:2\.5px solid var\(--ind300\)/.test(css), '옆 줄무늬 강조 없음 - 상태는 바탕색으로');
  }
  /* 리뷰 3차 */
  ok(/if\(!back \|\| back === '#\/'\)\{ back = back \|\| '#\/my'; S\.기본으로들어옴 = true; \}/.test(js), "메인의 '손님 로그인'(갈 곳 = 첫 화면)으로 소셜 로그인해도 파트너는 대시보드로");
  ok(/@media \(hover:hover\)\{ \.chip\.on:not\(:disabled\):hover\{background:var\(--ind700\)/.test(css) && /@media \(hover:none\)\{ \.chip\.on:not\(:disabled\):hover\{background:var\(--ind\);/.test(css),
     '고른 칩 hover 색은 마우스 기기에만 - 터치에서는 고른 색 그대로(옅은 바탕 + 흰 글자로도 안 간다)');
  ok(!/맞는 손님 목록으로 이어집니다/.test(js) && /파트너 대시보드로 이어집니다/.test(js), '파트너 로그인 안내가 실제로 가는 곳(대시보드)을 말한다');
  ok(/^\*\.sql$/m.test(fs.readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8')), '개발용 SQL 은 배포에서 뺀다(.vercelignore)');
  /* 파트너는 로그인하면 바로 대시보드로 (2026-10-29 대표님) */
  ok(/S\.afterLogin = v === 'partner' \? '#\/partner\/home'/.test(js) && /const to = 기본 && S\.agent \? '#\/partner\/home' : \(S\.afterLogin \|\| '#\/my'\);/.test(js) && /const 기본 = !S\.afterLogin \|\| S\.afterLogin === '#\/';/.test(js)
     && /if\(지금 === '#\/my' \|\| 지금 === '#\/'\)\{ S\.기본으로들어옴 = false; if\(S\.agent\)\{ location\.replace\('#\/partner\/home'\); return; \} \}/.test(js)
     && /if\(ok && S\.기본으로들어옴 && S\.agent\) back = '#\/partner\/home';\s*S\.기본으로들어옴 = false;/.test(js) && /sessionStorage\.setItem\('bk\.after', S\.afterLogin \|\| ''\)/.test(js),
     '파트너 로그인 단추·그냥 로그인·소셜 로그인 모두, 파트너 계정이면 대시보드로 들어간다');
  ok(/'#\/partner\/home' : '#\/partner\/verify'\); return;/.test(js) && /S\.agent\.status === 'approved'\)\{\s*location\.replace\('#\/partner\/home'\)/.test(js),
     '이미 승인된 파트너가 가입·자격 화면에 오면 대시보드로');
  /* 대시보드도 덜 둥글게 */
  ok(/\.dz-card\{[^}]*border-radius:14px/.test(css) && /padding:18px 8px 12px;border-radius:16px;/.test(css) && /\.dz-ic\{[^}]*border-radius:10px/.test(css),
     '대시보드 카드 14px · 메뉴 판 16px · 아이콘 칸 10px');
  /* 단추가 너무 둥글다(2026-10-29 대표님) - 누르는 것은 각진 둥근 모서리, 알약은 상태 꼬리표에만 */
  ok(/--r-btn:10px; --r-ctl:8px;/.test(css) && /\.btn\{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var\(--r-btn\);/.test(css)
     && /\.chip\{border:1px solid var\(--edge\);background:var\(--white\);color:var\(--n700\);border-radius:var\(--r-ctl\);/.test(css)
     && /\.seg\{[^}]*border-radius:var\(--r-btn\)/.test(css) && /\.seg button\{[^}]*border-radius:var\(--r-ctl\)/.test(css),
     '단추 10px · 칩·탭 단추 8px (알약 999px 아님)');
  ok(/body\.mo \.dz-more::after\{content:"";position:absolute;left:-6px;right:-6px;top:-5px;bottom:-5px\}/.test(css), "휴대폰 '전체 보기' 는 덮개로 누르는 자리를 44px 로");
  ok(/@media \(max-width:420px\)\{ body\.mo \.footlinks\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,max-content\)\)/.test(css)
     && /<span class="nw">사업자등록번호 \$\{esc\(CORP\.no\)\} ·<\/span>/.test(js) && /\.nw\{white-space:nowrap\}/.test(css),
     '휴대폰 바닥 - 링크는 셋씩 두 줄, 사업자 정보는 항목마다 끊기지 않는다');
  const 운 = js.slice(js.indexOf('V[OPS_HOME] = () => {'), js.indexOf('\n};\n', js.indexOf('V[OPS_HOME] = () => {')));
  ok(/if\(isMo\(\)\) return `[\s\S]*<aside class="opsNav">\$\{메뉴\}<\/aside>/.test(운) && /<aside class="dz-side opsSide" aria-label="운영 메뉴">/.test(운),
     '운영자 - 휴대폰은 가로로 미는 메뉴, 넓은 화면은 왼쪽 보라 메뉴');
  ok(운.includes("${tab === 'home' ? 새로고침 : ''}") && /data-act="ops-reload">전체 새로고침/.test(운), '운영 대시보드는 날짜·요일·시간·날씨로 연다(인사말 없이) · 기준 시각·새로고침은 머리 줄 오른쪽');
  const 옆 = js.slice(js.indexOf('function 파트너옆(active){'), js.indexOf('/* ── 중개사 대시보드 ── */'));
  ok(/\['#\/partner\/home', '대시보드', 'home', 'h'\]/.test(옆) && 옆.includes("...(own ? [] : ['계약', ...CT_하위메뉴]),"),
     '중개사 세로 메뉴 첫 칸은 대시보드 · 계약서(와 그 묶음 이름)는 공인중개사에게만');
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

/* ── ④ 어드민 넓게 · 계정은 오른쪽 위 · 왼쪽 아래 사이트 가기와 버전 (2026-10-30 대표님) ── */
{
  const 옆 = js.slice(js.indexOf('function 파트너옆(active){'), js.indexOf('/* ── 중개사 대시보드 ── */'));
  const 발 = 옆.slice(옆.indexOf('<div class="dz-foot">'), 옆.indexOf('</aside>'));
  ok(발.indexOf('사이트 가기') > 0 && 발.indexOf('${버전칸()}') > 발.indexOf('사이트 가기') && !/마이페이지|로그아웃|dz-office/.test(발),
     '왼쪽 메뉴 맨 아래는 사이트 가기, 그 아래 버전과 날짜 - 마이페이지·로그아웃은 메뉴에 없다');
  ok(옆.includes("<div class=\"ptop\">${S.route === '#/partner/home' ? dzNowHTML() : adm경로(adm위치(S.route || ''))}<span class=\"ptop-r\">${agentBadge()}${S.user ? userMenu({ admin: true }) : navAuth('partner')}</span></div>")
     && js.includes("<div class=\"ptop\">${tab === 'home' ? dzNowHTML() : adm경로([['운영'], [OPS_TITLE[tab] || '운영 화면']])}<span class=\"ptop-r\">${tab === 'home' ? 새로고침 : ''}${S.user ? userMenu({ admin: true, sub: '운영자' }) : ''}</span></div>")
     && js.includes('<span class="ctx-badge">${agentBadge()}${S.user ? userMenu({ admin: true }) : \'\'}</span>'),
     '머리 줄 - 왼쪽 지금 위치, 오른쪽 프로필 (중개사 화면·운영 화면) · 계약서 작성 화면은 머리 줄 오른쪽에 프로필');
  const 메뉴 = js.slice(js.indexOf('function userMenu(opt = {}){'), js.indexOf('function docShell('));
  ok(/관리 \? '' : `\$\{줄\('#\/my', '내 조건'/.test(메뉴) && 메뉴.includes("${줄('#/account', '마이페이지'") && 메뉴.includes('data-act="logout"')
     && 메뉴.includes('<span class="nm2"><b>${esc(who)} 님</b>${소속 ? `<small>${esc(소속)}</small>` : \'\'}</span>'),
     '어드민 프로필 드롭다운은 마이페이지 · 로그아웃만 - 단추에 이름과 사무소(운영자는 운영자)');
  ok(js.includes("const CT_하위메뉴 = [['#/partner/contracts/new', '계약서 작성', 'pen', 'ctn'], ['#/partner/contracts', '계약서 목록', 'doc', 'ct'],\n  ['#/partner/contracts/phrases', '특약 관리', 'list', 'ctp'], ['#/partner/contracts/schedule', '일정·알림', 'cal', 'cts']];")
     && 옆.includes("S.route === '#/partner/contract/new' ? 'ctn' : ((CT_하위메뉴.find(([h]) => h === S.route) || [])[3] || 'ct')")
     && js.includes("else if(h==='#/partner/contracts' || h.startsWith('#/partner/contracts/')) html = V['#/partner/contracts'](parts[3]);")
     && js.includes("if(h === '#/partner/contracts' || h.startsWith('#/partner/contracts/')){"),
     "계약 묶음 네 칸(계약서 작성 · 계약서 목록 · 특약 관리 · 일정·알림, 2026-10-30 대표님) - 주소마다 화면 · 켜진 칸은 주소로(새 계약서 작성 중이면 '계약서 작성')");
  for (const k of ['d', 'p', 'st', 's', 'l'])
    ok(js.includes(`\${navPartner('${k}')}\n  <div class="pad adm-page" style=`), `메뉴 화면(${k})은 가운데 폭 제한 없이 본문을 채운다`);
  ok(/body:not\(\.mo\) \.scr:has\(> \.psb\) > \.adm-page\{max-width:none!important;margin:0!important/.test(css) && /\.adm-grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(440px,1fr\)\)/.test(css)
     && /\.dz-main\{padding-top:14px!important;padding-bottom:40px!important;width:100%\}/.test(css) && /\.ptop\{[^}]*z-index:30\}/.test(css),
     '넓은 화면 - 폭 제한을 풀고 카드는 폭만큼 여러 줄 · 대시보드도 1320px 제한 없음 · 프로필 드롭다운이 카드 위로');
  /* 2026-10-30 대표님 '본문 영역 좌우를 양쪽 텍스트 끝 위치에 맞춰' - 대시보드만 .pad 의 76px 를 물려받아 44px 안쪽에 있었다 */
  const 머리여백 = (css.match(/\.ptop\{[^}]*padding:10px (\d+)px 0/) || [])[1];
  ok(머리여백 === '32' && css.includes('body:not(.mo) .dz-main{padding-left:32px!important;padding-right:32px!important}')
     && /> \.adm-page\{[^}]*padding:14px 32px 40px!important/.test(css),
     '본문 좌우 끝 = 머리 줄 글자 끝 - 머리 줄 · 대시보드 · 메뉴 화면이 모두 좌우 32px');
  ok(css.includes('.empty > img{margin-inline:auto}'), '빈 화면의 비버는 글과 같이 가운데 (블록 그림은 text-align 이 옮기지 못한다)');

  /* 상용 수준 다듬기 (2026-10-30 대표님 '어드민 UIUX 를 상용서비스 수준으로') - 지금 위치 · 묶음 · 창 제목 · 화면 제목 · 불러오는 줄 */
  const 위치 = new Function('ownerSide', 'CT', 'ctTitle', 'esc', `${옆.slice(옆.indexOf('function adm위치(h){'), 옆.indexOf('/* ── 버전 (2026-10-30'))}; return { adm위치, adm경로 };`)(
    () => false, { doc: { form: 'sale' } }, () => '부동산 매매계약서', esc);
  ok(JSON.stringify(위치.adm위치('#/partner/contracts/schedule')) === '[["계약"],["일정·알림"]]'
     && JSON.stringify(위치.adm위치('#/partner/contract/abc')) === '[["계약"],["계약서 목록","#/partner/contracts"],["부동산 매매계약서"]]'
     && JSON.stringify(위치.adm위치('#/partner/contract/new')) === '[["계약"],["계약서 작성","#/partner/contracts/new"],["부동산 매매계약서"]]'
     && JSON.stringify(위치.adm위치('#/partner/demand/x')) === '[["영업"],["수요 목록","#/partner/demands"],["손님 조건"]]'
     && JSON.stringify(위치.adm위치('#/partner/settings')) === '[["내 사무소"],["활동 설정"]]' && 위치.adm위치('#/x').length === 0,
     '지금 위치 - 묶음 › 화면(› 그 안의 화면), 계약서 작성 중이면 그 계약서 이름');
  const 경로 = 위치.adm경로([['계약서', '#/partner/contracts'], ['일정·알림']]);
  ok(/aria-label="현재 위치"/.test(경로) && /<a data-go="#\/partner\/contracts">계약서<\/a><i class="adm-sep" aria-hidden="true"><\/i><b aria-current="page">일정·알림<\/b>/.test(경로) && !/›|>/.test(경로.replace(/<[^>]*>/g, '')),
     '경로 한 줄 - 앞 칸은 링크, 마지막 칸이 지금 화면(aria-current) · 사이는 그림 꺾쇠(글자 화살표 없음)');
  ok(["'영업',", "'내 사무소',"].every(t => 옆.includes(t)) && 옆.includes("typeof x === 'string' ? `<span class=\"grp\">${x}</span>`"), '중개사 메뉴를 묶음 이름(영업 · 계약 · 내 사무소)으로 나눈다 - 운영 메뉴와 같은 모양');
  ok(js.includes("document.title = 곳.length ? `${곳[곳.length - 1][0]} · 비버노크 ${h.startsWith('#/ops') ? '운영' : '파트너'}` : 기본제목;") && js.includes('var 기본제목 = document.title;'),
     '창 제목 - 어드민은 지금 화면 이름 · 비버노크 파트너/운영, 다른 화면은 사이트 제목');
  ok(/body:not\(\.mo\) :is\(\.adm-page, \.dz-main\) h1\.t\{font-size:24px!important;margin-top:0!important/.test(css) && /body:not\(\.mo\) \.dz-h1\{font-size:24px\}/.test(css),
     '어드민 화면 제목은 24px 하나로(화면마다 25·28px 이던 것)');
  ok(js.includes("document.body.classList.toggle('adm', !!app.querySelector('.dz-side'));")
     && css.includes('@media (pointer:fine){\n  body.adm .btn{min-height:40px;padding:0 18px;font-size:15px}')
     && css.includes('body.adm .chip{min-height:34px!important;padding:0 12px!important;font-size:14px!important}'),
     '어드민 단추·칩 크기 (2026-10-30 대표님 \'고급스럽게\') - 왼쪽 메뉴가 선 화면(body.adm)에서 마우스일 때만 34·40·44px · 휴대폰·터치는 44px 그대로');
  ok(css.includes(':is(.chip, .ct-chips .chip).on{background:var(--ind50);border-color:var(--ind);color:var(--ind700);font-weight:700;')
     && css.includes('@media (hover:none){\n  :is(.chip, .ct-chips .chip).on:not(:disabled):hover{background:var(--ind50);border-color:var(--ind);color:var(--ind700)}')
     && /\.btn\{display:inline-flex;[^}]*border:1px solid transparent;/.test(css) && css.includes('.btn,.btn.sm{font-weight:600;letter-spacing:-.01em}'),
     '단추·칩 모양은 사이트 전체가 하나 (2026-10-30 \'손님 화면도 맞춰서\') - 테두리 1px · 굵기 600 · 고른 칩은 옅은 남색 + 표 · 손가락 화면에서 누른 뒤 남는 hover 도 같은 모양');
  ok(/body:not\(\.mo\) \.ctx-head\{flex-wrap:nowrap\}/.test(css) && /body:not\(\.mo\) \.ctx-sub\{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/.test(css),
     '계약서 작성 화면 머리 줄은 한 줄 - 프로필이 붙어도 안내 글이 줄임표로 줄어든다');
  ok(js.includes('role="status" aria-label="계약서를 불러오는 중입니다"') && js.includes('<div class="ct-row ct-skr" aria-hidden="true">') && js.includes('data-go="#/partner/contracts/new" style="margin-top:16px">계약서 작성</button>'),
     '계약서 목록 - 불러오는 동안 표 모양 그대로 회색 줄 · 비어 있으면 계약서 작성 단추');

  /* 글꼴 (2026-10-30 대표님 '폰트 가독성 - 프리텐다드나 본고딕으로') - 예전 한 파일은 634자 축소판이라 나머지 글자가 맑은 고딕으로 섞였다 */
  const 머리글꼴 = (fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/@font-face\{font-family:"Pretendard Variable";[^}]*unicode-range:[^}]*\}/g) || []);
  const 조각들 = fs.readdirSync(new URL('../fonts/pretendard/', import.meta.url)).filter(f => /^PretendardVariable\.subset\.\d+\.woff2$/.test(f));
  ok(머리글꼴.length === 92 && 머리글꼴.every(r => /src:url\(fonts\/pretendard\/PretendardVariable\.subset\.\d+\.woff2\)/.test(r)) && 조각들.length === 92
     && !fs.existsSync(new URL('../fonts/pretendard-variable.woff2', import.meta.url)) && !/pretendard-variable\.woff2/.test(js + css),
     `사이트 글꼴은 Pretendard 공식 조각 92개(쓰는 글자 묶음만 받는다 - unicode-range) · 예전 634자 축소판은 지웠다 (조각 ${조각들.length})`);
  ok((fs.readFileSync(new URL('../legal-base.css', import.meta.url), 'utf8').match(/@font-face\{font-family:"Pretendard Variable";[^}]*src:url\(\/fonts\/pretendard\//g) || []).length === 92,
     '약관·처리방침도 같은 Pretendard 조각을 부른다(전에는 이름만 적어 기기 글꼴로 나왔다)');

  /* 계약서 작성 (2026-10-30 '심플하지만 직관적이고 편하게') */
  ok(js.includes('function ct만들것(p){') && js.includes('function ctWizHTML(전체){') && /case 'ctp-go': \{/.test(js) && /case 'ctp-quick':/.test(js)
     && !/if\(c && !c\.subs && !c\.deals\)\{ ctMake/.test(js) && js.includes('<button type="button" class="btn pri" data-act="ctp-go"')
     && /\.ctw-foot\{position:sticky;bottom:0;/.test(css) && /\.ctw\{[^}]*overflow:clip;/.test(css),
     '계약서 작성 - 왼쪽 종류 | 오른쪽 세부 종류·거래유형 · 고르기만으로는 열지 않고 [계약서 만들기] 로 · 자주 쓰는 계약서 바로가기 · 만들기 줄은 화면 아래에 붙는다');
  /* 2026-10-30 '완성도 있게 · 단추는 배경색 상자로 더 구분 · 줄간격·글자 크기 · 필요하면 모션' */
  ok(/\.ctw-c\{[^}]*background:var\(--ctw-fill\)/.test(css) && css.includes('.ctw-c.on{background:var(--ind);color:#fff;font-weight:700')
     && css.includes(".ctw-c.on::before{content:'';flex:none;width:6px;height:6px;border-radius:50%") && /\.ctw-seg button\.on\{background:var\(--ind\);color:#fff/.test(css),
     '고르는 단추는 옅은 면 상자, 고르면 꽉 찬 남색 + 점(하나만 고르는 칩의 표) · 거래유형도 같은 모양');
  ok(css.includes('.ctw .ctw-foot .btn[disabled]{background:var(--ind)!important;border-color:var(--ind)!important;color:#fff!important;opacity:.38}'),
     '아직 못 만들 때는 회색 상자 대신 흐린 남색(.38) - 무엇을 누르게 될지 보인다');
  ok(/@keyframes ctwIn\{/.test(css) && /@keyframes ctwPop\{/.test(css) && /\.ctw-body\.swap > \*\{animation:ctwIn \.3s [^}]*animation-delay:calc\(var\(--i,0\) \* 45ms\)\}/.test(css)
     && css.includes('@media (prefers-reduced-motion:reduce){\n  .ctw *,.ctw-quick *{animation:none!important;transition:none!important}'),
     '움직임 - 종류를 바꾸면 걸음이 45ms 간격으로 올라오고, 고른 것은 톡 · 움직임 줄이기 설정이면 모두 끈다');
  ok(js.includes("CT.wizFx = { swap: true, just: 'ctp-cat:' + v };") && js.includes("CT.wizFx = { just: 'ctp-sub:' + v, kind: 'sub' };") && js.includes('const fx = CT.wizFx || {}; CT.wizFx = null;'),
     '움직임 표시는 누른 직후 첫 그림에서만 쓰고 지운다(다시 그릴 때 되풀이 없음)');
  ok(css.includes('body.mo .scr:has(> .tabbar) .ctw-foot{bottom:calc(74px + env(safe-area-inset-bottom, 0px))}'),
     '휴대폰 - 만들기 줄은 아래 탭 막대 위에 붙는다(그 밑에 단추가 가려졌다)');

  /* 마이페이지 (2026-10-30 '빈 곳 없이 · 서비스 수준') */
  ok(js.includes('<section class="card acc-row"><div class="acc-l"><h2>${제목}</h2>') && js.includes('<button class="btn sec sm acc-out" data-act="logout">로그아웃</button>')
     && js.includes("${navPartner('acc')}") && !/<button class="btn sec md blk" data-act="logout">/.test(js) && /\.acc-row\{display:grid;grid-template-columns:220px minmax\(0,1fr\)/.test(css),
     '마이페이지 - 묶음마다 한 줄 카드(왼쪽 이름 | 오른쪽 내용) · 로그아웃은 프로필 줄의 작은 단추 · 파트너는 넓은 화면에서 어드민 틀 그대로');

  /* 버전 - 화면의 버전과 version.json 이 같아야 새 버전 알림이 맞게 뜬다 */
  const 판 = JSON.parse(fs.readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  const 첫 = (js.match(/const BK_변경 = \[\n  \{ v:'([^']+)', 날:'([^']+)'/) || []);
  ok(첫[1] && 첫[1] === 판.v && 첫[2] === 판.date, `버전 - 화면(${첫[1]})과 version.json(${판.v})이 같다 · 배포할 때 둘 다 바꾼다`);
  const 날들 = [...js.matchAll(/\{ v:'[^']+', 날:'(\d{4}-\d{2}-\d{2})'/g)].map(m => m[1]);
  ok(날들.length >= 3 && 날들.every((d, i) => !i || d <= 날들[i - 1]), '업데이트 내역은 새것부터');
  ok(/\.modal\{position:fixed;inset:0;z-index:60;/.test(css) && /\.modal \.box\{[^}]*max-height:calc\(100dvh - 48px\);overflow-y:auto;/.test(css),
     '모달 막은 화면에 붙는다(fixed) - 내려 둔 화면에서 열어도 위만 덮이거나 창이 잘리지 않는다 · 긴 창은 안에서 스크롤 (2026-10-30 대표님 \'이런 버그\')');
  ok(js.includes("fetch('/version.json', { cache:'no-store' })") && js.includes("if(S.modal.type==='ver')") && /case 'ver-reload': location\.reload\(\); return true;/.test(js),
     '새 버전 확인은 캐시 없이 · 버전을 누르면 업데이트 내역 · 새 버전이면 새로고침');
}

/* ── ⑤ 날씨 - 기상청 초단기예보 (api/_weather.js) ── */
{
  const W = await import(길.api('_weather.js'));
  ok(JSON.stringify(W.격자(37.5665, 126.9780)) === '{"nx":60,"ny":127}' && JSON.stringify(W.격자(37.5393, 127.2149)) === '{"nx":64,"ny":126}'
     && JSON.stringify(W.격자(33.4996, 126.5312)) === '{"nx":53,"ny":38}', '위경도 → 기상청 격자 (서울 60·127, 하남 64·126, 제주 53·38)');
  ok(['경기도 하남시 미사대로 550', '서울특별시 송파구 올림픽로 300', '하남시 미사대로 550', '부산광역시 강서구 명지동', '광주광역시 서구 내방로 111', '경기도 광주시 행정타운로 50', '']
       .map(a => W.날씨곳(a).이름).join() === '하남시,서울 송파구,하남시,부산,광주,광주시,서울',
     '사무소 주소 → 날씨 볼 곳 - 시·도를 먼저 본다(부산 강서구·광주광역시를 서울·경기로 잡지 않는다) · 모르면 서울');
  const 칸 = [['1900', 'T1H', '12'], ['1900', 'SKY', '1'], ['1900', 'PTY', '0'], ['2000', 'T1H', '11'], ['2000', 'SKY', '4'], ['2000', 'PTY', '1'], ['1300', 'T1H', '15'], ['1300', 'SKY', '3'], ['1300', 'PTY', '3']]
    .map(([t, c, v]) => ({ fcstDate: '20261030', fcstTime: t, category: c, fcstValue: v }));
  ok(JSON.stringify(W.예보한칸(칸, new Date('2026-10-30T10:10:00Z'))) === '{"t":12,"sky":"맑음","icon":"moon","at":"19:00"}'
     && W.예보한칸(칸, new Date('2026-10-30T10:50:00Z')).icon === 'rain' && W.예보한칸(칸, new Date('2026-10-30T04:00:00Z')).sky === '눈'
     && W.예보한칸([], new Date()) === null, '지금에 가장 가까운 예보 한 칸 - 밤 맑음은 달 · 비/눈이 하늘보다 먼저 · 없으면 null');

  const 원래 = globalThis.fetch, 불린 = [];
  let 답 = () => new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: 칸 } } } }), { status: 200 });
  globalThis.fetch = async u => { 불린.push(String(u)); return 답(); };
  delete process.env.KMA_KEY; delete process.env.DATA_GO_KEY;
  ok(JSON.stringify(await W.날씨('경기도 하남시 미사대로 550', new Date('2026-10-30T10:10:00Z'))) === '{"place":"하남시","weather":null}' && 불린.length === 0,
     '키가 없으면 기상청에 묻지 않고 날씨 없이(화면은 날짜·시간만)');
  process.env.KMA_KEY = 'abc%2Bdef';
  const 됨 = await W.날씨('경기도 하남시 미사대로 550', new Date('2026-10-30T10:10:00Z'));
  const 주소 = new URL(불린[0]);
  ok(됨.weather && 됨.weather.t === 12 && 주소.searchParams.get('serviceKey') === 'abc+def' && 주소.searchParams.get('base_date') === '20261030'
     && 주소.searchParams.get('base_time') === '1830' && 주소.searchParams.get('nx') === '64' && 주소.searchParams.get('ny') === '126' && 주소.pathname.endsWith('/getUltraSrtFcst'),
     '초단기예보 - 하남 격자 · 45분 전 발표(19:10 이면 18:30) · 인코딩된 키는 한 번만 인코딩');
  await W.날씨('경기도 하남시 미사대로 550', new Date('2026-10-30T10:12:00Z'));
  ok(불린.length === 1, '같은 격자·같은 발표는 10분 동안 다시 묻지 않는다');
  답 = () => new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>', { status: 200 });
  ok((await W.날씨('서울특별시 송파구 올림픽로 300', new Date('2026-10-30T10:10:00Z'))).weather === null, '활용신청 안 된 키(XML 오류)면 날씨 없이');
  globalThis.fetch = 원래; delete process.env.KMA_KEY;
  const feed = fs.readFileSync(new URL('../api/feed.js', import.meta.url), 'utf8');
  ok(feed.indexOf("if (b.what === 'weather')") > 0 && feed.indexOf("if (b.what === 'weather')") < feed.indexOf('const chk = await approvedAgent(user);'),
     '날씨는 로그인한 누구나(운영자 화면도) - 파트너 확인 앞');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
