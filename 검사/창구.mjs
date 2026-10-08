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
  const { 답 } = await 물어보기({ ...기본, PORTONE_CHANNEL_KEY_INICIS: 'ch-ini' });
  ok(답.live === false, 'PORTONE_LIVE 가 없으면 실계약으로 읽지 않는다');
}

/* ── 결과 확인: 어느 창구에서 받은 인증인가 ──
   포트원은 상점 단위로 답한다. 9월 내내 공개됐던 시험 채널로 받은 인증이
   실계약을 켠 뒤에도 '확인된 이름' 으로 서명되면 안 된다. */
let 사용기록 = 0;
async function 확인(env, 창구){
  for(const k of [...키들, ...Object.keys(기본), 'BK_URL']) delete process.env[k];
  Object.assign(process.env, { BK_URL: 'https://fake.supabase.co' }, env);
  사용기록 = 0;
  globalThis.fetch = async (u) => {
    u = String(u);
    if(u.includes('api.portone.io')) return new Response(JSON.stringify({
      status: 'VERIFIED', id: 'v1',
      ...(창구 === undefined ? {} : { channel: 창구 }),
      verifiedCustomer: { name: '김민수', phoneNumber: '01012345678', birthDate: '1990-01-01', operator: 'SKT' },
    }), { status: 200 });
    if(u.includes('bk_idv_use')){ 사용기록++; return new Response('', { status: 201 }); }
    return new Response('[]', { status: 200 });
  };
  let 답 = null, 상태 = 0;
  const res = { setHeader(){}, status(c){ 상태 = c; return this; }, json(j){ 답 = j; return this; } };
  await idv({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.' + Math.floor(Math.random()*250) },
              body: { identity_verification_id: 'bk-test-' + Math.random().toString(36).slice(2) } }, res);
  return { 상태, 답, 사용기록 };
}
const 실계약 = { ...기본, PORTONE_CHANNEL_KEY_INICIS: 'ch-ini', PORTONE_CHANNEL_KEY_DANAL: 'ch-dan', PORTONE_LIVE: '1' };
{
  const r = await 확인(실계약, { type: 'LIVE', key: 'ch-dan', id: 'c1' });
  ok(r.상태 === 200 && r.답.ok && r.답.token, '실계약 · 열어 둔 LIVE 창구 → 통과');
}
{
  const r = await 확인(실계약, { type: 'TEST', key: 'channel-key-예전시험', id: 'c0' });
  ok(r.상태 === 403 && !r.답.token, '실계약인데 시험 채널에서 받은 인증 → 막는다');
  ok(r.사용기록 === 0, '막을 때는 번호를 태우지 않는다');
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
