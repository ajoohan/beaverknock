/* 창구 — 본인확인을 두 곳(KG이니시스 간편인증 · 다날 문자)으로 연다.
   ── 왜 있나 (2026-10-06) ──
   지금까지는 채널 키가 하나뿐이었다(PORTONE_CHANNEL_KEY). 두 곳이 다 실계약을
   마쳤으니 손님이 고르게 한다. 여기서 지키는 것:
   · 키를 옮겨 넣는 사이에도 본인확인이 꺼지지 않는다 (예전 키로 물러선다)
   · 한 곳만 붙어 있으면 버튼도 하나다 - 고를 것이 없는데 고르게 하지 않는다
   · 고른 창구의 키로 창을 연다 - 버튼 글과 실제 창구가 어긋나면 안 된다 */
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };

const 기본 = { PORTONE_API_SECRET: 's', PORTONE_STORE_ID: 'store-1', BK_SECRET_KEY: 'x'.repeat(40) };
const 키들 = ['PORTONE_CHANNEL_KEY', 'PORTONE_CHANNEL_KEY_INICIS', 'PORTONE_CHANNEL_KEY_DANAL', 'PORTONE_LIVE'];
const { default: idv } = await import(길.api('idv.js'));

async function 물어보기(env){
  for(const k of [...키들, ...Object.keys(기본)]) delete process.env[k];
  Object.assign(process.env, env);
  let 답 = null, 상태 = 0;
  const res = { setHeader(){}, status(c){ 상태 = c; return this; }, json(j){ 답 = j; return this; } };
  await idv({ method: 'GET', headers: {} }, res);
  return { 상태, 답 };
}

/* ── 서버 ── */
{
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY_INICIS: 'ch-ini', PORTONE_CHANNEL_KEY_DANAL: 'ch-dan', PORTONE_LIVE: '1' });
  ok(답.enabled === true && 답.live === true, '둘 다 있으면 켜지고 실계약으로 읽힌다');
  ok(Array.isArray(답.channels) && 답.channels.length === 2, '창구 둘을 내려보낸다');
  ok(답.channels[0].k === 'inicis' && 답.channels[1].k === 'danal', '간편인증이 먼저, 문자가 다음');
  ok(답.channels[0].key === 'ch-ini' && 답.channels[1].key === 'ch-dan', '각 창구에 제 키가 붙는다');
  ok(답.channel_key === 'ch-ini', '예전 화면이 읽던 channel_key 도 남아 있다');
  ok(!('PORTONE_API_SECRET' in 답) && !JSON.stringify(답).includes('"s"'), 'API Secret 은 내려가지 않는다');
}
{
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY_DANAL: 'ch-dan' });
  ok(답.enabled && 답.channels.length === 1 && 답.channels[0].k === 'danal', '다날만 있으면 다날 하나');
}
{
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY: 'ch-old' });
  ok(답.enabled && 답.channels.length === 1 && 답.channels[0].k === 'one' && 답.channels[0].key === 'ch-old',
     '새 키가 비어 있으면 예전 한 개짜리 키로 물러선다 (옮기는 사이에 꺼지지 않는다)');
}
{
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY: 'ch-old', PORTONE_CHANNEL_KEY_INICIS: 'ch-ini' });
  ok(답.channels.length === 1 && 답.channels[0].key === 'ch-ini', '새 키가 하나라도 있으면 예전 키는 쓰지 않는다');
}
{
  const { 답 } = await 물어보기({ ...기본 });
  ok(답.enabled === false, '키가 하나도 없으면 꺼져 있다');
}
{
  /* LIVE=1 만 먼저 넣고 새 키가 없으면 예전 키(시험 채널)로 열리고, 결과 확인은
     LIVE 만 받으므로 모든 인증이 거절된다. 그 상태가 겉으로 보여야 한다. */
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY: 'ch-old', PORTONE_LIVE: '1' });
  ok(답.warn === 'live-legacy-key', '실계약인데 예전 키로 물러섰으면 경고를 내보낸다');
  /* 모듈을 새로 불러 '처음 뜬 인스턴스' 에서 잰다 - 앞에서 이미 남긴 뒤에 세면
     경고를 아예 안 남겨도 0줄이라 통과했다 */
  const { default: 새idv } = await import(길.api('idv.js') + '?새것=' + Date.now());
  const 원래 = console.error; let 줄 = 0; console.error = (...a) => { if(String(a[0]).includes('PORTONE_LIVE=1')) 줄++; };
  const 한번 = async () => { const res = { setHeader(){}, status(){ return this; }, json(){ return this; } };
    await 새idv({ method: 'GET', headers: {} }, res); };
  await 한번(); const 첫 = 줄;
  for(let i = 0; i < 5; i++) await 한번();
  console.error = 원래;
  ok(첫 === 1, '설정이 어긋났으면 서버 기록에 경고를 남긴다 (처음 한 번)');
  ok(줄 === 1, '방문마다 같은 경고를 쌓지 않는다 - 다섯 번 더 불러도 그대로 1줄');
  const { 답: 정상 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY_INICIS: 'ch-ini', PORTONE_LIVE: '1' });
  ok(!('warn' in 정상), '새 키가 있으면 경고가 없다');
}
ok(/S\.idvCfg\.warn === 'live-legacy-key'/.test(길.js()), '운영 화면이 그 경고를 띄운다');
ok(/on==='bad'\?'b-danger'/.test(길.js()) && /on==='bad'\?'어긋남'/.test(길.js()),
   "어긋난 상태는 '꺼짐' 이 아니라 빨간 '어긋남' 으로 그린다");
ok(/\(S\.idvCfg && S\.idvCfg\.warn\) \|\| 최근거절\(\)\.length \? 'bad'/.test(길.js()),
   '경고가 있거나 최근 24시간 거절이 있으면 어긋남이다');
ok(/'idv-reject':'본인확인 거절'/.test(길.js()), "열람 기록에 '본인확인 거절' 로 보인다");
{
  const fs = await import('node:fs');
  const 운영 = fs.readFileSync(new URL('../api/demands.js', import.meta.url), 'utf8');
  ok(/action: 'eq\.idv-reject'/.test(운영) && /idvRejects/.test(운영),
     '최근 24시간 거절 수는 서버가 따로 센다 (화면의 300줄·필터와 상관없이)');
  ok(/LG\.idvRejects = j\.idvRejects/.test(길.js()) && /const x = LG\.idvRejects;/.test(길.js()),
     '운영 화면은 서버가 센 수를 먼저 쓴다');
}
{
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY_INICIS: 'ch-ini' });
  ok(답.live === false, 'PORTONE_LIVE 가 없으면 실계약으로 읽지 않는다');
}

/* ── 결과 확인: 어느 창구에서 받은 인증인가 ──
   포트원은 상점 단위로 답한다. 9월 내내 공개됐던 시험 채널로 받은 인증이
   실계약을 켠 뒤에도 '확인된 이름' 으로 서명되면 안 된다. */
let 사용기록 = 0, 운영기록 = [], 쓴번호 = new Set();
async function 확인(env, 창구, 번호){
  for(const k of [...키들, ...Object.keys(기본), 'BK_URL']) delete process.env[k];
  Object.assign(process.env, { BK_URL: 'https://fake.supabase.co' }, env);
  사용기록 = 0; 운영기록 = [];
  globalThis.fetch = async (u, o) => {
    u = String(u);
    if(u.includes('bk_ops_log')){ 운영기록.push(JSON.parse(o.body)); return new Response('', { status: 201 }); }
    if(u.includes('api.portone.io')) return new Response(JSON.stringify({
      status: 'VERIFIED', id: 'v1',
      ...(창구 === undefined ? {} : { channel: 창구 }),
      verifiedCustomer: { name: '김민수', phoneNumber: '01012345678', birthDate: '1990-01-01', operator: 'SKT' },
    }), { status: 200 });
    if(u.includes('bk_idv_use')){ 사용기록++; const v = JSON.parse(o.body).vid;
      if(쓴번호.has(v)) return new Response('dup', { status: 409 });
      쓴번호.add(v); return new Response('', { status: 201 }); }
    return new Response('[]', { status: 200 });
  };
  let 답 = null, 상태 = 0;
  const res = { setHeader(){}, status(c){ 상태 = c; return this; }, json(j){ 답 = j; return this; } };
  await idv({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.' + Math.floor(Math.random()*250) },
              body: { identity_verification_id: 번호 || 'bk-test-' + Math.random().toString(36).slice(2) } }, res);
  return { 상태, 답, 사용기록, 운영기록 };
}
const 실계약 = { ...기본, PORTONE_CHANNEL_KEY_INICIS: 'ch-ini', PORTONE_CHANNEL_KEY_DANAL: 'ch-dan', PORTONE_LIVE: '1' };
{
  const r = await 확인(실계약, { type: 'LIVE', key: 'ch-dan', id: 'c1' });
  ok(r.상태 === 200 && r.답.ok && r.답.token, '실계약 · 열어 둔 LIVE 창구 → 통과');
  ok(r.운영기록.length === 0, '통과한 인증은 거절 기록을 남기지 않는다');
}
{
  const r = await 확인(실계약, { type: 'TEST', key: 'channel-key-예전시험', id: 'c0' });
  ok(r.상태 === 403 && !r.답.token, '실계약인데 시험 채널에서 받은 인증 → 막는다');
  ok(r.사용기록 === 1, '거절한 번호도 태운다 - 채널은 id 에 붙박이라 같은 id 가 나중에 통과할 일이 없다');
  const 기록 = r.운영기록.find(x => x.action === 'idv-reject');
  ok(!!기록 && /창구 불일치/.test(기록.detail) && /실계약 중/.test(기록.detail),
     '거절을 열람 기록에 남긴다 (새 칸에 시험 키를 넣은 실수도 실제 거절로 드러난다)');
  ok(기록 && !/김민수|01012345678/.test(JSON.stringify(기록)), '그 기록에 이름·번호는 적지 않는다');
}
{
  /* 같은 거절 id 를 거듭 보내 열람 기록을 쌓던 길 */
  const 시험 = { type: 'TEST', key: 'channel-key-예전시험', id: 'c0' };
  const 첫 = await 확인(실계약, 시험, 'bk-repeat-1');
  const 둘 = await 확인(실계약, 시험, 'bk-repeat-1');
  const 셋 = await 확인(실계약, 시험, 'bk-repeat-1');
  ok(첫.상태 === 403 && 첫.운영기록.length === 1, '처음 거절은 기록을 한 줄 남긴다');
  ok(둘.상태 === 409 && 셋.상태 === 409 && 둘.운영기록.length === 0 && 셋.운영기록.length === 0,
     '같은 id 를 다시 보내면 기록 없이 409 로 끝난다 (열람 기록을 쌓을 수 없다)');
}
{
  const r = await 확인(실계약, { type: 'LIVE', key: 'ch-남의것', id: 'c9' });
  ok(r.상태 === 403, '실계약 · LIVE 라도 열어 두지 않은 창구 → 막는다');
}
{
  const r = await 확인(실계약, undefined);
  ok(r.상태 === 403, '실계약인데 channel 이 실려 오지 않으면 → 막는다 (모르면 열지 않는다)');
}
{
  const r = await 확인(실계약, { type: 'LIVE', id: 'c1' });
  ok(r.상태 === 200, '실계약 · LIVE 인데 키가 안 실려 오면 → 통과 (우리 상점의 LIVE 는 우리 것뿐이다)');
}
{
  const r = await 확인({ ...기본, PORTONE_CHANNEL_KEY: 'ch-old' }, { type: 'TEST', key: 'ch-old', id: 'c0' });
  ok(r.상태 === 200, '시험 기간 · 열어 둔 시험 창구 → 통과 (흐름을 돌려 볼 수 있어야 한다)');
}
{
  const r = await 확인({ ...기본, PORTONE_CHANNEL_KEY: 'ch-old' }, { type: 'TEST', key: 'ch-다른것', id: 'c0' });
  ok(r.상태 === 403, '시험 기간이라도 열어 두지 않은 창구 → 막는다');
}

/* ── 화면 ── */
const js = 길.js();
const 몸통 = 이름 => { const i = js.indexOf(이름); return i < 0 ? '' : js.slice(i, i + 1600); };

ok(/IDV_KIND\s*=\s*\{[\s\S]*inicis[\s\S]*danal/.test(js), '두 창구의 이름표가 있다');
ok((js.match(/\$\{idvButtons\('demand'\)\}/g) || []).length === 1, '손님 본인확인 자리가 창구 버튼을 쓴다');
ok((js.match(/\$\{idvButtons\('partner'\)\}/g) || []).length === 1, '공급자 본인확인 자리도 같은 버튼을 쓴다');
ok(!/data-act="idv"[^>]*>\s*\$\{S\.idvBusy\?'확인 중…':'휴대폰으로 본인확인'\}/.test(js.replace(/function idvButtons[\s\S]*?\n\}/, '')),
   '버튼을 손으로 따로 적은 자리가 남아 있지 않다');

/* 예전 키로 물러서는 규칙은 서버(channels) 한 곳에만 둔다 - 두 곳이면 한쪽만 고쳐져 어긋난다 */
ok(/const idvChannels = cfg => \(cfg && Array\.isArray\(cfg\.channels\)\) \? cfg\.channels : \[\];/.test(js)
   && !/cfg\.channel_key/.test(js), '화면은 서버가 준 창구 목록만 쓴다 (자기 대체 규칙이 없다)');

const 버튼 = 몸통('function idvButtons');
ok(/창구들\.length\s*<=\s*1/.test(버튼), '창구가 하나면 버튼도 하나');
ok(/data-v="\$\{target\}:\$\{c\.k\}"/.test(버튼), '버튼마다 어느 창구인지 실려 간다');

const 시작 = 몸통('async function idvStart');
ok(/async function idvStart\(target,\s*kind\)/.test(시작), 'idvStart 가 창구를 받는다');
ok(/find\(c => c\.k === kind\)/.test(시작), '고른 창구를 찾는다');
ok(/channelKey:\s*창구\.key/.test(시작), '고른 창구의 키로 창을 연다');
ok(!/channelKey:\s*cfg\.channel_key/.test(시작), '예전처럼 첫 키로 고정해 열지 않는다');

const 처리 = 몸통("case 'idv':");
ok(/split\(':'\)/.test(처리) && /idvStart\(t === 'partner' \? 'partner' : 'demand', k\)/.test(처리),
   '누른 버튼의 대상(손님/공급자)과 창구를 함께 넘긴다');

/* 처리방침에 맡기는 곳이 적혀 있어야 한다 - 이름·번호·생년월일이 그쪽을 지난다 */
const fs = await import('node:fs');
const 방침 = fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
ok(/케이지이니시스/.test(방침) && /다날/.test(방침) && /포트원/.test(방침),
   '개인정보 처리방침에 본인확인 수탁사(포트원 · KG이니시스 · 다날)가 적혀 있다');

console.log(`\n${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
