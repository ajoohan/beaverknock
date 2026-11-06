/* 계약진행 대화방 (2026-11-06) - 초대 표 · 자리 묶기 · 끊기 · 권한 · 말 다듬기 */
import * as 길 from './길.mjs';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
delete process.env.RESEND_API_KEY; delete process.env.SOLAPI_TPL_INVITE; delete process.env.SOLAPI_TPL_ROOM;

const CID = '11111111-2222-3333-4444-555555555555';
const 손님1 = { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'g1@x.com' }, 손님2 = { id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'g2@x.com' };
let 계약 = { id: CID, agent_id: 'a1', agent_user: 'u-boss', form: 'sale', title: '미사 아파트', status: 'sealed', track: null,
  doc_parties: { seller: { name: '김매도', phone: '010-1111-2222' }, buyer: { name: '이매수', phone: '010-3333-4444' } }, cd: '2026-11-01', md: '2026-11-20', bd: '2026-12-20' };
let 말들 = [], 불린 = [];
globalThis.fetch = async (u, o = {}) => { u = String(u); const d = decodeURIComponent(u); const m = o.method || 'GET'; 불린.push({ d, m, b: o.body });
  if (/bk_contract_msg/.test(d)) {
    if (m === 'POST') { const v = JSON.parse(o.body); const row = { id: 말들.length + 1, ...v, created_at: new Date().toISOString() }; 말들.push(row); return new Response(JSON.stringify([row])); }
    const 뒤 = +((/id=gt\.(\d+)/.exec(d) || [])[1] || 0); return new Response(JSON.stringify(말들.filter(x => x.id > 뒤)));
  }
  if (/bk_contract\?/.test(d) && m === 'PATCH') {
    const 판 = (/track->>tv=eq\.(\d+)/.exec(d) || [])[1]; const 지금 = 계약.track || {};
    if (판 && +판 !== (지금.tv || 0)) return new Response('[]');
    계약 = { ...계약, track: JSON.parse(o.body).track }; return new Response(JSON.stringify([{ id: CID }]));
  }
  if (/bk_contract\?/.test(d)) {
    if (/agent_id=eq\.a2/.test(d)) return new Response('[]');
    if (/track->room->\w+->>uid=eq\./.test(d)) { const [, k, uid] = /track->room->(\w+)->>uid=eq\.([0-9a-f-]+)/.exec(d); return new Response(JSON.stringify(계약.track && 계약.track.room && 계약.track.room[k] && 계약.track.room[k].uid === uid ? [계약] : [])); }
    return new Response(JSON.stringify([계약]));
  }
  if (/bk_agent\?/.test(d)) return new Response(JSON.stringify([{ id: 'a1', office: '비버공인중개사사무소', phone: '031-000-0000', user_id: 'u-boss' }]));
  return new Response('[]'); };

const R = await import('../api/_room.js');
const C = await import('../api/_contract.js');
const 응답 = () => { const r = { code: 0, body: null }; r.status = c => (r.code = c, r); r.json = b => (r.body = b, r); return r; };
const 중개사 = { id: 'a1', role: 'agent', office: '비버공인중개사사무소', name: '한상혁' }, 대표 = { id: 'u-boss' };
const 중 = async b => { const res = 응답(); await R.roomAgent({ headers: {} }, res, 중개사, 대표, b); return res; };
const 손 = async (u, b) => { const res = 응답(); await R.roomGuest({ headers: {} }, res, u, b); return res; };

/* 1. 표 */
const tok = R.초대표(CID, 'buyer', 0);
ok(R.초대표읽기(tok)?.side === 'buyer' && !R.초대표읽기(tok.replace('buyer', 'seller')) && !R.초대표읽기(tok.slice(0, -2) + 'xx'), '초대 표 - 서명이 맞아야 하고 자리를 바꿔 쓸 수 없다');
ok(!R.초대표읽기(R.초대표(CID, 'buyer', 0, Date.now() - 15 * 864e5)), '초대 표 - 14일이 지나면 열리지 않는다');
ok(!R.초대표읽기(C.초안표(CID, 0)) , '초안 표로 대화방에 들어올 수 없다(열쇠가 다르다)');
ok(R.말다듬기('900101-1234567 입니다').error && R.말다듬기('  ').error && R.말다듬기('a'.repeat(2000)).text.length === 1000, '말 다듬기 - 주민등록번호 · 빈 말은 거절, 1000자로 자른다');

/* 2. 초대 → 들어오기 */
let r = await 중({ what: 'room-invite', id: CID, side: 'buyer' });
ok(r.code === 200 && R.초대표읽기(r.body.token) && 계약.track && 계약.track.room, '날인본에서 초대 링크를 만들면 방이 생긴다');
const 표 = r.body.token;
계약 = { ...계약, status: 'draft' };
ok((await 중({ what: 'room-invite', id: CID, side: 'buyer' })).code === 409, '작성 중인 계약서에서는 초대하지 않는다');
계약 = { ...계약, status: 'sealed' };
ok((await 중({ what: 'room-invite', id: CID, side: 'lessee' })).code === 400, '계약서에 없는 당사자는 초대하지 않는다');
r = await 손(손님1, { what: 'invite-join', token: 표 });
ok(r.code === 200 && r.body.id === CID && 계약.track.room.buyer.uid === 손님1.id, '손님이 링크로 들어오면 그 자리에 계정이 묶인다');
ok((await 손(손님2, { what: 'invite-join', token: 표 })).code === 409, '다른 계정은 같은 자리에 들어오지 못한다');
ok((await 손(손님1, { what: 'invite-join', token: 표 })).body.already === true, '같은 분이 다시 누르면 그냥 들어간다');
ok((await 중({ what: 'room-invite', id: CID, side: 'buyer' })).code === 409, '들어온 자리는 다시 초대하지 않는다');

/* 3. 말 주고받기 */
r = await 손(손님1, { what: 'my-room-send', id: CID, text: '잔금일 확인 부탁드려요' });
ok(r.code === 200 && 말들.length === 1 && 말들[0].side === 'buyer' && 말들[0].agent_id === 'a1', '손님 말이 남는다(자리 · 사무소와 함께)');
r = await 손(손님1, { what: 'my-room', id: CID });
ok(r.code === 200 && r.body.role === '매수인' && r.body.rows.length === 1 && r.body.steps.some(s => s.이름 === '잔금') && !('doc' in r.body) && !JSON.stringify(r.body).includes('010-1111-2222'), '손님 방 - 일정 · 대화만, 계약서 원문 · 다른 당사자 연락처는 없다');
ok((await 손(손님2, { what: 'my-room', id: CID })).code === 403, '초대받지 않은 계정은 방을 못 연다');
r = await 중({ what: 'room-send', id: CID, text: '12월 20일 맞습니다' });
ok(r.code === 200 && 말들[1].side === 'agent' && 말들[1].name === '한상혁', '중개사 말이 남는다');
r = await 중({ what: 'room', id: CID, after: 1 });
ok(r.code === 200 && r.body.rows.length === 1 && r.body.rows[0].id === 2, '새 말만 받아 온다(마지막 번호 뒤)');
r = await 손(손님1, { what: 'my-rooms' });
ok(r.code === 200 && r.body.rows.length === 1 && r.body.rows[0].office === '비버공인중개사사무소', '마이페이지 - 내가 든 방 목록');

/* 4. 권한 · 끊기 */
const 보조 = { ...중개사, staff: { role: 'assistant', name: '이보조' } };
let res = 응답(); await R.roomAgent({ headers: {} }, res, 보조, { id: 'u-st' }, { what: 'room-invite', id: CID, side: 'seller' });
ok(res.code === 403, '중개보조원은 초대 링크를 못 만든다');
res = 응답(); await R.roomAgent({ headers: {} }, res, 보조, { id: 'u-st' }, { what: 'room-send', id: CID, text: '방문 일정 안내드립니다' });
ok(res.code === 200 && 말들[2].name === '이보조', '중개보조원도 대화는 한다');
res = 응답(); await R.roomAgent({ headers: {} }, res, { ...중개사, id: 'a2' }, 대표, { what: 'room', id: CID });
ok(res.code === 404, '다른 사무소는 방을 못 연다');
const 새표 = (await 중({ what: 'room-invite', id: CID, side: 'seller' })).body.token;
r = await 중({ what: 'room-cut', id: CID, side: 'buyer' });
ok(r.code === 200 && !계약.track.room.buyer && 계약.track.room.n === 1, '내보내기 - 자리를 비우고 링크 번호를 올린다');
ok((await 손(손님1, { what: 'my-room', id: CID })).code === 403 && (await 손(손님2, { what: 'invite-join', token: 새표 })).code === 404, '내보낸 손님은 못 열고, 그 전에 나간 링크도 끊긴다');

/* 5. track 이 방을 지킨다 */
ok(C.trackCheck({ room: { n: 2, buyer: { uid: 손님1.id, at: 'x' }, hacker: { uid: 'y' } } }).room.n === 2 && !('hacker' in C.trackCheck({ room: { n: 0, hacker: { uid: 'y' } } }).room), 'trackCheck - 자리 여덟 가지만 남긴다');

/* 6. 화면 */
const js = 길.js();
ok(js.includes("else if(h.startsWith('#/invite/')) html = V['#/invite'](parts[2]);") && js.includes("else if(h.startsWith('#/room/')) html = V['#/room'](parts[2]);")
  && js.includes("if(h.startsWith('#/room/') && 로그인전()){"), '화면 - 초대 · 손님 방 주소, 방은 로그인 뒤');
ok(js.includes("['#/partner/rooms', '손님 대화', 'chat', 'rm']") && js.includes('${ct방HTML(doc)}') && js.includes("S.modal.type==='rm-invite'"), '화면 - 손님 대화 메뉴 · 일정·체크 탭의 초대 · 초대 링크 창');
ok(js.includes("const 곳 = /^(invite-join|my-)/.test(body.what) ? '/api/my' : '/api/feed';"), '화면 - 손님 요청은 /api/my, 사무소 요청은 /api/feed');
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
