/* 중개 도구 (2026-11-23) - 실거래가 · 잔금 전 등기 다시 보기 · 중개보수 장부 · 만기 재계약 */
import fs from 'node:fs';
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const js = 길.js();
const R = await import(길.api('_rt.js'));
const C = await import(길.api('_contract.js'));
const 응답 = (b, s = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s });

/* ── 실거래가 ── */
ok(R.고를종류('아파트').join() === 'apt' && R.고를종류('다세대주택').join() === 'rh' && R.고를종류('오피스텔').join() === 'offi' && R.고를종류('').join() === 'apt,rh', '건물 용도로 볼 자료를 고른다(모르면 아파트 · 연립다세대)');
ok(R.지번글('220', '') === '220' && R.지번글('0220', '0001') === '220-1' && R.지번글('', '1') === '', '지번 - 본번 · 부번');
ok(R.달들(3, Date.parse('2026-01-15T00:00:00+09:00')).join() === '202601,202512,202511', '지난 달들 - 해를 넘겨도');
{
  const 물음 = [];
  const 거래 = (o) => ({ umdCd: '10600', jibun: '220', aptNm: '미사강변자이', excluUseAr: '84.98', dealAmount: '95,000', dealYear: '2026', dealMonth: '10', dealDay: '3', floor: '12', cdealType: '', ...o });
  const 가짜 = async u => { u = String(u); 물음.push(u);
    if (/DEAL_YMD=202611/.test(u)) return 응답({ response: { header: { resultCode: '000' }, body: { items: { item: [거래({ dealMonth: '11', dealDay: '2', dealAmount: '97,000' }), 거래({ jibun: '221' }), 거래({ umdCd: '10700' }), 거래({ cdealType: 'O', dealAmount: '50,000' })] } } } });
    if (/DEAL_YMD=202610/.test(u)) return 응답({ response: { header: { resultCode: '000' }, body: { items: { item: 거래({ excluUseAr: '59.9', dealAmount: '70,000' }) } } } });
    return 응답({ response: { header: { resultCode: '000' }, body: { items: '' } } }); };
  const o = await R.실거래가({ admCd: '4145010600', bun: '220', use: '아파트', area: 84.9, months: 3 }, 'KEY', 가짜, Date.parse('2026-11-23T10:00:00+09:00'));
  ok(o.kind === 'apt' && o.rows.length === 2 && o.rows[0].금액 === 970000000 && o.rows[0].날 === '2026-11-02' && o.대표 === 970000000 && o.같은넓이 && 물음.every(u => /LAWD_CD=41450/.test(u)),
     '같은 동 · 같은 지번 거래만(해제 거래 빼고), 금액은 원 · 같은 넓이(±3㎡) 최근 거래로 대표값 · 시군구 코드로 묻는다');
  const 막힘 = async () => 응답('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>');
  let 오류 = null; try { await R.실거래가({ admCd: '4145010600', bun: '220', use: '아파트' }, 'KEY', 막힘); } catch (e) { 오류 = e; }
  ok(오류 instanceof R.실거래오류 && /활용신청/.test(오류.message) && 오류.cause === 'need', '활용신청 전이면 무엇을 신청할지 알린다');
  ok(/법정동코드/.test((await R.실거래가({ admCd: '', bun: '1' }, 'K')).error) && (await R.실거래가({ admCd: '4145010600', bun: '1' }, '')).need === 'key', '법정동코드 없음 · 키 없음은 알리고 묻지 않는다');
  const 없음 = await R.실거래가({ admCd: '4145010600', bun: '999', use: '' }, 'KEY', 가짜, Date.parse('2026-11-23T10:00:00+09:00'));
  ok(Array.isArray(없음.rows) && !없음.rows.length && /매매 실거래가 없습니다/.test(없음.note), '거래가 없으면 없다고 알린다');
}
const 원본 = fs.readFileSync(new URL(길.api('_contract.js')), 'utf8');
ok(/case 'contract-rt':\s+await rt\(req, res, agent, b\)/.test(원본) && /overLimit\('rt:a:' \+ agent\.id, 100, 864e5\)/.test(원본), '실거래가 - 계정마다 하루 100번 · 한 곳 200번');

/* ── 잔금 전 등기 확인 일정 ── */
const 계 = (o = {}) => ({ form: 'home-lease', status: 'sealed', cd: '2026-11-01', bd: '2026-11-30', track: {}, ...o });
const 등기 = c => C.일정목록(c).find(e => e.k === 'regchk');
ok(등기(계()).날 === '2026-11-27' && !등기(계({ status: 'draft' })) && !등기(계({ track: { state: 'done' } })) && 등기(계({ track: { regAt: '2026-11-26' } })).마침
   && C.알림날.regchk.join() === '0' && C.오늘알림(계(), C.알림설정(), '2026-11-27').some(e => e.k === 'regchk') && !C.오늘알림(계({ track: { regAt: '2026-11-26' } }), C.알림설정(), '2026-11-27').some(e => e.k === 'regchk'),
   '잔금 3일 전 아침 등기 확인 - 확정본만 · 완료면 없음 · 다시 봤으면 알리지 않음');
ok(C.trackCheck({ fee: 1200000, regNote: '새 권리 1건', feeAt: '2026-11-30', askAt: '2026-11-01' }).fee === 1200000 && C.trackCheck({ fee: -1 }).fee === undefined
   && C.trackCheck({ regNote: '홍길동 900101-1234567' }).regNote === undefined && C.trackCheck({ feeAt: '2026-11-30' }).feeAt === '2026-11-30' && C.trackCheck({ askAt: '어제' }) === null,
   '보수 금액 · 받은 날 · 물은 날 · 등기 결과 한 줄을 남긴다(주민번호 모양은 거절)');
const 화면종류 = /const CT_알림종류 = \{([\s\S]*?)\};/.exec(js)[1];
ok(/regchk:/.test(화면종류) && Object.keys(C.알림종류).every(k => new RegExp('\\b' + k + ':').test(화면종류)), '화면과 서버의 알림 종류가 같다(잔금 전 등기 확인)');

/* ── 잔금 전 등기 견주기 - 실제로 돌려 본다 ── */
{
  const s = js.indexOf('function ct등기비교('), e = js.indexOf('function ct등기비교HTML(', s);
  const CT_FORMS = { 'home-lease': { lease: true, a: ['lessor', '임대인'] } };
  const B = new Function('CT_FORMS', 'CT_압류', 'CT_선순위', 'won', js.slice(s, e) + ';return ct등기비교;')(CT_FORMS, /가압류|압류|가처분|경매|가등기/, /근저당|저당|전세권|임차권|질권/, n => String(n));
  const 문 = { form: 'home-lease', parties: { lessor: { name: '홍 길동' } }, safe: { regAt: '2026-11-01', rights: [{ k: '근저당권설정', a: 120000000 }] } };
  const 같음 = B(문, { rights: [{ kind: '근저당권설정', amount: '금120,000,000원' }], owners: [{ name: '홍길동' }] });
  ok(!같음.위험 && 같음.요약 === '새로 생긴 권리 없음 · 소유자 같음', '계약 때와 같으면 새 권리 없음 · 소유자 같음');
  const 바뀜 = B(문, { rights: [{ kind: '근저당권설정', amount: '120,000,000' }, { kind: '가압류', amount: '30,000,000', date: '2026-11-20' }], owners: [{ name: '김철수' }] });
  ok(바뀜.위험 && 바뀜.새.length === 1 && 바뀜.새[0].k === '가압류' && 바뀜.소유다름 && /새 권리 1건\(가압류 30000000원\)/.test(바뀜.요약) && /소유자가 계약서와 다름/.test(바뀜.요약) && !/김철수|홍/.test(바뀜.요약),
     '새로 생긴 가압류 · 소유자 바뀜을 잡는다(결과 한 줄에 이름은 안 남김)');
  const 말소 = B(문, { rights: [], owners: [] });
  ok(말소.사라짐.length === 1 && !말소.위험 && /말소 1건/.test(말소.요약), '말소된 권리는 따로 보여 주고 위험으로 보지 않는다');
  const 기준없음 = B({ form: 'home-lease', parties: {} }, { rights: [{ kind: '근저당권설정', amount: '1' }], owners: [] });
  ok(!기준없음.전 && /말소 안 된 권리 1건/.test(기준없음.요약) && !기준없음.위험, '계약 때 기록이 없으면 지금 권리만');
}
ok(js.includes("${잠김 && CT.id ? ct등기다시HTML(doc) : ''}") && js.includes("data-scanfile=\"reg\"") && js.includes("ctTrackSet({ regAt: ct오늘(), regNote: R.요약 })"), '확정본 일정·체크에서 등기부를 올려 견주고, 본 날 · 결과를 남긴다');

/* ── 등기 판독 반영 정규식 (2026-11-23 바로잡음 - 역빗금이 빠져 '주' 가 든 개인 이름이 기관으로, 접수일이 늘 빈칸이었다) ── */
{
  const s = js.indexOf("if(!F.explain && F.lease && 있음('reg')){"), 몸 = js.slice(s, s + 900);
  const 기관 = new RegExp(/const 기관 = \/(.*)\/;/.exec(몸)[1]);
  const 날 = new RegExp(/d: \(\/(.*?)\/\.exec/.exec(몸)[1]);
  ok(기관.test('(주)비버캐피탈') && 기관.test('국민은행') && !기관.test('김주연') && (날.exec('2025.08.11 접수') || [])[0] === '2025.08.11' && (날.exec('2025-8-1') || [])[0] === '2025-8-1',
     '개인 권리자(이름에 ‘주’가 있어도)는 개인으로 · 접수일을 읽는다');
}

/* ── 중개보수 장부 · 만기 재계약 ── */
{
  const s = js.indexOf('function ct보수행들('), e = js.indexOf('function ct보수장부HTML(', s);
  const CT_FORMS = { 'home-lease': { lease: true }, sale: {}, 'explain-home': { explain: true } };
  const 살 = r => !(r.track && (r.track.trash || r.track.arch));
  const F = new Function('CT_FORMS', 'ct살아있음', 'ct일정뺄것', 'ct날만', js.slice(s, e) + ';return ct보수행들;')(CT_FORMS, 살, () => new Set(['old']), d => /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10) : '');
  const 행 = F([
    { id: 'a', form: 'home-lease', status: 'sealed', bd: '2026-11-10', track: {} }, { id: 'ea', form: 'explain-home', ci: 'a', fee: 1200000, status: 'draft', track: {} },
    { id: 'b', form: 'sale', status: 'sealed', bd: '2026-10-01', track: { fee: 5000000, balanceDate: '2026-10-05' } },
    { id: 'c', form: 'sale', status: 'sealed', bd: '2026-09-01', track: { state: 'cancel' } }, { id: 'd', form: 'sale', status: 'draft', bd: '2026-09-01', track: {} },
    { id: 'old', form: 'sale', status: 'sealed', bd: '2026-08-01', track: {} }, { id: 't', form: 'sale', status: 'sealed', bd: '2026-08-01', track: { trash: '2026-11-01' } } ]);
  ok(행.map(x => x.r.id).join() === 'a,b' && 행[0].보수 === 1200000 && !행[0].직접 && 행[1].보수 === 5000000 && 행[1].직접 && 행[1].잔 === '2026-10-05',
     '보수 장부 - 확정본만(취소 · 작성 중 · 앞 판 · 휴지통 빼고) · 확인·설명서 보수가 먼저, 없으면 직접 적은 값 · 바뀐 잔금일');
}
ok(js.includes("['#/partner/contracts/fees', '중개보수', 'chart', 'ctfee']") && js.includes("['#/partner/contracts/renew', '만기 재계약', 'cal', 'ctrn']") && js.includes("if(직원()) return 머리 + '<div class=\"card pad\"><p class=\"sub\" style=\"margin:0\">중개보수 장부는 대표만")
   && js.includes("x.n >= -30 && x.n <= 183") && js.includes("case 'ct-row-ask':"),
   '계약서 메뉴에 중개보수(대표만) · 만기 재계약(6개월 안 · 지난 30일까지, 물어봤음 표시)');
ok(js.includes("if(k.startsWith('ctfee:'))") && js.includes("ctRowTrack(id, { fee: n }, true)") && js.includes("what:'contract-track', id, track: t"), '장부에서 계약서를 열지 않고 보수 · 받은 날 · 발행일을 저장한다');
ok(js.includes('${ct실거래HTML(doc)}') && js.includes("what:'contract-rt'") && js.includes("case 'ct-rt-put':"), '전세 점검 시세 옆에 실거래가 - 고른 값을 시세 칸에');

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
