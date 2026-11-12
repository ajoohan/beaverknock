/* 2026-11-10 파트너 기획 반영 - 대화방 대리인 · 사진 · 파일, 잔금 준비물 안내, 달력 구독(.ics), 다른 사무소 계약서
 * 저장소 · DB 요청 모양을 흉내 낸 답으로 서버 코드를 돌린다 */
import * as 길 from './길.mjs';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
delete process.env.RESEND_API_KEY; delete process.env.SOLAPI_TPL_INVITE; delete process.env.SOLAPI_TPL_ROOM;

const CID = '11111111-2222-3333-4444-555555555555', AID = '99999999-8888-7777-6666-555555555555';
const 본인 = { id: 'aaaaaaaa-0000-0000-0000-000000000001' }, 대리 = { id: 'cccccccc-0000-0000-0000-000000000003' }, 남 = { id: 'dddddddd-0000-0000-0000-000000000004' };
let 계약 = { id: CID, agent_id: 'a1', agent_user: 'u-boss', form: 'sale', title: '미사 아파트', status: 'sealed', track: null, reported_at: null, prev_id: null,
  doc_parties: { seller: { name: '김매도' }, buyer: { name: '이매수' } }, cd: '2026-11-01', md: '2026-11-20', mid: '10000000', bd: '2026-12-20' };
let 말들 = [], 불린 = [], 저장소 = new Set(), 버킷있음 = true, 파일칸있음 = true, 사무소 = { id: AID, office: '비버공인중개사사무소', alert: null, icsN: 0, ext: null };
const J = (v, s = 200) => new Response(JSON.stringify(v), { status: s });
globalThis.fetch = async (u, o = {}) => { u = String(u); const d = decodeURIComponent(u); const m = o.method || 'GET'; 불린.push({ d, m, b: o.body });
  if (/storage\/v1\/object\/sign\//.test(d)) { const p = d.split('/object/sign/')[1]; return 저장소.has(p) ? J({ signedURL: `/object/sign/${p}?token=t` }) : J({ error: 'not_found' }, 400); }
  if (/storage\/v1\/object\/bk-files$/.test(d) && m === 'DELETE') { const ps = JSON.parse(o.body).prefixes; ps.forEach(p => 저장소.delete('bk-files/' + p)); return J(ps.map(name => ({ name }))); }
  if (/storage\/v1\/object\//.test(d) && m === 'POST') { if (!버킷있음) return J({ statusCode: '404', error: 'Bucket not found' }, 400); 저장소.add(d.split('/object/')[1]); return J({ Key: 'x' }); }
  if (/bk_contract_msg/.test(d)) {
    if (!파일칸있음 && /file/.test(m === 'POST' ? o.body : d)) return J({ code: '42703', message: 'column bk_contract_msg.file does not exist' }, 400);
    if (m === 'POST') { const v = JSON.parse(o.body); const row = { id: 말들.length + 1, ...v, created_at: '2025-01-01T00:00:00Z' }; 말들.push(row); return J([row]); }
    if (m === 'PATCH') { const ids = /id=in\.\(([^)]*)\)/.exec(d)[1].split(',').map(Number); 말들.forEach(x => { if (ids.includes(x.id)) Object.assign(x, JSON.parse(o.body)); }); return J([]); }
    if (/file=not\.is\.null/.test(d)) return J(말들.filter(x => x.file && !x.file.gone));
    const mid = (/[?&]id=eq\.(\d+)/.exec(d) || [])[1]; if (mid) return J(말들.filter(x => x.id === +mid && x.thread === (/thread=eq\.(\w+)/.exec(d) || [])[1]));
    const 뒤 = +((/id=gt\.(\d+)/.exec(d) || [])[1] || 0); const 방 = (/thread=eq\.(\w+)/.exec(d) || [])[1];
    const 고른 = 말들.filter(x => x.id > 뒤 && (!방 || x.thread === 방)); return J(/order=id\.desc/.test(d) ? 고른.slice().reverse() : 고른);
  }
  if (/bk_contract\?/.test(d) && m === 'PATCH') {
    const 판 = (/track->>tv=eq\.(\d+)/.exec(d) || [])[1]; const 지금 = 계약.track || {};
    if (판 && +판 !== (지금.tv || 0)) return J([]);
    계약 = { ...계약, track: JSON.parse(o.body).track }; return J([{ id: CID }]);
  }
  if (/bk_contract\?/.test(d)) {
    const 칸 = /track->room->(?:(p)->)?(\w+)->>uid=eq\.([0-9a-f-]+)/.exec(d);
    if (칸) { const r = (계약.track || {}).room || {}, 곳 = 칸[1] ? (r.p || {}) : r; return J(곳[칸[2]] && 곳[칸[2]].uid === 칸[3] ? [계약] : []); }
    return J([계약]);
  }
  if (/bk_agent\?/.test(d)) return J([{ ...사무소, user_id: 'u-boss', phone: '031-000-0000', staff: null }]);
  return J([]); };

const R = await import('../api/_room.js');
const C = await import('../api/_contract.js');
const X = await import('../api/_ext.js');
const 응답 = () => { const r = { code: 0, body: null, head: {} }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); r.send = t => (r.body = t, r); r.setHeader = (k, v) => { r.head[k] = v; }; return r; };
const 중개사 = { id: 'a1', role: 'agent', office: '비버공인중개사사무소', name: '한상혁' }, 대표 = { id: 'u-boss' };
const 중 = async b => { const res = 응답(); await R.roomAgent({ headers: {} }, res, 중개사, 대표, b); return res; };
const 손 = async (u, b) => { const res = 응답(); await R.roomGuest({ headers: {} }, res, u, b); return res; };
const PDF = Buffer.from('%PDF-1.7 test').toString('base64'), HWP = Buffer.from('d0cf11e0a1b11ae1000000', 'hex').toString('base64');

/* 1. 대리인 */
const 본표 = (await 중({ what: 'room-invite', id: CID, side: 'buyer' })).body.token;
let r = await 중({ what: 'room-invite', id: CID, side: 'buyer', proxy: true });
const 대표표 = r.body.token;
ok(r.code === 200 && /^R3\./.test(대표표) && R.초대표읽기(대표표).대리 === true && r.body.kakaoReady === false, '대리인 초대 표는 R3 - 알림톡은 보내지 않는다(계약서에 번호가 없다)');
ok(!R.초대표읽기('R2' + 대표표.slice(2)) && !R.초대표읽기('R3' + 본표.slice(2)), '대리인 표와 본인 표는 서로 바꿔 쓸 수 없다');
ok((await 손(본인, { what: 'invite-join', token: 본표 })).code === 200, '본인이 들어온다');
ok((await 손(본인, { what: 'invite-join', token: 대표표 })).code === 409, '본인 계정은 대리인 자리에 또 들어가지 못한다(한 계정 한 자리)');
r = await 손(대리, { what: 'invite-join', token: 대표표 });
ok(r.code === 200 && 계약.track.room.p.buyer.uid === 대리.id && 계약.track.room.buyer.uid === 본인.id, '대리인이 링크로 들어오면 그 자리의 대리인으로 묶인다');
ok((await 손(남, { what: 'invite-join', token: 대표표 })).code === 409, '대리인은 자리마다 한 분');
ok((await 중({ what: 'room-invite', id: CID, side: 'buyer', proxy: true })).code === 409, '대리인이 든 자리는 다시 대리인 초대를 하지 않는다');
r = await 손(대리, { what: 'my-room-send', id: CID, text: '대리인입니다' });
ok(r.code === 200 && 말들.at(-1).thread === 'buyer' && 말들.at(-1).name === '매수인 대리인' && r.body.row.mine === true && !('user_id' in r.body.row), '대리인 말은 본인과 같은 방에 "매수인 대리인" 으로 - 계정 번호는 내보내지 않는다');
r = await 손(본인, { what: 'my-room', id: CID });
ok(r.code === 200 && r.body.role === '매수인' && r.body.rows.some(v => v.name === '매수인 대리인' && v.mine === false), '본인 화면에는 대리인 말이 상대 쪽으로 보인다');
ok((await 손(대리, { what: 'my-room', id: CID })).body.role === '매수인 대리인', '대리인 화면 - 나는 매수인 대리인');
ok((await 손(대리, { what: 'my-rooms' })).body.rows.some(v => v.id === CID && v.role === '매수인 대리인'), '마이페이지 - 대리인으로 든 방도 보인다');
r = await 중({ what: 'room', id: CID, side: 'buyer' });
ok(r.body.proxy && r.body.proxy.at && r.body.rows.every(v => !('user_id' in v)) && r.body.form === 'sale', '중개사 방 - 대리인이 들어온 것이 보이고 계정 번호는 없다');
r = await 중({ what: 'room-cut', id: CID, side: 'buyer', proxy: true });
ok(r.code === 200 && !(계약.track.room.p || {}).buyer && 계약.track.room.buyer.uid === 본인.id && 계약.track.room.pc.buyer === 1, '대리인만 내보내면 본인은 그대로 남는다');
ok((await 손(대리, { what: 'my-room', id: CID })).code === 403 && (await 손(남, { what: 'invite-join', token: 대표표 })).code === 404, '내보낸 대리인은 방에 못 들어오고, 그 대리인 링크도 끊긴다');
{ const 새 = (await 중({ what: 'room-invite', id: CID, side: 'seller', proxy: true })).body.token;
  ok((await 손(남, { what: 'invite-join', token: 새 })).code === 200 && 계약.track.room.p.seller.uid === 남.id && !계약.track.room.seller, '본인이 들어오기 전에도 대리인은 들어올 수 있다');
  ok((await 중({ what: 'room-send', id: CID, side: 'seller', text: '안녕하세요' })).code === 200, '대리인만 든 방에도 사무소가 말을 보낼 수 있다'); }
ok(C.방값({ n: 0, p: { buyer: { uid: 'bad' }, seller: { uid: 대리.id, at: 'x' } }, pc: { buyer: -1, seller: 2 } }).p.seller && !C.방값({ n: 0, p: { buyer: { uid: 'bad' } } }).p && C.방값({ n: 0, pc: { seller: 2, buyer: -1 } }).pc.seller === 2,
  'track 다듬기 - 대리인 자리 · 끊김 횟수는 모양이 맞는 것만');

/* 2. 사진 · 파일 */
말들 = [];
r = await 중({ what: 'room-file', id: CID, side: 'buyer', name: '등기부.pdf', data: PDF });
const 파일말 = 말들.at(-1);
ok(r.code === 200 && 파일말.file && /^[0-9a-f]{12}$/.test(파일말.file.id) && 파일말.body === '등기부.pdf' && 저장소.has(`bk-files/room/${CID}/${파일말.file.id}.pdf`),
   '중개사 파일 - bk-files 버킷 room/계약서/번호.확장자에 두고, 말 본문은 파일 이름');
ok(r.body.row.file && !('id' in r.body.row.file) && r.body.row.file.ext === 'pdf', '화면에 주는 파일 정보 - 확장자 · 크기 · 이름만(저장소 번호는 안 준다)');
r = await 손(본인, { what: 'my-room-file-url', id: CID, msg: 파일말.id });
ok(r.code === 200 && /object\/sign\/bk-files\/room\//.test(r.body.url) && !/download=/.test(r.body.url), '손님이 연다 - 5분 서명 주소, PDF 는 창에서 바로 본다');
ok((await 손(본인, { what: 'my-room-file-url', id: CID, msg: 999 })).code === 404, '다른 방 · 없는 파일 번호는 열지 않는다');
r = await 손(본인, { what: 'my-room-file', id: CID, name: '위임장.hwp', data: HWP });
ok(r.code === 200 && 말들.at(-1).side === 'buyer' && 말들.at(-1).file.ext === 'hwp', '손님도 파일을 보낸다');
r = await 중({ what: 'room-file-url', id: CID, side: 'buyer', msg: 말들.at(-1).id });
ok(r.code === 200 && /download=/.test(r.body.url), '한글 파일은 내려받기로 연다');
ok((await 중({ what: 'room-file', id: CID, side: 'buyer', name: 'a.exe', data: PDF })).code === 400, '받지 않는 파일은 거른다(서식 올리기와 같은 확인)');
버킷있음 = false;
r = await 중({ what: 'room-file', id: CID, side: 'buyer', name: 'a.pdf', data: PDF });
ok(r.code === 503 && r.body.need === 'files', '버킷이 없으면(0036 전) 준비 중');
버킷있음 = true; 파일칸있음 = false;
{ const 앞 = 저장소.size; r = await 중({ what: 'room-file', id: CID, side: 'buyer', name: 'a.pdf', data: PDF });
  ok(r.code === 503 && r.body.need === '0036' && 저장소.size === 앞, 'file 칸이 없으면 0036 준비 중 - 올린 파일은 지운다(남는 파일 없음)'); }
ok((await 손(본인, { what: 'my-room', id: CID })).code === 200, 'file 칸이 없어도 대화는 그대로 열린다');
파일칸있음 = true;
/* 1년 정리 - 잔금일(2026-12-20)에서 1년 뒤 */
ok(await R.방파일정리('2027-06-01') === 0 && 말들.some(x => x.file && !x.file.gone), '잔금 뒤 1년이 안 됐으면 지우지 않는다');
{ const n = await R.방파일정리('2028-01-05');
  ok(n === 2 && 말들.filter(x => x.file).every(x => x.file.gone) && ![...저장소].some(p => p.startsWith('bk-files/room/')), '잔금 뒤 1년이 지나면 저장소에서 지우고 말은 "지운 파일" 로 남긴다'); }
ok((await 손(본인, { what: 'my-room-file-url', id: CID, msg: 파일말.id })).code === 410, '지운 파일은 보관 기간이 지났다고 알린다');

/* 3. 잔금 준비물 안내 */
계약 = { ...계약, track: { ...계약.track } }; delete 계약.track.guideAt;
r = await 중({ what: 'room-send', id: CID, side: 'buyer', text: '[잔금 준비물 안내]', kind: 'prep' });
ok(r.code === 200 && 계약.track.guideAt && r.body.track && r.body.track.guideAt === 계약.track.guideAt && 계약.track.room.buyer, '준비물 안내를 대화방으로 보내면 "잔금안내를 했습니다" 가 오늘로 적힌다(대화방 자리는 그대로)');
{ const 판 = C.일정목록({ form: 'sale', status: 'sealed', bd: '2026-12-20', track: {} }), 임대 = C.일정목록({ form: 'home-lease', status: 'sealed', bd: '2026-12-20', track: {} });
  const p = 판.find(e => e.k === 'prep');
  ok(p && p.날 === '2026-12-10' && !p.마침 && !임대.some(e => e.k === 'prep') && C.일정목록({ form: 'sale', bd: '2026-12-20', track: { guideAt: '2026-12-01' } }).find(e => e.k === 'prep').마침,
     '일정 - 매매만 잔금 10일 전 "잔금 준비물 안내", 잔금안내를 했으면 마침');
  ok(C.오늘알림({ form: 'sale', status: 'sealed', bd: '2026-12-20', track: {} }, C.알림설정(), '2026-12-10').some(e => e.k === 'prep')
     && !C.오늘알림({ form: 'sale', status: 'sealed', bd: '2026-12-20', track: { guideAt: '2026-12-01' } }, C.알림설정(), '2026-12-10').some(e => e.k === 'prep')
     && !C.오늘알림({ form: 'sale', status: 'draft', bd: '2026-12-20', track: {} }, C.알림설정(), '2026-12-10').some(e => e.k === 'prep'), '아침 알림 - 날인본 · 안내 전일 때 그날 아침 한 번'); }

/* 4. 달력 구독 */
const 표 = C.달력표(AID, 0);
ok(C.달력표읽기(표)?.a === AID && !C.달력표읽기(표.replace('.0.', '.1.')) && !C.달력표읽기(C.달력표(AID, 0).slice(0, -1) + 'x'), '구독 주소 - 서명이 맞아야 열리고 번호를 바꿔 쓸 수 없다');
{ const 글 = C.달력글('비버노크 계약 일정', [{ uid: 'a', 날: '2026-12-20', 제목: '잔금 · 미사, 아파트; 101동', 설명: '첫 줄\n둘째 줄 ' + '가'.repeat(60) }]);
  ok(글.split('\r\n').every(l => Buffer.byteLength(l) <= 75) && 글.includes('SUMMARY:잔금 · 미사\\, 아파트\\; 101동') && 글.includes('DTSTART;VALUE=DATE:20261220') && 글.includes('DTEND;VALUE=DATE:20261221') && /첫 줄\\n둘째/.test(글.replace(/\r\n /g, '')),
     '달력 글 - 한 줄 75바이트로 접고, 쉼표 · 쌍반점 · 줄바꿈을 벗겨 쓰고, 하루짜리 일정'); }
계약 = { ...계약, track: { ...계약.track }, cd: '2099-01-01', bd: '2099-03-01', md: '2099-02-01' };
사무소 = { ...사무소, ext: [{ id: 'abcdefabcdef', title: '잠실 상가', kind: '매매', office: '행복공인', bd: '2099-04-01' }, { id: '0123456789ab', title: '취소 건', bd: '2099-04-02', state: 'cancel' }] };
r = 응답(); await C.icsFeed({ query: { ics: 표 }, headers: {} }, r);
ok(r.code === 200 && /text\/calendar/.test(r.head['Content-Type']) && r.body.includes('BEGIN:VCALENDAR') && r.body.includes('잔금 · 미사 아파트') && r.body.includes('잔금 · 잠실 상가 (공동중개)') && !r.body.includes('취소 건'),
   '구독 - 계약서 일정과 다른 사무소 계약서 일정(취소 건 빼고)을 달력 글로 준다');
사무소 = { ...사무소, icsN: 1 };
r = 응답(); await C.icsFeed({ query: { ics: 표 }, headers: {} }, r);
ok(r.code === 404, '대표가 주소를 바꾸면(번호가 오르면) 예전 주소는 끊긴다');
r = 응답(); await C.icsFeed({ query: { ics: 'C1.' + AID + '.0.abc' }, headers: {} }, r);
ok(r.code === 404, '모양이 틀린 주소는 404');

/* 5. 다른 사무소 계약서 */
ok(X.외부하나({ id: 'abcdefabcdef', title: '  잠실 \n 상가 ', kind: '이상한', price: '12,000,000원', cd: '2026-1-1', bd: '2026-12-01', state: 'x', file: { id: 'bad', ext: 'pdf' } }).title === '잠실 상가'
   && X.외부하나({ id: 'abcdefabcdef', title: 'a', kind: '이상한' }).kind === '기타' && X.외부하나({ id: 'abcdefabcdef', title: 'a', price: '12,000,000원' }).price === 12000000
   && X.외부하나({ id: 'abcdefabcdef', title: 'a', cd: '2026-1-1' }).cd === '' && !('file' in X.외부하나({ id: 'abcdefabcdef', title: 'a', file: { id: 'bad', ext: 'pdf' } }))
   && !X.외부하나({ id: 'abcdefabcdef', title: ' ' }) && !X.외부하나({ id: 'x', title: 'a' }), '다듬기 - 글 · 금액 · 날짜 · 파일 모양이 틀린 것은 버리고, 이름 없는 건은 받지 않는다');
ok(X.외부들(Array.from({ length: 120 }, (_, i) => ({ id: i.toString(16).padStart(12, '0'), title: 't' + i }))).length === 100, '사무소마다 100건까지');
ok(X.외부일정({ cd: '2026-01-01', md: '2026-02-01', bd: '2026-03-01' }).map(e => e.k).join() === 'contract,mid,balance' && !X.외부일정({ bd: '2026-03-01', state: 'cancel' }).length, '일정 - 계약일 · 중도금 · 잔금, 취소한 건은 뺀다');

/* 6. 화면 · 연결 */
const js = 길.js(), fs = await import('node:fs'), path = await import('node:path');
const feed = fs.readFileSync(path.resolve(길.저장소, 'api/feed.js'), 'utf8'), my = fs.readFileSync(path.resolve(길.저장소, 'api/my.js'), 'utf8');
ok(/'room-file', 'room-file-url'/.test(feed) && /'my-room-file', 'my-room-file-url'/.test(my) && /req\.query\.ics/.test(feed) && /'ics-reset'\]\.includes\(w\)/.test(feed), '서버 연결 - 파일 요청 · 구독 주소(GET) · 주소 바꾸기는 대표만');
ok(/'ics-link', 'contract-ext', 'contract-ext-url'\]\.includes\(w\)\) return 'ct_view'/.test(feed), '직원 권한 - 구독 주소 · 다른 사무소 계약서 보기는 계약서 보기 권한, 올리기 · 고치기는 작성 권한');
ok(js.includes('data-rm-file') && js.includes("S.modal.type==='rm-file'") && js.includes('잔금 뒤 1년까지 보관한 다음 지웁니다') && js.includes('rm사진줄이기'), '화면 - 보내기 전에 받는 분 · 보관 기간을 묻고, 큰 사진은 줄여 보낸다');
ok(js.includes('data-act="rm-invite-p"') && js.includes('data-act="rm-kick-p"') && js.includes("kind:'prep'") && js.includes('function ctIcsHTML()') && js.includes('function ctExtHTML()'), '화면 - 대리인 초대 · 내보내기, 준비물 안내, 달력 구독, 다른 사무소 계약서');
ok(!/confirm\(|alert\(|prompt\(/.test(js.slice(js.indexOf('function rm도구HTML'), js.indexOf('function rm도구HTML') + 4000)), '화면 - 브라우저 기본 확인창을 쓰지 않는다');
{ const 안내 = js.slice(js.indexOf('const HELP = ['), js.indexOf('const HP = {'));
  ok((안내.match(/ id:'/g) || []).length === 6 && ['집 구하는 중', '계약 진행 중', '잔금 후'].every(g => 안내.includes(`g:'${g}'`)) && !/맞춤매물|매물지도|보고 싶어요/.test(안내),
     '쉬운 사용 안내 - 세 상황 · 안내 6개, 우리에게 없는 화면(맞춤매물 · 매물지도)은 쓰지 않는다'); }
ok(길.html().includes(".hp-t{margin:0;font-size:26px") && 길.html().includes(".hp-s{margin:0;font-size:20px") && js.includes("u.lang = 'ko-KR'") && js.includes("!h.startsWith('#/help')") && js.includes('#/help/room`'),
   '큰 글씨(26 · 20px) · 소리로 듣기 · 로그인 없이 열림 · 초대 문자에 사용 방법 링크');
/* 7. 2026-11-11 B 묶음 - 비공개 메모 · 적합도 · 지역 5곳 · 연락 방법 · 손님 내 계약 */
{ const F = await import('../api/feed.js'), PR = await import('../api/proposal.js');
  const 메 = F.물건메모({ who: '  박집주인 ', phone: '010-99a99-8888', nego: '5,000,000원', note: 'x'.repeat(900) });
  ok(메.who === '박집주인' && 메.phone === '010-9999-8888' && 메.nego === 5000000 && 메.note.length === 500 && F.물건메모({ who: ' ' }) === null
     && Object.keys(F.물건메모들({ 'bad-id': { who: 'a' }, '0b1c2d3e-4f50-4617-8899-aabbccddeeff': { note: '오후' } })).length === 1, '비공개 메모 다듬기 - 글 길이 · 번호 모양 · 빈 메모는 버린다');
  ok(PR.연락방법({ how: '문자', when: '저녁' }) === '문자 먼저 · 저녁에 편함' && PR.연락방법({ how: '해킹', when: '새벽' }) === '' && PR.연락방법({ how: '상관없음' }) === '전화 · 문자 상관없음', '연락 방법 - 고른 것만 한 줄로');
  const feed2 = fs.readFileSync(path.resolve(길.저장소, 'api/feed.js'), 'utf8'), pr2 = fs.readFileSync(path.resolve(길.저장소, 'api/proposal.js'), 'utf8'), dm = fs.readFileSync(path.resolve(길.저장소, 'api/demand.js'), 'utf8');
  ok(/settings\.lmemo/.test(feed2) && !/lmemo/.test(pr2) && /cpref:  connected \? /.test(feed2) && /contact_pref\|42703/.test(pr2) && /arr\(b\.dongs, 5\)/.test(dm),
     '서버 - 메모는 사무소 설정에만(제안 쪽 코드에 없음) · 연락 방법은 연결된 건에만 · 칸이 없어도 연결은 된다 · 새 조건 지역 5곳'); }
ok(js.includes('function 적합도(st)') && js.includes('내 물건과 맞는 새 손님') && js.includes("d.dongs.length >= 5") && js.includes("MOVE_FLEX = ['딱 그때', '앞뒤 2주', '한두 달 여유']")
   && js.includes("data-act=\"cn-how\"") && js.includes('function gm막대(r)') && js.includes('LM_비번'), '화면 - 적합도 · 새 손님 알림 · 지역 5곳 · 날짜 여유 · 연락 방법 · 내 계약 단계 · 비밀번호 거르기');
/* 8. 화면 고르는 갈래가 끊기지 않는다 (2026-11-11 - 사이에 끼운 한 줄 때문에 #/help/… 가 첫 화면으로 덮였다) */
{ const 처음 = js.indexOf("  if(h.startsWith('#/proposal/')) html = V['#/proposal'](parts[2]);"), 끝 = js.indexOf("  else html = (V[h] || V['#/'])();");
  const 줄들 = js.slice(처음, 끝).split('\n').slice(1).filter(Boolean);
  ok(처음 > 0 && 끝 > 처음 && 줄들.every(l => /^  else if\(/.test(l)), '화면 고르는 if … else if 사이에 다른 문장이 끼어 있지 않다'); }
{ const 도 = js.slice(js.indexOf('const PHELP = ['), js.indexOf('const PHELP보임'));
  ok((도.match(/ id:'/g) || []).length === 17 && !/매칭 관리/.test(도) && js.includes("!(a.ct && 계약막힘())") && js.includes('function 도움말단추()') && js.includes("localStorage.setItem('bk.tour', '1')"),
     '중개사 도움말 - 17개(11-12 매물장부 노출 · 계약현황 · 현장 체크리스트) · 우리에게 없는 화면은 안 씀 · 계약서 안내는 권한 있을 때만 · ? 단추 · 처음 쓸 때 말풍선은 한 번'); }
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
