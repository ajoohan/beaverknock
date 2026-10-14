/* 조건 접수를 클라이언트 payload 부터 서버 INSERT 까지 통째로 돌려 본다.
   DB 는 흉내만 낸다 - 실제로 저장하지 않고, **무엇이 나가는지**를 붙잡아 본다.
   어제 실패한 것이 무엇 때문인지 로그가 사라져서, 나가는 값 자체를 들여다본다. */
import fs from 'node:fs';
import * as 길 from './길.mjs';

process.env.BK_URL = 'https://fake.supabase.co';
process.env.BK_SECRET_KEY = 'x'.repeat(40);
process.env.PORTONE_API_SECRET = 'test-secret';   /* 본인확인이 켜진 상태를 흉내 */
process.env.RESEND_API_KEY = '';

const html = 길.html();
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
const grab = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); return js.slice(i, j); };

/* 클라이언트의 payload 만든이를 그대로 꺼내 쓴다 */
const NONHOME_SRC = grab('const NONHOME', '\n');
const PAY_SRC = grab('function demandPayload(d, slotN){', '\nfunction saveDemand');
/* 함수 하나만 중괄호 깊이로 정확히 잘라낸다 - 문자열 검색으로 끝을 잡으면
   수천 줄을 딸려온다(지도 코드까지 따라와 document 를 찾았다). */
const grabFn = head => {
  const i = js.indexOf(head);
  let d = 0, j = i;
  for (; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (d === 0) return js.slice(i, j + 1); }
  }
  throw new Error('못 찾음 ' + head);
};
const MOVE_SRC = grabFn('function moveText(d){');

/* S 와 몇 가지 전역을 흉내 낸다 - payload 만든이가 그것들을 읽는다 */
const mk = new Function('S','location','navigator', `
  ${NONHOME_SRC}
  ${MOVE_SRC}
  ${PAY_SRC}
  return demandPayload;`)({ idvToken: null, draft: {}, form: {} }, { hostname:'beaverknock.co.kr' }, { userAgent:'node-test' });

/* 손님이 실제로 채울 법한 조건 - 주거 월세 */
const draft = {
  who:'본인', kind:'home', deal:'월세',
  dongs:['미사1동','미사2동'],
  dep:'100000000', rent:'650000',
  htype:['아파트'], rooms:'3룸',
  musts:['주차 가능','엘리베이터'], mustFree:'붙박이장 있으면 좋겠습니다',
  hArea:['66~99㎡'], hBath:'2개', hFloor:['중층'], hDir:['남'], hAge:['10년 이내'],
  floor:'1층 제외', house:'3인', elev:'필요', loan:'있음',
  openWhen:'협의', moveWhen:'날짜 지정', moveMonth:'2026-11', movePart:'초',
  memo:'아이 학교 때문에 단지 안이면 좋겠습니다',
  name:'한상혁', phone:'010-1234-5678', verified:true,
  pref:'문자·카톡', times:['저녁'], a1:true, a2:true,
};

const { signIdv } = await import(길.api('idv.js'))
  .then(() => import(길.api('_idv.js')));

/* ── 네 유형을 모두 돌린다 ── */
const KINDS = {
  home:    { ...draft },
  shop:    { who:'본인', kind:'shop', dongs:['미사역 상권'], biz:'카페·디저트',
             dep:'50000000', rent:'1800000', key:'30000000', areaMin:'12', areaMax:'30',
             keyOk:'협의 가능', signNeed:'필요', parkNeed:'2', shopNote:'코너 자리면 좋겠습니다',
             shopFloorFree:'1층만', facFree:'후드·덕트 필요', openWhen:'즉시',
             memo:'주말 장사 위주입니다', name:'한상혁', phone:'010-1234-5678',
             pref:'문자·카톡', times:['저녁'], a1:true, a2:true },
  office:  { who:'본인', kind:'office', dongs:['미사1동'], dep:'30000000', rent:'1200000',
             areaMin:'20', areaMax:'40', headcount:'12', bldType:'지식산업센터',
             parkNeed:'3', openWhen:'협의', memo:'', name:'한상혁', phone:'010-1234-5678',
             pref:'문자·카톡', times:[], a1:true, a2:true },
  storage: { who:'본인', kind:'storage', dongs:['미사1동'], dep:'20000000', rent:'900000',
             areaMin:'50', areaMax:'120', ceilH:'6', dock:'필요', temp:'상온',
             parkNeed:'1', openWhen:'즉시', memo:'', name:'한상혁', phone:'010-1234-5678',
             pref:'문자·카톡', times:[], a1:true, a2:true },
};

/* ── DB 흉내 ── */
let sentRow = null;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = (opt.method || 'GET').toUpperCase();
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'11111111-2222-3333-4444-555555555555', email:'a@b.c' }), { status:200 });
  if (u.includes('bk_demand') && m === 'POST') { sentRow = JSON.parse(opt.body); return new Response('', { status:201 }); }
  return new Response('[]', { status:200 });
};
const { default: handler } = await import(길.api('demand.js'));

let fail = 0;
for (const [name, d] of Object.entries(KINDS)) {
  sentRow = null;
  const body = mk(d, 5);
  body.idv_token = signIdv({ name:'한상혁', phone:'01012345678', birth:'19850101', op:'SKT' });
  body.agree_third_party = true; body.agree_multi_alert = true;
  body.elapsed = 9000; body.website = '';
  const res = { code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } };
  /* 연타 제한을 피하려고 IP 를 바꿔 준다 */
  await handler({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
    socket:{ remoteAddress:'10.1.2.' + Math.floor(Math.random()*200) }, body }, res);

  const bad = [];
  if (sentRow) for (const [k, v] of Object.entries(sentRow)) {
    if (v === undefined) bad.push(k + ': undefined');
    else if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k + ': ' + v);
    else if (typeof v === 'string' && v === 'Invalid Date') bad.push(k + ': "Invalid Date"');
  }
  const keep = sentRow ? ['open_when','when_text','spec','area_min','area_max','park_need','key_money','biz']
        .map(k => k + '=' + JSON.stringify(sentRow[k])).join('  ') : '(INSERT 없음)';
  const ok = res.code === 201 && sentRow && !bad.length;
  if (!ok) fail++;
  console.log((ok ? '  OK  ' : '  X   ') + name.padEnd(8) + ' ' + res.code + '  ' + keep);
  if (bad.length) console.log('        의심: ' + bad.join(' · '));
  if (res.code !== 201) console.log('        응답: ' + JSON.stringify(res.body).slice(0,160));
}
console.log((fail ? fail + '개 실패' : '네 유형 모두 이상 없음'));

/* ── 같은 전달을 두 번 받지 않는다 (2026-10-13, 0029) ──
   통신이 끊겨 답을 못 받은 손님이 다시 누르면 같은 번호(client_req)로 온다. */
{
  const 보내기 = async (번호, 표상태) => {
    sentRow = null;
    globalThis.fetch = async (url, opt = {}) => {
      const u = String(url), m = (opt.method || 'GET').toUpperCase();
      if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'11111111-2222-3333-4444-555555555555', email:'a@b.c' }), { status:200 });
      if (표상태 === '조회' && u.includes('bk_demand') && m === 'GET' && u.includes('client_req=eq.')) return new Response('[{"id":"d-already"}]', { status:200 });
      if (u.includes('bk_demand') && m === 'POST') {
        const row = JSON.parse(opt.body);
        if (표상태 === '칸없음' && 'client_req' in row)
          return new Response(JSON.stringify({ code:'PGRST204', message:"Could not find the 'client_req' column of 'bk_demand' in the schema cache" }), { status:400 });
        if (표상태 === '이미' && row.client_req)
          return new Response(JSON.stringify({ code:'23505', message:'duplicate key value violates unique constraint "bk_demand_client_req_idx"' }), { status:409 });
        sentRow = row; return new Response('', { status:201 });
      }
      return new Response('[]', { status:200 });
    };
    const body = mk({ ...KINDS.home, reqId: 번호 }, 5);
    body.idv_token = signIdv({ name:'한상혁', phone:'01012345678', birth:'19850101', op:'SKT' });
    body.elapsed = 9000; body.website = '';
    const res = { code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } };
    await handler({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) },
      socket:{ remoteAddress:'10.9.' + Math.floor(Math.random()*200) + '.' + Math.floor(Math.random()*200) }, body }, res);
    return res;
  };
  const 처음 = await 보내기('r-test-0001abcd', '새');
  const t1 = 처음.code === 201 && sentRow && sentRow.client_req === 'r-test-0001abcd';
  if (!t1) fail++;
  console.log((t1 ? '  OK  ' : '  X   ') + '전달 번호가 표에 함께 들어간다 (' + 처음.code + ')');
  const 두번째 = await 보내기('r-test-0001abcd', '이미');
  const t2 = 두번째.code === 200 && 두번째.body && 두번째.body.already === true && 두번째.body.ok === true;
  if (!t2) fail++;
  console.log((t2 ? '  OK  ' : '  X   ') + '같은 번호로 다시 오면 "이미 받았다" 로 성공 답한다 - 중복 행·중복 알림 없음 (' + 두번째.code + ')');
  const 조회 = await 보내기('r-test-0003abcd', '조회');
  const t5 = 조회.code === 200 && 조회.body && 조회.body.already === true && sentRow === null;
  if (!t5) fail++;
  console.log((t5 ? '  OK  ' : '  X   ') + '이미 저장된 번호면 저장도 빈도 제한도 거치기 전에 "이미 받았다" 로 답한다 (' + 조회.code + ')');
  {
    const 서버 = fs.readFileSync(new URL(길.api('demand.js')), 'utf8');
    const 자리 = 서버.indexOf('const 요청번호 = ');
    const 먼저 = 자리 > 0 && 자리 < 서버.indexOf('if (hit.length > BURST_MAX)') && 자리 < 서버.indexOf('WINDOW_MIN * 60_000')
              && 서버.indexOf('hit.push(now)') < 자리;
    if (!먼저) fail++;
    console.log((먼저 ? '  OK  ' : '  X   ') + '이미 받은 전달인지를 빈도 제한(연타·10분)이 막기 전에 본다 - 세기는 그보다 먼저');
    const 뒤 = 자리 > 서버.indexOf('readIdv(b.idv_token)') && 자리 > 서버.indexOf('if (bad) return');
    if (!뒤) fail++;
    console.log((뒤 ? '  OK  ' : '  X   ') + '다만 본인확인·값 검사 뒤에 본다 - 표 없는 가짜 요청이 빈도 제한 없이 DB 를 두드리지 못한다');
  }
  /* 표 없는 요청은 번호가 있어도 DB 조회까지 가지 않는다 */
  {
    let 조회수 = 0;
    globalThis.fetch = async (url, opt = {}) => { if (String(url).includes('client_req=eq.')) 조회수++; return new Response('[]', { status:200 }); };
    const res = { code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } };
    await handler({ method:'POST', headers:{}, socket:{ remoteAddress:'10.77.1.1' },
      body:{ elapsed:9999, website:'', client_req:'rforged12345', kind:'home', dongs:['미사1동'] } }, res);
    const t6 = res.code === 401 && 조회수 === 0;
    if (!t6) fail++;
    console.log((t6 ? '  OK  ' : '  X   ') + '본인확인 표 없는 요청은 번호가 있어도 DB 조회 없이 막힌다 (' + res.code + ', 조회 ' + 조회수 + ')');
  }
  /* 본인확인 표 하나로 번호만 바꿔 가며 보내도 조회가 빈도 제한 밖에 남지 않는다 */
  {
    let 조회수 = 0, 막힘 = 0;
    globalThis.fetch = async (url, opt = {}) => {
      const u = String(url), m = (opt.method || 'GET').toUpperCase();
      if (u.includes('client_req=eq.')) { 조회수++; return new Response('[]', { status:200 }); }
      if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id:'11111111-2222-3333-4444-555555555555' }), { status:200 });
      if (m === 'POST') return new Response('', { status:201 });
      return new Response('[]', { status:200 });
    };
    const 표 = signIdv({ name:'한상혁', phone:'01012345678', birth:'19850101', op:'SKT' });
    let n = 0;
    for (; n < 30; n++) {
      const body = mk({ ...KINDS.home, reqId: 'rspam' + String(n).padStart(8, '0') }, 5);
      body.idv_token = 표; body.elapsed = 9000; body.website = '';
      const res = { code:0, body:null, setHeader(){}, status(c){ this.code=c; return this; }, json(b){ this.body=b; return this; } };
      await handler({ method:'POST', headers:{ authorization:'Bearer ' + 'y'.repeat(40) }, socket:{ remoteAddress:'10.88.8.8' }, body }, res);
      if (res.code === 429) 막힘++;
    }
    const t7 = 막힘 >= 20 && 조회수 <= 9;
    if (!t7) fail++;
    console.log((t7 ? '  OK  ' : '  X   ') + `한 IP 에서 번호만 바꿔 30번 보내면 대부분 막히고 조회도 끝없이 하지 않는다 (막힘 ${막힘}, 조회 ${조회수})`);
  }
  const 칸없음 = await 보내기('r-test-0002abcd', '칸없음');
  const t3 = 칸없음.code === 201 && sentRow && !('client_req' in sentRow);
  if (!t3) fail++;
  console.log((t3 ? '  OK  ' : '  X   ') + '0029 를 아직 안 돌렸으면 번호 칸만 빼고 저장한다 - 접수는 산다 (' + 칸없음.code + ')');
  const 이상한번호 = await 보내기('<script>', '새');
  const t4 = 이상한번호.code === 201 && sentRow && sentRow.client_req === null;
  if (!t4) fail++;
  console.log((t4 ? '  OK  ' : '  X   ') + '모양이 이상한 번호는 받지 않는다(null)');
}
process.exit(fail ? 1 : 0);
