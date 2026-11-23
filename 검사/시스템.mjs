/* 시스템 기록 · 아침 점검 · 사용 현황 · 확정본 보관본 · 링크 열람 (2026-11-22)
   - 오류 · 발송 실패를 bk_sys_event 에 남긴다(받는 번호 · 메일은 평문으로 안 남김, 다시 보낼 내용은 잠가서만)
   - 아침 점검은 DB · 저장소 · 사이트 · 환경변수 · 어제 기록을 본다
   - 화면 오류는 다른 사이트 스크립트 · 같은 오류를 거른다 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as 길 from './길.mjs';

let ran = 0, fail = 0;
const ok = (c, m) => { ran++; console.log((c ? '  OK  ' : '  X   ') + m); if(!c) fail++; };
const js = 길.js();
const 읽기 = n => fs.readFileSync(new URL(길.api(n)), 'utf8');

process.env.BK_URL = 'https://db.example'; process.env.BK_SECRET_KEY = 'svc';
const S = await import(길.api('_sys.js'));
const 원래fetch = globalThis.fetch;
let 불린 = [];
const 응답 = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

/* ── 글 가림 · 기록 ── */
ok(S.글가림('받는 분 010-1234-5678 · a.b@example.com 거절') === '받는 분 *** · ***@*** 거절', '기록 글 속 전화번호 · 메일은 가린다');
globalThis.fetch = async (u, o = {}) => { 불린.push({ u: String(u), m: o.method || 'GET', b: o.body }); return 응답('', 201); };
ok((await S.기록('client-error', { level: 'error', msg: '오류 010-9999-8888' })).ok && JSON.parse(불린[0].b).msg === '오류 ***' && /bk_sys_event$/.test(불린[0].u), '기록은 bk_sys_event 에 POST - 글은 가려서');
globalThis.fetch = async () => 응답('relation "public.bk_sys_event" does not exist', 404);
ok((await S.기록('send', { msg: 'x' })).need === '0046', '표가 없으면(0046 전) need 만 알리고 던지지 않는다');
globalThis.fetch = async () => { throw new Error('down'); };
ok((await S.기록('send', { msg: 'x' })).skipped === 'error', 'DB 가 죽어도 던지지 않는다');

/* ── 발송 실패 - 열쇠가 없으면 다시 보낼 내용을 남기지 않는다 · 있으면 잠가서 ── */
불린 = []; globalThis.fetch = async (u, o = {}) => { 불린.push({ u: String(u), b: o.body }); return 응답('', 201); };
delete process.env.BK_DATA_KEY;
await S.발송실패('kakao', { template: 'TPL1', reason: '400 bad 010-1111-2222', 다시: { to: '01011112222', template: 'TPL1', vars: { 이름: '홍길동' } } });
const 행1 = JSON.parse(불린[0].b);
ok(!행1.detail.enc && !/01011112222|홍길동/.test(불린[0].b) && 행1.detail.reason === '400 bad ***' && 행1.kind === 'send', '암호 열쇠가 없으면 받는 번호 · 내용을 남기지 않는다(이유만, 번호는 가림)');
process.env.BK_DATA_KEY = crypto.randomBytes(32).toString('base64');
불린 = [];
await S.발송실패('kakao', { template: 'TPL1', reason: '400', 다시: { to: '01011112222', template: 'TPL1', vars: { 이름: '홍길동' } } });
const 행2 = JSON.parse(불린[0].b);
ok(/^e1:/.test(행2.detail.enc) && !/01011112222|홍길동/.test(불린[0].b), '열쇠가 있으면 다시 보낼 내용을 잠가서만 남긴다');

/* ── 최근 - 잠긴 내용은 내보내지 않고 다시 보낼 수 있는지만 ── */
globalThis.fetch = async () => 응답([{ id: 'a', kind: 'send', level: 'warn', msg: 'm', detail: { enc: 행2.detail.enc, reason: '400' }, done: false }, { id: 'b', kind: 'send', detail: { enc: 'e1:x' }, done: true }]);
const 최근 = await S.최근('send', 7);
ok(최근.rows[0].retry === true && !('enc' in 최근.rows[0].detail) && 최근.rows[1].retry === false, '운영 화면에는 잠긴 내용을 내보내지 않는다 · 이미 다시 보낸 것은 다시 보내기 없음');

/* ── 다시 보내기 - 풀어서 같은 채널로, 성공하면 done ── */
{
  const 보낸 = []; 불린 = [];
  process.env.SOLAPI_API_KEY = 'k'; process.env.SOLAPI_API_SECRET = 's'; process.env.SOLAPI_PFID = 'p'; process.env.SOLAPI_FROM = '0212345678';
  globalThis.fetch = async (u, o = {}) => { u = String(u); 불린.push({ u, m: o.method || 'GET', b: o.body });
    if (/bk_sys_event\?select=id,kind/.test(u)) return 응답([{ id: '11111111-2222-4333-8444-555555555555', kind: 'send', detail: { enc: 행2.detail.enc }, done: false }]);
    if (/solapi/.test(u)) { 보낸.push(JSON.parse(o.body)); return 응답({}); }
    return 응답('', 204); };
  const r = await S.다시보내기('11111111-2222-4333-8444-555555555555');
  ok(r.ok && 보낸.length === 1 && 보낸[0].message.to === '01011112222' && 보낸[0].message.kakaoOptions.templateId === 'TPL1' && 불린.some(x => x.m === 'PATCH' && /done/.test(x.b || '')) && 불린.some(x => x.m === 'POST' && /"retry"/.test(x.b || '')),
     '다시 보내기 - 잠긴 내용을 풀어 같은 템플릿 · 번호로 보내고 done 표시 · 다시 보냄 기록');
  ok((await S.다시보내기('bad')).error && /이미/.test((await (async () => { globalThis.fetch = async () => 응답([{ id: 'x', kind: 'send', detail: { enc: 'e1:x' }, done: true }]); return S.다시보내기('11111111-2222-4333-8444-555555555555'); })()).error || ''),
     '번호가 이상하거나 이미 다시 보낸 것은 거절');
}

/* ── 아침 점검 ── */
{
  for (const k of ['RESEND_API_KEY', 'CRON_SECRET', 'ANTHROPIC_API_KEY']) process.env[k] = 'x';
  const 가짜 = async (u, o = {}) => { u = String(u);
    if (/bk_agent\?select=id&limit=1/.test(u)) return 응답([{ id: 'a' }]);
    if (/storage\/v1\/bucket$/.test(u)) return 응답([{ id: 'bk-files' }, { id: 'bk-forms' }]);
    if (/example\.site\/$/.test(u)) return 응답('<script src="/app/bk.0123456789.js"></script>');
    if (/app\/bk\.0123456789\.js/.test(u)) return 응답('');
    if (/version\.json/.test(u)) return 응답({ v: '26.11.23.1' });
    if (/bk_sys_event/.test(u)) return 응답([{ kind: 'client-error', level: 'error', msg: 'a is not defined' }, { kind: 'client-error', level: 'error', msg: 'a is not defined' }, { kind: 'cron', level: 'info', msg: '계약 3건' }, { kind: 'backup', level: 'info', msg: '임시 백업 정상' }]);
    return 응답('', 404); };
  const r = await S.점검('https://example.site', 가짜);
  const 이름 = n => r.결과.find(x => x.이름 === n);
  ok(이름('DB').ok && 이름('파일 저장소').ok && 이름('사이트 첫 화면').ok && 이름('버전 정보').ok && 이름('어제 아침 일정 알림').ok && !r.급함,
     '점검 - DB 읽기 · 버킷 둘 · 첫 화면과 화면 코드 · 버전 · 어제 아침 알림이 돌았는지');
  ok(r.셈.화면오류 === 2 && r.많은오류[0] === '2건 · a is not defined', '어제 오류를 세고 많이 난 것부터');
  const r2 = await S.점검('https://example.site', async (u, o) => /storage/.test(String(u)) ? 응답([{ id: 'bk-forms' }]) : /bk_sys_event/.test(String(u)) ? 응답('does not exist', 404) : 가짜(u, o));
  ok(r2.급함 && /bk-files/.test(r2.결과.find(x => x.이름 === '파일 저장소').말) && r2.결과.some(x => x.이름 === '시스템 기록 표' && !x.ok), '버킷이 빠지거나 기록 표가 없으면 이상으로 알린다');
  delete process.env.BK_DATA_KEY;
  const r3 = await S.점검('', 가짜);
  ok(r3.결과.find(x => x.이름 === '환경변수 개인정보 암호화').ok === false && r3.급함, '필수 환경변수가 없으면 이상');
}

/* ── 사용 현황 ── */
{
  const 지금 = Date.now(), 날 = n => new Date(지금 - n * 864e5).toISOString();
  globalThis.fetch = async u => { u = String(u);
    if (/bk_agent/.test(u)) return 응답([{ id: 'A', office: '가', status: 'approved', created_at: 날(40) }, { id: 'B', office: '나', status: 'approved', created_at: 날(40) }]);
    if (/bk_contract/.test(u)) return 응답([{ agent_id: 'A', updated_at: 날(2), status: 'sealed' }, { agent_id: 'A', updated_at: 날(20), status: 'draft' }]);
    if (/bk_proposal/.test(u)) return 응답([{ agent_id: 'A', created_at: 날(10) }]);
    if (/bk_listing/.test(u)) return 응답([]);
    return 응답([], 404); };
  const u = await S.사용현황();
  const A = u.rows.find(r => r.id === 'A'), B = u.rows.find(r => r.id === 'B');
  ok(A.계7 === 1 && A.계30 === 2 && A.확30 === 1 && A.제7 === 0 && A.제30 === 1 && u.요약.이번주활동 === 1 && u.요약.한달쉼 === 1 && !B.마지막 && u.rows[0].id === 'A',
     '사용 현황 - 7 · 30일 계약서 · 확정 · 제안을 세고, 한 달 움직임 없는 승인 사무소를 센다');
}
globalThis.fetch = 원래fetch;

/* ── 연결 ── */
const 피드 = 읽기('feed.js'), 계약 = 읽기('_contract.js'), 카카오 = 읽기('_kakao.js'), 알림 = 읽기('_notify.js'), 운영 = 읽기('demands.js');
const 버셀 = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
ok(버셀.crons.some(c => c.path === '/api/feed?cron=health' && c.schedule === '50 23 * * *') && /req\.query\.cron === 'health'[\s\S]{0,300}sameSecret\(req\.headers\.authorization/.test(피드),
   '아침 점검은 매일 08:50(한국) 예약 실행 · CRON_SECRET 으로만');
ok(/req\.query\.err\)[\s\S]{0,300}overLimit\('cerr:'/.test(피드) && /기록\('client-error'/.test(피드), '화면 오류는 IP 마다 10분 30번까지 받는다');
ok(/if \(!다시\) await 발송실패\('kakao'/.test(카카오) && /발송실패\('mail', \{ 건: mails\.length/.test(알림) && /export async function 다시메일/.test(알림), '알림톡 · 메일 발송이 거절되면 기록한다(다시 보낼 때는 또 기록하지 않음)');
ok(/기록\('cron'/.test(계약) && /기록\('server-error'/.test(계약), '아침 일정 알림이 돌았다는 기록 · 계약서 서버 오류 기록');
ok(/payload\.what === 'sys-retry'[\s\S]{0,200}if \(부\) return res\.status\(403\)/.test(운영) && /logOps\(req, opsUser, \{ action: 'sys-retry'/.test(운영), '다시 보내기는 운영자만(부운영자 막음) · 운영 기록에 남긴다');

/* ── 확정본 보관본 · 링크 열람 ── */
const C = await import(길.api('_contract.js'));
ok(C.trackCheck({ seen: { d: '2026-11-22T10:05', dn: 3, g: '어제', x: 1 }, keep: '2026-11-22' }).seen.d === '2026-11-22T10:05' && !C.trackCheck({ seen: { g: '어제' } }).seen
   && C.trackCheck({ keep: '2026-11-22' }).keep === '2026-11-22' && !C.trackCheck({ keep: '오늘' }).keep, '열람 · 보관 날짜는 모양이 맞을 때만 남긴다');
ok(/delete t\.seen; delete t\.keep;/.test(계약) && /\.\.\.\(지금\.seen \? \{ seen: 지금\.seen \} : \{\}\), \.\.\.\(지금\.keep \? \{ keep: 지금\.keep \} : \{\}\)/.test(계약),
   '화면의 일정 저장이 열람 기록 · 보관 날짜를 덮지 않는다');
ok(/await 열람남김\(t, 'd', row\.track\)/.test(계약) && /await 열람남김\(t, 'g', row\.track\)/.test(계약) && /< 3600e3\) return;/.test(계약),
   '초안 · 안내 링크를 열면 마지막으로 연 때 · 횟수를 남긴다(한 시간 안 다시 연 것은 쓰지 않음)');
ok(/case 'contract-keep':\s+await keep\(res, agent, b\)/.test(계약) && /row\.status !== 'sealed'\) return res\.status\(409\)\.json\(\{ error: '확정본만 보관합니다' \}\)/.test(계약) && /'x-upsert': 'false'/.test(계약)
   && /if \(확정\) try \{[^\n]*버킷지우기\(파일버킷, \[보관경로\(agent\.id, id\)\]\)/.test(계약), '보관본은 확정본만 · 덮지 않는다 · 영구 삭제하면 함께 지운다');
const sql = fs.readFileSync(new URL('../../beaverknock-app/supabase/migrations/0046_sys_event.sql', import.meta.url), 'utf8');
ok(/create table if not exists public\.bk_sys_event/.test(sql) && /enable row level security/.test(sql) && /'application\/json'/.test(sql), 'SQL 0046 - 기록 표(정책 없음 = 서버만) · 저장소가 보관본(json)을 받게');

/* ── 화면 ── */
{
  const s = js.indexOf('const bk오류보내기 ='), e = js.indexOf('if(typeof addEventListener', s);
  const 보냄 = [];
  const 창 = { origin: 'https://beaverknock.co.kr', hash: '#/partner/home' };
  const f = new Function('location', 'navigator', 'Blob', 'BK_변경', 'fetch', js.slice(s, e) + ';return bk오류보내기;')(창, { sendBeacon: (u, b) => 보냄.push([u, b]) }, class { constructor(p){ this.p = p; } }, [{ v: '9' }], () => Promise.resolve());
  f('x is not defined', 'https://beaverknock.co.kr/app/bk.1.js', 10, 2); f('x is not defined', 'https://beaverknock.co.kr/app/bk.1.js', 10, 2);
  f('Script error.', '', 0, 0); f('bad', 'chrome-extension://abc/x.js', 1, 1); f('ResizeObserver loop limit exceeded', '', 0, 0);
  for (let i = 0; i < 9; i++) f('오류 ' + i, 'https://beaverknock.co.kr/app/bk.1.js', i, 0);
  ok(보냄.length === 5 && 보냄[0][0] === '/api/feed?err=1' && JSON.parse(보냄[0][1].p[0]).v === '9', '화면 오류 - 같은 오류는 한 번 · 다른 사이트 스크립트 · Script error · ResizeObserver 는 거름 · 한 화면에 5건까지');
}
ok(js.includes("{ k:'sys',     t:'시스템'") && js.includes("case 'sys':     return sysPanel();") && js.includes("case 'sy-retry':") && js.includes("what:'sys-usage'"), '운영 화면 시스템 탭 - 기록 · 다시 보내기 · 지금 점검 · 사용 현황');
ok(js.includes('ct보관(CT.id, CT.doc, true);') && js.includes("${잠김 && CT.id ? ct보관카드() : ''}") && js.includes("what:'contract-keep-get'") && !/<style>\$\{css\}/.test(js),
   '확정하면 보관본을 만들고 일정·체크에서 본다(빌드가 CSS 로 오해할 <style> 글자는 쓰지 않는다)');
ok(js.includes("ct열람글('g', '손님이 안내 링크를')") && js.includes('ct초안열람줄()'), '일정·체크에 링크를 마지막으로 연 때');

/* ── 임시 백업 (2026-11-23) ── */
{
  const 큰 = Array.from({ length: 30 }, (_, i) => ({ id: i, t: 'x'.repeat(100) }));
  const 묶 = S.나누기(큰, 1000);
  ok(묶.length > 1 && 묶.flat().length === 30 && 묶.every(b => JSON.stringify(b).length <= 1100) && S.나누기([], 1000).length === 1, '백업 파일은 크기 안쪽으로 나눈다(빈 표도 파일 하나)');
  const 올림 = [], 지움 = []; let 기록됨 = null;
  const 지금 = Date.parse('2026-11-24T03:00:00+09:00');
  const 가짜 = async (u, o = {}) => { u = decodeURIComponent(String(u));
    if (/\/rest\/v1\/bk_contract\?/.test(u)) { const 처음 = +(/offset=(\d+)/.exec(u) || [0, 0])[1]; return 응답(처음 === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [{ id: 1000 }]); }
    if (/\/rest\/v1\/bk_idv_use\?/.test(u)) return 응답('relation "public.bk_idv_use" does not exist', 404);
    if (/\/rest\/v1\/bk_sys_event/.test(u)) { 기록됨 = JSON.parse(o.body); return 응답('', 201); }
    if (/\/rest\/v1\//.test(u)) return 응답([{ id: 'a' }]);
    if (/object\/list\/bk-files/.test(u)) { const b = JSON.parse(o.body); return 응답(b.prefix === 'backup/' ? [{ name: '2026-11-24' }, { name: '2026-11-17' }, { name: '2026-11-10' }] : [{ name: 'bk_agent-1.json', id: 'x' }, { name: '목록.json', id: 'y' }]); }
    if (/object\/bk-files$/.test(u) && o.method === 'DELETE') { 지움.push(...JSON.parse(o.body).prefixes); return 응답([]); }
    if (/object\/bk-files\//.test(u)) { 올림.push([u.split('object/bk-files/')[1], o.headers['x-upsert'], o.headers['Content-Type']]); return 응답({}); }
    return 응답('', 404); };
  const r = await S.임시백업(가짜, 지금);
  ok(r.날 === '2026-11-24' && r.표.bk_contract === 1001 && r.표.bk_agent === 1 && r.빠짐.some(x => /bk_idv_use/.test(x)) && 올림.some(([p]) => p === 'backup/2026-11-24/bk_contract-1.json') && 올림.some(([p]) => p === 'backup/2026-11-24/manifest.json') && 올림.every(([p]) => /^[!-~]+$/.test(p))
     && 올림.every(([, up, ct]) => up === 'true' && ct === 'application/json'),
     '임시 백업 - 표마다 1000줄씩 끝까지 읽어 backup/날짜/ 에 json 으로(같은 날 다시 돌리면 덮음) · 못 읽은 표는 빠짐에 · 목록 파일');
  ok(지움.length === 2 && 지움.every(p => p.startsWith('backup/2026-11-10/')) && !지움.some(p => /2026-11-17|2026-11-24/.test(p)), '7일 지난 날짜(11-10)만 지운다 - 11-17 · 11-24 는 둔다');
  ok(기록됨 && 기록됨.kind === 'backup' && 기록됨.level === 'warn' && /임시 백업 2026-11-24/.test(기록됨.msg), '백업 결과를 시스템 기록에 남긴다(빠진 표가 있으면 warn)');
  ok((await S.백업주소('backup/2026-11-24/bk_contract-1.json', async () => 응답({ signedURL: '/object/sign/x?token=t' }))).url && (await S.백업주소('room/abc/1.jpg')).error && (await S.백업주소('backup/../x.json')).error,
     '내려받기 주소는 backup/날짜/ 아래 json 만');
}
{
  const 버셀2 = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const 운영2 = 읽기('demands.js'), 피드2 = 읽기('feed.js');
  ok(버셀2.crons.some(c => c.path === '/api/feed?cron=backup' && c.schedule === '0 18 * * *') && 버셀2.functions['api/feed.js'].maxDuration === 60 && /req\.query\.cron === 'backup'[\s\S]{0,300}sameSecret/.test(피드2),
     '임시 백업은 매일 새벽 3시(한국) 예약 실행 · CRON_SECRET 으로만 · 60초까지');
  ok(/payload\.what === 'sys-backup-url' \|\| payload\.what === 'sys-backup-now'\) \{\s+if \(부\) return res\.status\(403\)/.test(운영2) && /action: 'sys-backup-get', reveal: true/.test(운영2),
     '백업 내려받기 · 지금 백업은 운영자만(부운영자 막음) · 내려받으면 운영 기록에 남긴다');
  ok(js.includes("{v:'backup', t:'백업'}") && js.includes('function sy백업HTML()') && js.includes("case 'sy-backup-get':"), '운영 화면 시스템 › 백업 - 날짜마다 표 · 줄 수 · 내려받기 · 지금 백업');
}

console.log(`${ran - fail} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
