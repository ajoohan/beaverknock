/* 계약진행 대화방 (2026-11-06 · 2026-11-07 당사자마다 따로) - 초대 표 · 자리 묶기 · 끊기 · 권한 · 말 다듬기 · 방 나눔 */
import * as 길 from './길.mjs';
let ran = 0, fail = 0;
const ok = (c, m) => { ran++; if (!c) fail++; console.log(`  ${c ? 'OK' : 'X '}  ${m}`); };
process.env.BK_URL = 'https://x.supabase.co'; process.env.BK_SECRET_KEY = 'k';
delete process.env.RESEND_API_KEY; delete process.env.SOLAPI_TPL_INVITE; delete process.env.SOLAPI_TPL_ROOM;

const CID = '11111111-2222-3333-4444-555555555555';
const 손님1 = { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'g1@x.com' }, 손님2 = { id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'g2@x.com' };
let 계약 = { id: CID, agent_id: 'a1', agent_user: 'u-boss', form: 'sale', title: '미사 아파트', status: 'sealed', track: null,
  doc_parties: { seller: { name: '김매도', phone: '010-1111-2222' }, buyer: { name: '이매수', phone: '010-3333-4444' } }, cd: '2026-11-01', md: '2026-11-20', bd: '2026-12-20' };
let 말들 = [], 불린 = [], 칸없음 = false;
globalThis.fetch = async (u, o = {}) => { u = String(u); const d = decodeURIComponent(u); const m = o.method || 'GET'; 불린.push({ d, m, b: o.body });
  if (/bk_contract_msg/.test(d)) {
    if (칸없음) return new Response(JSON.stringify({ code: '42703', message: 'column bk_contract_msg.thread does not exist' }), { status: 400 });
    if (m === 'POST') { const v = JSON.parse(o.body); const row = { id: 말들.length + 1, ...v, created_at: new Date().toISOString() }; 말들.push(row); return new Response(JSON.stringify([row])); }
    const 뒤 = +((/id=gt\.(\d+)/.exec(d) || [])[1] || 0); const 방 = (/thread=eq\.(\w+)/.exec(d) || [])[1];
    const 고른 = 말들.filter(x => x.id > 뒤 && (!방 || x.thread === 방)); return new Response(JSON.stringify(/order=id\.desc/.test(d) ? 고른.slice().reverse() : 고른));
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
const tok = R.초대표(CID, 'buyer', 0, 0);
ok(R.초대표읽기(tok)?.side === 'buyer' && !R.초대표읽기(tok.replace('buyer', 'seller')) && !R.초대표읽기(tok.slice(0, -2) + 'xx'), '초대 표 - 서명이 맞아야 하고 자리를 바꿔 쓸 수 없다');
ok(!R.초대표읽기(R.초대표(CID, 'buyer', 0, 0, Date.now() - 15 * 864e5)), '초대 표 - 14일이 지나면 열리지 않는다');
ok(!R.초대표읽기(C.초안표(CID, 0)) , '초안 표로 대화방에 들어올 수 없다(열쇠가 다르다)');
ok(R.말다듬기('900101-1234567 입니다').error && R.말다듬기('  ').error && R.말다듬기('a'.repeat(2000)).text.length === 1000, '말 다듬기 - 주민등록번호 · 빈 말은 거절, 1000자로 자른다');

/* 2. 초대 → 들어오기 */
let r = await 중({ what: 'room-invite', id: CID, side: 'buyer' });
ok(r.code === 200 && R.초대표읽기(r.body.token) && 계약.track && 계약.track.room && r.body.room, '날인본에서 초대 링크를 만들면 방이 생긴다');
const 표 = r.body.token;
계약 = { ...계약, status: 'draft' };
ok((await 중({ what: 'room-invite', id: CID, side: 'buyer' })).code === 409, '작성 중인 계약서에서는 초대하지 않는다');
계약 = { ...계약, status: 'sealed' };
ok((await 중({ what: 'room-invite', id: CID, side: 'lessee' })).code === 400, '계약서에 없는 당사자는 초대하지 않는다');
r = await 손(손님1, { what: 'invite-join', token: 표 });
ok(r.code === 200 && r.body.id === CID && 계약.track.room.buyer.uid === 손님1.id, '손님이 링크로 들어오면 그 자리에 계정이 묶인다');
ok((await 손(손님2, { what: 'invite-join', token: 표 })).code === 409, '다른 계정은 같은 자리에 들어오지 못한다');
ok((await 손(손님1, { what: 'invite-join', token: 표 })).body.already === true, '같은 분이 다시 누르면 그냥 들어간다');
{ const 앞 = 불린.filter(x => x.m === 'PATCH').length; await 손(손님1, { what: 'invite-join', token: 표 });
  ok(불린.filter(x => x.m === 'PATCH').length === 앞, '이미 든 분이 다시 누르면 track 을 새로 쓰지 않는다(일정 저장과 부딪히지 않게)'); }
ok((await 중({ what: 'room-invite', id: CID, side: 'buyer' })).code === 409, '들어온 자리는 다시 초대하지 않는다');
const 매도표 = (await 중({ what: 'room-invite', id: CID, side: 'seller' })).body.token;
ok((await 손(손님2, { what: 'invite-join', token: 매도표 })).code === 200 && 계약.track.room.seller.uid === 손님2.id, '매도인도 자기 링크로 들어온다');

/* 3. 말 주고받기 - 방은 당사자마다 따로 */
r = await 손(손님1, { what: 'my-room-send', id: CID, text: '잔금일 확인 부탁드려요' });
ok(r.code === 200 && 말들.length === 1 && 말들[0].side === 'buyer' && 말들[0].thread === 'buyer' && 말들[0].agent_id === 'a1', '손님 말은 그 손님 방(thread)에 남는다');
r = await 손(손님1, { what: 'my-room', id: CID });
ok(r.code === 200 && r.body.role === '매수인' && r.body.rows.length === 1 && r.body.steps.some(s => s.이름 === '잔금') && !('doc' in r.body) && !JSON.stringify(r.body).includes('010-1111-2222'), '손님 방 - 일정 · 대화만, 계약서 원문 · 다른 당사자 연락처는 없다');
ok((await 손({ id: 'cccccccc-0000-0000-0000-000000000003' }, { what: 'my-room', id: CID })).code === 403, '초대받지 않은 계정은 방을 못 연다');
r = await 중({ what: 'room-send', id: CID, side: 'buyer', text: '12월 20일 맞습니다' });
ok(r.code === 200 && 말들[1].side === 'agent' && 말들[1].thread === 'buyer' && 말들[1].name === '한상혁', '중개사 말은 고른 당사자 방에 남는다');
ok((await 중({ what: 'room-send', id: CID, text: '방을 안 고르면' })).code === 400, '중개사는 어느 당사자 방인지 골라야 보낸다');
await 중({ what: 'room-send', id: CID, side: 'seller', text: '매도인님 관리비 정산 안내' });
r = await 손(손님2, { what: 'my-room', id: CID });
ok(r.code === 200 && r.body.role === '매도인' && r.body.rows.length === 1 && !JSON.stringify(r.body).includes('잔금일 확인'), '매도인은 매수인 방의 말을 보지 못한다');
r = await 손(손님1, { what: 'my-room', id: CID });
ok(r.body.rows.length === 2 && !JSON.stringify(r.body).includes('관리비'), '매수인도 매도인 방의 말을 보지 못한다');
r = await 중({ what: 'room', id: CID, side: 'buyer', after: 1 });
ok(r.code === 200 && r.body.rows.length === 1 && r.body.rows[0].id === 2 && r.body.joined === true, '새 말만 받아 온다(마지막 번호 뒤 · 그 방만)');
r = await 중({ what: 'rooms' });
ok(r.code === 200 && r.body.rows.length === 2 && r.body.rows.find(x => x.side === 'buyer').last.id === 2 && r.body.rows.find(x => x.side === 'seller').last.id === 3, '중개사 목록 - 당사자마다 한 줄, 마지막 말도 방마다');
r = await 손(손님1, { what: 'my-rooms' });
ok(r.code === 200 && r.body.rows.length === 1 && r.body.rows[0].office === '비버공인중개사사무소', '마이페이지 - 내가 든 방 목록');

/* 4. 권한 · 끊기 */
const 보조 = { ...중개사, staff: { role: 'assistant', name: '이보조' } };
let res = 응답(); await R.roomAgent({ headers: {} }, res, 보조, { id: 'u-st' }, { what: 'room-invite', id: CID, side: 'seller' });
ok(res.code === 403, '중개보조원은 초대 링크를 못 만든다');
res = 응답(); await R.roomAgent({ headers: {} }, res, 보조, { id: 'u-st' }, { what: 'room-send', id: CID, side: 'buyer', text: '방문 일정 안내드립니다' });
ok(res.code === 200 && 말들[3].name === '이보조', '중개보조원도 대화는 한다');
res = 응답(); await R.roomAgent({ headers: {} }, res, { ...중개사, id: 'a2' }, 대표, { what: 'room', id: CID, side: 'buyer' });
ok(res.code === 404, '다른 사무소는 방을 못 연다');
/* 매수인을 내보내도 매도인 쪽은 그대로 */
r = await 중({ what: 'room-cut', id: CID, side: 'buyer' });
ok(r.code === 200 && !계약.track.room.buyer && 계약.track.room.seller && 계약.track.room.c.buyer === 1 && (계약.track.room.n || 0) === 0, '내보내기 - 그 자리만 비우고 그 자리의 링크만 끊는다');
ok((await 손(손님1, { what: 'my-room', id: CID })).code === 403 && (await 손(손님1, { what: 'invite-join', token: 표 })).code === 404, '내보낸 손님은 못 열고, 그 자리로 나간 링크도 끊긴다');
ok((await 손(손님2, { what: 'my-room', id: CID })).code === 200, '다른 당사자는 계속 쓴다');
const 새매수표 = (await 중({ what: 'room-invite', id: CID, side: 'buyer' })).body.token;
ok(R.초대표읽기(새매수표).c === 1, '새 초대 링크는 끊긴 횟수를 담는다');
r = await 손(손님2, { what: 'invite-join', token: 새매수표 });
ok(r.code === 409 && /매도인/.test(r.body.error) && !계약.track.room.buyer, '한 계정은 한 계약에서 한 자리만 - 매도인으로 든 계정은 매수인 자리에 못 든다');
r = await 손({ id: 'u-boss' }, { what: 'invite-join', token: 새매수표 });
ok(r.code === 409 && r.body.office === true && !계약.track.room.buyer, '사무소 계정(대표 · 계약서를 쓴 분)은 손님 자리에 들어가지 않는다');
r = await 중({ what: 'room-cut', id: CID });
ok(r.code === 200 && 계약.track.room.n === 1 && (await 손(손님1, { what: 'invite-join', token: 새매수표 })).code === 404, '모두 끊기 - 나간 초대 링크가 전부 끊긴다');

/* 5. track 이 방을 지킨다 */
ok(C.trackCheck({ room: { n: 2, buyer: { uid: 손님1.id, at: 'x' }, hacker: { uid: 'y' } } }).room.n === 2 && !('hacker' in C.trackCheck({ room: { n: 0, hacker: { uid: 'y' } } }).room), 'trackCheck - 자리 여덟 가지만 남긴다');
ok(JSON.stringify(C.trackCheck({ room: { n: 0, c: { buyer: 2, hacker: 3, seller: -1 } } }).room.c) === '{"buyer":2}', 'trackCheck - 자리 끊김 횟수도 여덟 자리 · 양수만');

/* 6. 0035 전이면 준비 중 */
칸없음 = true;
r = await 중({ what: 'room', id: CID, side: 'seller' });
ok(r.code === 503 && r.body.need === '0035', 'thread 칸이 없으면 0035 마이그레이션이 필요하다고 알린다');
칸없음 = false;
/* 6-1. 목록은 최근 말이 오간 방이 위로 */
{ const 옛말 = 말들;
  말들 = [{ id: 900, contract_id: CID, thread: 'seller', side: 'agent', body: '매도인께', created_at: '2026-11-07T00:00:00Z' }];
  let x = await 중({ what: 'rooms' });
  const 첫1 = x.body.rows[0].side;
  말들.push({ id: 901, contract_id: CID, thread: 'buyer', side: 'buyer', body: '매수인 질문', created_at: '2026-11-07T00:01:00Z' });
  x = await 중({ what: 'rooms' });
  ok(첫1 === 'seller' && x.body.rows[0].side === 'buyer' && x.body.rows[0].last.id === 901, '대화방 목록 - 최근에 말이 오간 방이 위로 올라온다');
  말들 = 옛말; }

/* 7. 화면 */
const js = 길.js();
ok(js.includes("else if(h.startsWith('#/invite/')) html = V['#/invite'](parts[2]);") && js.includes("else if(h.startsWith('#/room/')) html = V['#/room'](parts[2]);")
  && js.includes("if(h.startsWith('#/room/') && 로그인전()){"), '화면 - 초대 · 손님 방 주소, 방은 로그인 뒤');
ok(js.includes("['#/partner/rooms', '손님 대화', 'chat', 'rm']") && js.includes('${ct방HTML(doc)}') && js.includes("S.modal.type==='rm-invite'"), '화면 - 손님 대화 메뉴 · 일정·체크 탭의 초대 · 초대 링크 창');
ok(js.includes("const 곳 = /^(invite-join|my-)/.test(body.what) ? '/api/my' : '/api/feed';"), '화면 - 손님 요청은 /api/my, 사무소 요청은 /api/feed');
ok(js.includes("html = V['#/partner/rooms'](parts[3], parts[4]);") && js.includes('data-go="#/partner/rooms/${esc(r.id)}/${esc(r.side)}"'), '화면 - 중개사 방 주소는 계약서/당사자');
ok(js.includes("if(처음 || !C.meta || status === 403 || status === 404)"), '화면 - 새 말 확인이 한 번 실패해도 대화를 가리지 않는다');
ok(js.includes("if(C.loading){ if(!처음) C.또 = true; return; }") && js.includes('if(처음 || 새.length || 살아남)') && js.includes("if(C.gone && !처음) return;"), '화면 - 보낸 말은 읽는 중이어도 곧바로 다시 읽고, 처음 실패한 빈 방도 열리면 다시 그린다 · 내보내진 방은 그만 묻는다');
ok(js.includes("이 계약서에는 아직 대화방이 없습니다"), '화면 - 대화방이 없는 계약서 주소는 여는 중에 멈추지 않는다');
ok(js.includes("Date.now() - RM.listAt > 30e3") && js.includes("RM.list = null;   /* 손님 대화 목록에 새 방이 바로 보이게 */"), '화면 - 목록은 30초마다 · 초대하면 바로 새로');
ok(js.includes("data-keep=\"rm\"") && js.includes("[...app.querySelectorAll('[data-keep]')]") && js.includes('if(처음 || 아래였나 || C.보냄)'), '화면 - 다시 그려도 대화 스크롤을 지키고, 예전 말을 읽는 중이면 끌어내리지 않는다');
ok(js.includes("${tabbar('rm','p')}") && js.includes('data-go="#/partner/rooms">목록</button>'), '화면 - 휴대폰: 엉뚱한 탭이 켜지지 않고, 방에서 목록으로 돌아간다');
ok(js.includes("RM.mine = null; RM.cur = null; go('#/room/' + j.id);") && js.includes('if(RM.cur !== C){ if(!손님) RM.listAt = 0;')
  && js.includes('if(status === 400 || status === 403 || status === 404) C.gone = true;'), '화면 - 다시 들어온 방은 처음부터 읽고, 보내는 중 방을 옮겨도 지금 방을 건드리지 않고, 같은 답일 실패는 그만 묻는다');
ok(js.includes('${보조원() ? \'\' : `<a class="btn tool sm" data-go="#/partner/contract/${esc(id)}">계약서</a>`}</div></div>')
  && js.includes("rm대화HTML(C, v => v.side === 'agent', 들어옴 ? '' :") && js.includes("const 표지 = a === 'rm-kick' ? v : '*';"), '화면 - 보조원은 계약서 단추 없음 · 안 들어온 방은 쓰는 칸 대신 까닭 · 모두 끊기도 두 번');
console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
