/* 확인·설명서 hwp 원본 틀 (2026-11-20 파트너 '국가법령정보센터 hwp 양식과 완벽하게 동일하게')
   - 틀(EXH_DATA)이 원본 hwp 의 쪽 수 · 표 높이와 같은지
   - 적는 자리가 지금 쓰는 칸과 이어져 값이 그대로 보이고, 서식에서 고치면 그 칸에 들어가는지
   - 중개보수 = 요율 계산 · 일반/간이과세 부가세 · 계 = 보수 + 부가세 + 실비 */
import fs from 'fs';
const 원본 = fs.readFileSync(new URL('../원본/비버노크_프로토타입.html', import.meta.url), 'utf8');
const js = 원본.slice(원본.indexOf('<script>') + 8, 원본.lastIndexOf('</script>'));
let 통과 = 0, 실패 = 0;
const ok = (c, m) => { if(c){ 통과++; console.log('  OK  ' + m); } else { 실패++; console.log('  X   ' + m); } };

const 틀시작 = js.indexOf('/* ══════════ 확인·설명서 hwp 원본 틀'), 틀끝 = js.indexOf('/* ── 사무소 기본값 (2026-11-06');
const 보수시작 = js.indexOf('function ex보수(doc){'), 표시작 = js.indexOf('const EX_주택매매'), 표끝 = js.indexOf('\n', js.indexOf('const EX_주택임대')) + 1;
ok(틀시작 > 0 && 틀끝 > 틀시작 && 보수시작 > 0 && 표시작 > 0, '원본 틀 코드 · 중개보수 계산이 있다');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const 코드 = `const comma = d => String(d||'').replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
function ctGet(o, path){ return path.split('.').reduce((x,k)=> x==null ? x : x[k], o); }
function ctSet(o, path, v){ const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((x,k)=> (x[k] = x[k] || {}), o); t[last] = v; }
const EX_FORMS = { 'explain-home': { spec: [{ rows: [{ p: [{ t:'many', k:'ex.docs', o:['등기권리증'] }] }] }] } };
${js.slice(표시작, 표끝)}
${js.slice(보수시작, js.indexOf('\n}\n', 보수시작) + 3)}
${js.slice(틀시작, 틀끝)}
EXH_DATA = 틀JSON;
return { EXH_DATA, exHwpDocHTML, exh값, exh적기, exh고르기, exh골랐나, ex보수값, ex보수채움, exHwp쓸까 };`;
const 틀JSON = JSON.parse(fs.readFileSync(new URL('../forms/ex-hwp.json', import.meta.url), 'utf8'));
const M = new Function('esc', 'CT편집칸', '틀JSON', 코드)(esc, false, 틀JSON);
/* 틀은 열 때 받는다(2026-11-21) - 첫 화면 코드에 틀 JSON 이 없고, 받는 길 · 기다림 · 인쇄 막음이 있다 */
ok(!js.includes('"explain-home":{"page"') && js.includes("let EXH_DATA = null") && js.includes("fetch('/forms/ex-hwp.json?v=' + EXH_판"), '원본 틀은 첫 화면에 싣지 않고 열 때 받는다');
ok(js.includes('EXH_판 = ' + JSON.stringify(틀JSON.v)) && Object.keys(틀JSON.forms).every(k => js.includes(JSON.stringify(k))), '받을 틀의 판 · 양식 목록이 forms/ex-hwp.json 과 같다');
ok(js.includes('exh기다림(doc)) return') && js.includes("if(typeof html !== 'string' && !exh준비됐나(CT.doc)) return true;") && js.includes('if(!exh준비됐나(CT.doc)) return;'), '받는 동안은 불러오는 중 · 인쇄와 PDF 는 기다려 달라고 한다');
const F = M.EXH_DATA.forms;

/* 원본 hwp 와 같은 쪽 수 · 표 높이(1/100 mm, hwp5proc 로 잰 값) */
const 쪽높이 = { 'explain-home': [26521, 26821, 25732, 22738, 26306, 22925], 'explain-biz': [27185, 26393, 25841, 24942], 'explain-land': [26611, 26616, 26626], 'explain-etc': [26614, 26798, 26138] };
for(const [f, hs] of Object.entries(쪽높이)){
  ok(F[f] && F[f].pages.length === hs.length && F[f].pages.every((T, i) => T.h === hs[i]), `${f} - 쪽 ${hs.length}장, 쪽마다 표 높이가 원본 hwp 와 같다`);
  ok(F[f].page[0] === 21000 && F[f].page[1] === 29700, `${f} - A4(210 × 297mm)`);
  ok(Object.keys(F[f].map).length > 50, `${f} - 적는 자리가 지금 칸과 이어져 있다(${Object.keys(F[f].map).length}곳)`);
}
ok(M.exHwp쓸까({ form: 'explain-etc' }) && M.exHwp쓸까({ form: 'explain-home' }) && !M.exHwp쓸까({ form: 'home-lease' }), '확인·설명서 네 서식 모두 원본 틀(입목·재단은 11-20 파트너가 올린 원본)');

/* 값이 서식 자리에 보인다 */
const 이은키 = (f, 값) => Object.entries(F[f].map).find(([, v]) => JSON.stringify(v) === JSON.stringify(값))[0];
const 문서 = { form: 'explain-home', deal: '매매ㆍ교환', house: '공동주택', date: '2026-11-20',
  property: { show: '경기도 하남시 망월동 1-1', detail: '101동 1001호', landArea: '84.9' },
  parties: { a: { name: '홍길동', addr: '서울', phone: '010-1', birth: '70. 01. 01.' }, b: { name: '김철수' } }, broker: { office: '비버공인중개사사무소', rep: '한상혁' },
  ex: { price: 300000000, docs: ['등기권리증'], guard: '있음' } };
const 소재 = 이은키('explain-home', 'property.show');
ok(M.exh값(문서, F['explain-home'], 소재) === '경기도 하남시 망월동 1-1 101동 1001호', '소재지 칸에 주소 + 상세주소');
ok(M.exh값(문서, F['explain-home'], 이은키('explain-home', '$ex.price')) === '300,000,000', '거래예정금액은 쉼표 금액으로');
ok(M.exh값(문서, F['explain-home'], 이은키('explain-home', 'parties.a.name')) === '홍길동', '서명란 매도인 성명');
ok(['2026', '11', '20'].join() === ['y', 'm', 'd'].map(x => M.exh값(문서, F['explain-home'], 이은키('explain-home', '=date.' + x))).join(), '작성일 년 · 월 · 일');
ok(M.exh골랐나(문서, F['explain-home'], 이은키('explain-home', ['house', '공동주택'])) && !M.exh골랐나(문서, F['explain-home'], 이은키('explain-home', ['house', '단독주택'])), '맨 위 주택 유형 [ ] 에 고른 것만 표시');
ok(M.exh골랐나(문서, F['explain-home'], 이은키('explain-home', ['ex.docs', '등기권리증'])), '여럿 고르는 칸(근거자료)도 표시');

/* 서식에서 바로 고치면 그 칸에 */
const d2 = JSON.parse(JSON.stringify(문서));
M.exh적기(d2, F['explain-home'], 이은키('explain-home', '$ex.price'), '350,000,000');
M.exh적기(d2, F['explain-home'], 이은키('explain-home', '=date.d'), '25');
M.exh고르기(d2, F['explain-home'], 이은키('explain-home', ['house', '단독주택']));
M.exh고르기(d2, F['explain-home'], 이은키('explain-home', ['ex.docs', '등기권리증']));
M.exh적기(d2, F['explain-home'], 'p9r9c9', '직접 적은 글');
ok(d2.ex.price === 350000000 && d2.date === '2026-11-25' && d2.house === '단독주택' && !d2.ex.docs.includes('등기권리증') && d2.ex.hf.p9r9c9 === '직접 적은 글',
   '서식에서 적은 값 - 금액 · 날짜 · 하나 고르기 · 여럿 고르기는 그 칸에, 이어지지 않은 자리는 ex.hf 에');
const 승강 = Object.entries(F['explain-home'].map).find(([, v]) => Array.isArray(v) && v[1] === '있음(양호)|있음(불량)');
ok(승강 && M.exh골랐나({ ...문서, ex: { elev: '있음(불량)' } }, F['explain-home'], 승강[0]), '승강기 [있음] 은 양호 · 불량 어느 쪽이든 표시');

/* 코드리뷰(11-20) - 소재지 칸을 고쳐도 상세주소 유지 · 작성일 한 자리만 적으면 나머지는 오늘 · 자필이면 이름 비움 */
{ const d3 = JSON.parse(JSON.stringify(문서)), 키 = 이은키('explain-home', 'property.show');
  M.exh적기(d3, F['explain-home'], 키, '경기도 하남시 망월동 1-2 101동 1001호');
  ok(d3.property.show === '경기도 하남시 망월동 1-2' && d3.property.detail === '101동 1001호', '소재지 칸을 고쳐도 끝의 상세주소는 따로 남는다');
  const d4 = { form: 'explain-home', ex: {} }; M.exh적기(d4, F['explain-home'], 이은키('explain-home', '=date.y'), '2027');
  const 오늘 = new Date(); ok(d4.date === `2027-${String(오늘.getMonth() + 1).padStart(2, '0')}-${String(오늘.getDate()).padStart(2, '0')}`, '작성일이 없을 때 연도만 적으면 월 · 일은 오늘(1월 1일이 아니다)');
  const 대표 = Object.entries(F['explain-home'].map).find(([k, v]) => v === 'broker.rep' && k.startsWith('p3'))[0];
  ok(M.exh값({ ...문서, broker: { rep: '한상혁', hand: true } }, F['explain-home'], 대표) === '' && M.exh값({ ...문서, broker: { rep: '한상혁' } }, F['explain-home'], 대표) === '한상혁', '성명 자필이면 서명란 이름을 비운다'); }
/* 중개보수 */
const 보문 = { form: 'explain-home', deal: '매매ㆍ교환', ex: { price: 300000000, cost: 50000, taxType: '일반과세' } };
ok(M.ex보수채움(보문) && 보문.ex.fee === 1200000, '(나) 채택 - 적지 않은 중개보수 칸에 요율 상한을 채운다');
const 보 = M.ex보수값(보문);
ok(보.보수 === 1200000 && 보.부가 === 120000 && 보.계 === 1370000 && !보.다름, '주택 매매 3억 - 요율 0.4% 보수 120만 + 부가세 12만(일반과세) + 실비 5만 = 계');
const 간 = M.ex보수값({ form: 'explain-home', deal: '매매ㆍ교환', ex: { price: 300000000, fee: 1000000, taxType: '간이과세' } });
ok(간.보수 === 1000000 && 간.부가 === 40000 && 간.계 === 1040000 && 간.다름 && 간.상한 === 1200000, '협의한 보수를 적으면 그 금액 · 간이과세 4%');
ok(M.ex보수값({ form: 'explain-home', deal: '매매ㆍ교환', ex: { price: 300000000, fee: 1200000 } }).부가 === 0, '과세 유형을 고르지 않으면 부가세를 더하지 않는다');
{ const 지운 = { form: 'explain-home', deal: '매매ㆍ교환', ex: { price: 300000000, fee: 0 } }; ok(!M.ex보수채움(지운) && 지운.ex.fee === 0, '중개보수 칸을 지웠으면(0) 다시 채우지 않는다'); }

{ const 침 = { form: 'explain-home', deal: '매매ㆍ교환', ex: {} };
  for(const 자 of ['3', '30', '300', '3000', '30000000', '300000000']){ 침.ex.price = +자; M.ex보수채움(침); }
  ok(침.ex.fee === 1200000, '코드리뷰(11-20) - 거래금액을 한 자리씩 쳐도 중간 금액(1원 등)으로 굳지 않고 다 친 금액의 상한');
  침.ex.fee = 1000000; 침.ex.price = 400000000; M.ex보수채움(침);
  ok(침.ex.fee === 1000000, '고쳐 쓴 중개보수는 거래금액을 바꿔도 그대로'); }
/* 그리기 */
const h = M.exHwpDocHTML(문서);
ok((h.match(/class="exh-pg"/g) || []).length === 6 && /이 쪽만 인쇄/.test(h) && /data-act="exh-pg"/.test(h), '주거용 6쪽 · 쪽 단추 · 쪽마다 이 쪽만 인쇄');
ok(h.includes('>경기도 하남시 망월동 1-1 101동 1001호</div>') && h.includes('>홍길동</span>'), '그린 문서에 값이 들어 있다');
ok(!/비버노크 작성 도구로 만든/.test(h), '‘비버노크 작성 도구로 만든…’ 문구가 없다');
const 한쪽 = M.exHwpDocHTML(문서, { only: 3 });
ok((한쪽.match(/class="exh-pg"/g) || []).length === 1 && !/exh-bar/.test(한쪽), '이 쪽만 인쇄 - 그 쪽 한 장만, 쪽 단추 없이');
ok(!/contenteditable/.test(h), '보기 · 인쇄에는 적는 칸이 없다');
const 편 = new Function('esc', 'CT편집칸', '틀JSON', 코드)(esc, true, 틀JSON).exHwpDocHTML(문서);
ok(/contenteditable="plaintext-only"[^>]*data-cte="exh:/.test(편) && /data-act="exh-box"/.test(편), '양식에 직접 입력 - 빈칸은 바로 적고 [ ] 는 눌러 고른다');
ok(!/영문|Enforcement Rules/.test(JSON.stringify(M.EXH_DATA)), '영문 쪽은 넣지 않았다');

console.log(`${통과} 통과 / ${실패} 실패`);
process.exit(실패 ? 1 : 0);
