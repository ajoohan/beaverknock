/* ── 시스템 기록 · 아침 자동 점검 · 사용 현황 (2026-11-22) ──
 * 표 bk_sys_event (SQL 0046). 화면 · 서버 오류, 알림톡 · 메일 발송 실패, 아침 일정 알림 결과, 아침 점검 결과를 남긴다.
 * 운영 화면 '시스템' 탭이 읽고(api/demands.js what:'sys'), 매일 아침 점검(feed.js ?cron=health)이 어제 것을 모아 메일로 보낸다.
 *
 * 원칙
 *  ① 기록 때문에 본 일이 실패하면 안 된다 - 어떤 경우에도 던지지 않는다. 표가 없으면(0046 전) 조용히 넘어간다.
 *  ② 그래도 기다렸다 보낸다 - 서버리스는 응답과 함께 프로세스를 접는다.
 *  ③ 받는 번호 · 메일 같은 개인정보는 평문으로 남기지 않는다. 다시 보내기에 필요한 내용은 BK_DATA_KEY 로 잠가서만 둔다(열쇠가 없으면 남기지 않는다).
 */
import { sbHeaders, sbUrl } from './_auth.js';
import { 잠그기, 풀기, 암호켜짐 } from './_crypto.js';

const 표 = 'bk_sys_event';
const 시간제한 = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
const 없는표 = t => /bk_sys_event|does not exist|PGRST205|42P01/i.test(String(t || ''));
/* 글 속의 전화번호 · 메일 주소는 가린다 */
export const 글가림 = s => String(s ?? '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***').replace(/\d[\d -]{7,}\d/g, m => /^\d{4}-\d{2}-\d{2}$/.test(m) ? m : '***');   /* 날짜(2026-11-24)는 두고 번호만 */

export async function 기록(kind, { level = 'info', msg = '', detail = null } = {}, fetchFn = fetch) {
  try {
    if (!process.env.BK_URL || !process.env.BK_SECRET_KEY) return { skipped: 'no env' };
    const row = { kind: String(kind).slice(0, 20), level: String(level).slice(0, 10), msg: 글가림(msg).slice(0, 300), detail: detail || null };
    const r = await 시간제한(fetchFn(sbUrl(표), { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row) }), 1500);
    if (!r) return { skipped: 'timeout' };
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => '');
    return 없는표(t) ? { need: '0046' } : { skipped: 'db ' + r.status };
  } catch { return { skipped: 'error' }; }
}

/* 발송 실패 - 채널(kakao · mail) · 템플릿 · 이유. 다시 보낼 내용(받는 곳 포함)은 잠가서만 */
export async function 발송실패(channel, { template = '', reason = '', 다시 = null, 건 = 1 } = {}) {
  let enc = '';
  try { enc = 다시 && 암호켜짐() ? (s => s.length < 60000 ? 잠그기(s) : '')(JSON.stringify({ channel, ...다시 })) : ''; } catch { enc = ''; }
  return 기록('send', { level: 'warn', msg: `${channel === 'kakao' ? '알림톡' : '메일'} 발송 실패${건 > 1 ? ` ${건}통` : ''} - ${reason}`,
    detail: { channel, template: String(template || '').slice(0, 60), reason: 글가림(reason).slice(0, 160), 건, ...(enc ? { enc } : {}) } });
}

async function 읽기(q, fetchFn = fetch) {
  const r = await 시간제한(fetchFn(sbUrl(표, q), { headers: sbHeaders() }), 4000);
  if (!r) return { error: '시간 초과' };
  if (!r.ok) { const t = await r.text().catch(() => ''); return 없는표(t) ? { need: '0046' } : { error: 'db ' + r.status }; }
  return { rows: await r.json() };
}

/* 오늘(한국) 화면 오류 기록이 상한(2000)을 넘었나 - 넘으면 더 받지 않는다(2026-11-23 코드리뷰) */
export async function 오늘오류많음(상한 = 2000, fetchFn = fetch) {
  try { const 자정 = new Date(Date.parse(한국날() + 'T00:00:00+09:00')).toISOString();
    const r = await 시간제한(fetchFn(sbUrl(표, `select=id&kind=eq.client-error&at=gte.${자정}&limit=1&offset=${상한 - 1}`), { headers: sbHeaders() }), 1500);
    if (!r || !r.ok) return false; return (await r.json()).length > 0; } catch { return false; }
}
/* 운영 화면 - 최근 기록. kind 로 거른다. 잠긴 내용은 내보내지 않는다(다시 보낼 수 있는지만) */
export async function 최근(kind = '', days = 7) {
  const 부터 = new Date(Date.now() - Math.min(Math.max(+days || 7, 1), 90) * 864e5).toISOString();
  const x = await 읽기(`select=id,at,kind,level,msg,detail,done&at=gte.${부터}${kind ? `&kind=eq.${encodeURIComponent(kind)}` : ''}&order=at.desc&limit=300`);
  if (!x.rows) return x;
  return { rows: x.rows.map(r => { const d = r.detail && typeof r.detail === 'object' ? { ...r.detail } : null; const 다시됨 = !!(d && d.enc); if (d) delete d.enc; return { ...r, detail: d, retry: 다시됨 && !r.done }; }) };
}

/* 다시 보내기 - 운영자만(부운영자 막음은 부르는 쪽). 잠긴 내용을 풀어 같은 채널로 한 번 더 */
export async function 다시보내기(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return { error: '어느 기록인지 알 수 없습니다' };
  const x = await 읽기(`select=id,kind,detail,done&id=eq.${id}&limit=1`);
  if (!x.rows) return x;
  const row = x.rows[0];
  if (!row || row.kind !== 'send' || !row.detail || !row.detail.enc) return { error: '다시 보낼 내용이 남아 있지 않습니다' };
  if (row.done) return { error: '이미 다시 보냈습니다' };
  let p; try { p = JSON.parse(풀기(row.detail.enc)); } catch { return { error: '내용을 풀지 못했습니다 - 열쇠(BK_DATA_KEY)가 바뀌었을 수 있습니다' }; }
  /* 먼저 done 으로 잡는다 - 두 운영자가 같이 눌러도 한 번만 나간다(2026-11-23 코드리뷰) */
  const 잡기 = await fetch(sbUrl(표, `id=eq.${id}&done=is.false`), { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify({ done: true }) }).catch(() => null);
  const 잡힘 = 잡기 && 잡기.ok ? await 잡기.json().catch(() => []) : [];
  if (!잡힘.length) return { error: '이미 다시 보냈거나 다른 분이 보내는 중입니다' };
  const 되돌림 = () => fetch(sbUrl(표, `id=eq.${id}`), { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ done: false }) }).catch(() => null);
  let 결과;
  if (p.channel === 'kakao') 결과 = await (await import('./_kakao.js')).alimtalk({ to: p.to, template: p.template, vars: p.vars, 다시: true });
  else if (p.channel === 'mail') 결과 = await (await import('./_notify.js')).다시메일(p.mails || []);
  else { await 되돌림(); return { error: '알 수 없는 채널입니다' }; }
  if (!결과 || !결과.ok) { await 되돌림(); return { error: `다시 보내지 못했습니다 - ${(결과 && (결과.skipped || 결과.error)) || '알 수 없음'}` }; }
  await 기록('retry', { msg: `${p.channel === 'kakao' ? '알림톡' : '메일'} 다시 보냄`, detail: { of: id } });
  return { ok: true };
}

/* ── 아침 자동 점검 ── 매일 08:50(한국). DB · 저장소 · 사이트 · 환경변수 · 어제 오류와 발송 실패 · 어제 아침 알림이 돌았는지 */
const 필수환경 = [['BK_URL', 'DB 주소'], ['BK_SECRET_KEY', 'DB 열쇠'], ['RESEND_API_KEY', '메일 발송'], ['CRON_SECRET', '예약 실행'], ['BK_DATA_KEY', '개인정보 암호화'], ['ANTHROPIC_API_KEY', '서류 읽기']];
const 선택환경 = [['SOLAPI_API_KEY', '알림톡'], ['SOLAPI_TPL_SCHEDULE', '계약 일정 알림톡'], ['SOLAPI_TPL_PROPOSAL', '제안 알림톡'], ['SOLAPI_TPL_INVITE', '대화방 초대 알림톡'],
  ['SOLAPI_TPL_ROOM', '대화방 새 말 알림톡'], ['SOLAPI_TPL_PRICE', '가격 변동 알림톡'], ['PORTONE_CHANNEL_KEY_DANAL', '다날 본인확인'], ['DATA_GO_KEY', '공공데이터(건축물대장 · 실거래가)'],
  ['GOOGLE_MAPS_KEY', '구글 지도'], ['GOOGLE_DRIVE_CLIENT_ID', 'Google 드라이브 저장'], ['DROPBOX_APP_KEY', 'Dropbox 저장']];
export async function 점검(사이트, fetchFn = fetch) {
  const 결과 = [], 더 = (이름, ok, 말 = '', 급 = true) => 결과.push({ 이름, ok: !!ok, 말, 급: !ok && 급 });
  const 재기 = async (이름, fn, 급 = true) => { const t0 = Date.now(); try { const v = await 시간제한(fn(), 6000); if (v === null) return 더(이름, false, '6초 안에 답이 없습니다', 급);
    더(이름, v.ok, `${v.말 || (v.ok ? '정상' : '이상')} · ${Date.now() - t0}ms`, 급); } catch (e) { 더(이름, false, String(e && e.message || e).slice(0, 80), 급); } };
  await 재기('DB', async () => { const r = await fetchFn(sbUrl('bk_agent', 'select=id&limit=1'), { headers: sbHeaders() }); return { ok: r.ok, 말: r.ok ? '읽기 정상' : `응답 ${r.status}` }; });
  await 재기('파일 저장소', async () => { const r = await fetchFn(`${process.env.BK_URL}/storage/v1/bucket`, { headers: sbHeaders() });
    const j = r.ok ? await r.json().catch(() => []) : []; const 있음 = new Set((Array.isArray(j) ? j : []).map(b => b.id || b.name));
    const 빠짐 = ['bk-files', 'bk-forms'].filter(b => !있음.has(b)); return { ok: r.ok && !빠짐.length, 말: !r.ok ? `응답 ${r.status}` : 빠짐.length ? `버킷 없음: ${빠짐.join(', ')}` : '버킷 정상' }; });
  if (사이트) {
    await 재기('사이트 첫 화면', async () => { const r = await fetchFn(사이트 + '/', { headers: { 'cache-control': 'no-cache' } }); const t = r.ok ? await r.text() : '';
      const js = /\/app\/bk\.[0-9a-f]{10}\.js/.exec(t); if (!js) return { ok: false, 말: r.ok ? '화면 코드 주소를 못 찾았습니다' : `응답 ${r.status}` };
      const j = await fetchFn(사이트 + js[0], { method: 'HEAD' }); return { ok: j.ok, 말: j.ok ? '화면 · 코드 정상' : `화면 코드 응답 ${j.status}` }; });
    await 재기('버전 정보', async () => { const r = await fetchFn(사이트 + '/version.json?t=' + Date.now()); const j = r.ok ? await r.json().catch(() => ({})) : {}; return { ok: !!j.v, 말: j.v ? `버전 ${j.v}` : `응답 ${r.status}` }; }, false);
  }
  for (const [k, 이름] of 필수환경) 더(`환경변수 ${이름}`, !!process.env[k], process.env[k] ? '있음' : `${k} 없음`);
  const 빠진선택 = 선택환경.filter(([k]) => !process.env[k]).map(([, 이름]) => 이름);
  더('선택 기능', true, 빠진선택.length ? `아직 꺼짐: ${빠진선택.join(' · ')}` : '모두 켜짐', false);
  /* 어제(한국 시간) 기록 */
  const 어제 = new Date(Date.now() + 9 * 3600e3 - 864e5).toISOString().slice(0, 10), 부터 = new Date(Date.parse(어제 + 'T00:00:00+09:00')).toISOString(), 까지 = new Date(Date.parse(어제 + 'T00:00:00+09:00') + 864e5).toISOString();
  const x = await 읽기(`select=kind,level,msg,at&at=gte.${부터}&at=lt.${까지}&limit=2000`, fetchFn);
  const 셈 = { 화면오류: 0, 서버오류: 0, 발송실패: 0 }, 오류말 = new Map(); let 아침알림 = null;
  if (x.rows) for (const r of x.rows) {
    if (r.kind === 'client-error') 셈.화면오류++; else if (r.kind === 'server-error') 셈.서버오류++; else if (r.kind === 'send' && r.level !== 'info') 셈.발송실패++;
    if (r.kind === 'cron') 아침알림 = r;
    if (/error/.test(r.kind)) 오류말.set(r.msg, (오류말.get(r.msg) || 0) + 1);
  }
  if (x.need) 더('시스템 기록 표', false, 'SQL 0046 을 아직 넣지 않았습니다 - 오류 · 발송 실패를 모을 수 없습니다');
  else {
    더('어제 오류', 셈.화면오류 + 셈.서버오류 < 20, `화면 ${셈.화면오류}건 · 서버 ${셈.서버오류}건`, 셈.서버오류 > 0);
    더('어제 발송 실패', !셈.발송실패, `${셈.발송실패}건`);
    더('어제 아침 일정 알림', !!아침알림, 아침알림 ? 아침알림.msg : '돌았다는 기록이 없습니다 - Vercel 예약 실행을 확인해 주세요');
    /* 임시 백업(2026-11-23) - 새벽 3시. 26시간 안에 돌았는가 */
    const 백 = await 읽기(`select=kind,level,msg,at&kind=eq.backup&at=gte.${new Date(Date.now() - 26 * 3600e3).toISOString()}&order=at.desc&limit=5`, fetchFn);
    const 최근백업 = ((백 && 백.rows) || []).find(r => r.kind === 'backup');
    더('임시 백업', !!최근백업 && 최근백업.level === 'info', 최근백업 ? 최근백업.msg : '최근 26시간 안에 돈 기록이 없습니다 - 운영 화면 › 시스템 › 백업에서 지금 백업을 눌러 보세요');
  }
  const 많은오류 = [...오류말.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, n]) => `${n}건 · ${m}`);
  return { 날: 어제, 결과, 셈, 많은오류, 급함: 결과.some(r => r.급) };
}

/* ── 사용 현황 (운영 화면) ── 사무소마다 최근 7 · 30일 계약서 · 제안 · 매물. 마지막으로 움직인 날 */
export async function 사용현황() {
  const 받기 = async (t, q) => { const r = await 시간제한(fetch(sbUrl(t, q), { headers: sbHeaders() }), 6000); if (!r || !r.ok) return null; return r.json(); };
  const 달전 = new Date(Date.now() - 30 * 864e5).toISOString(), 주전 = Date.now() - 7 * 864e5;
  const [사, 계, 제, 매] = await Promise.all([
    받기('bk_agent', 'select=id,office,status,role,created_at&role=eq.agent&limit=2000'),
    받기('bk_contract', `select=agent_id,updated_at,status&updated_at=gte.${달전}&limit=10000`),
    받기('bk_proposal', `select=agent_id,created_at&created_at=gte.${달전}&limit=10000`),
    받기('bk_listing', `select=agent_id,created_at&created_at=gte.${달전}&limit=10000`),
  ]);
  if (!사) return { error: '사무소 목록을 읽지 못했습니다' };
  const 칸 = new Map(사.map(a => [a.id, { id: a.id, office: a.office || '', status: a.status, since: String(a.created_at || '').slice(0, 10), 계7: 0, 계30: 0, 확30: 0, 제7: 0, 제30: 0, 매30: 0, 마지막: '' }]));
  const 쌓기 = (rows, 때칸, f) => (rows || []).forEach(r => { const c = 칸.get(r.agent_id); if (!c) return; const t = Date.parse(r[때칸]); f(c, t >= 주전, r); const d = String(r[때칸] || '').slice(0, 10); if (d > c.마지막) c.마지막 = d; });
  쌓기(계, 'updated_at', (c, 주, r) => { c.계30++; if (주) c.계7++; if (r.status === 'sealed') c.확30++; });
  쌓기(제, 'created_at', (c, 주) => { c.제30++; if (주) c.제7++; });
  쌓기(매, 'created_at', c => { c.매30++; });
  const rows = [...칸.values()].sort((a, b) => (b.마지막 > a.마지막) - (b.마지막 < a.마지막));
  const 활성 = rows.filter(r => r.계7 + r.제7 > 0).length, 쉼 = rows.filter(r => r.status === 'approved' && !r.마지막).length;
  return { rows, 요약: { 사무소: rows.length, 이번주활동: 활성, 한달쉼: 쉼 }, 빠짐: [!계 && '계약서', !제 && '제안', !매 && '매물'].filter(Boolean) };
}

/* ── 임시 백업 (2026-11-23 대표님 '임시 백업 만들어줘') ──
 * 무료 플랜은 Supabase 자동 백업이 없다(11-23 화면으로 확인). Pro 로 올리기 전까지 매일 새벽 3시(한국) 주요 표를 JSON 으로 뽑아
 * 비공개 저장소 bk-files 의 backup/날짜/ 아래 7일치를 둔다. 개인정보 칸은 DB 에 잠긴 그대로(BK_DATA_KEY) 담긴다.
 * 같은 프로젝트 안이라 프로젝트를 통째로 잃으면 함께 잃는다 - 운영 화면 › 시스템 › 백업에서 PC 로 내려받아 따로 둔다.
 * 로그인 계정(auth.users)은 REST 로 못 읽어 빠진다 - Pro 백업이 맡는다. */
export const 백업표 = [['bk_agent', 'id'], ['bk_consent', 'user_id'], ['bk_contract', 'id'], ['bk_contract_msg', 'id'], ['bk_demand', 'id'], ['bk_idv_use', 'vid'],
  ['bk_listing', 'id'], ['bk_proposal', 'id'], ['bk_ops_log', 'id'], ['bk_purge_log', 'id']];
const 백업보관일 = 7, 백업쪽 = 1000, 파일최대 = 2.5 * 1024 * 1024;
const 저장소 = p => `${process.env.BK_URL}/storage/v1/${p}`;
const 저장열쇠 = () => ({ apikey: process.env.BK_SECRET_KEY, Authorization: 'Bearer ' + process.env.BK_SECRET_KEY });
export const 한국날 = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
async function 올리기(path, 글, fetchFn) {
  const r = await fetchFn(저장소(`object/bk-files/${path}`), { method: 'POST', headers: { ...저장열쇠(), 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: 글 });
  if (r.ok) return true;
  const t = await r.text().catch(() => ''); throw new Error(`저장 ${r.status} ${t.slice(0, 80)}`);
}
/* 행들을 2.5MB 안쪽 파일로 나눈다 */
export function 나누기(rows, 최대 = 파일최대) {
  const 묶음 = []; let 지금 = [], 크기 = 2;
  for (const r of rows) { const n = Buffer.byteLength(JSON.stringify(r), 'utf8') + 1;
    if (지금.length && 크기 + n > 최대) { 묶음.push(지금); 지금 = []; 크기 = 2; } 지금.push(r); 크기 += n; }
  if (지금.length || !묶음.length) 묶음.push(지금);
  return 묶음;
}
export async function 임시백업(fetchFn = fetch, 지금 = Date.now()) {
  const 날 = 한국날(지금), 목록 = { 날, at: new Date(지금).toISOString(), 표: {}, 파일: [], 빠짐: [], 없음: [] };
  for (const [표이름, 키] of 백업표) {
    const 모두 = [];
    try {
      for (let 처음 = 0; 처음 < 200000; 처음 += 백업쪽) {
        /* x-bk-raw - 개인정보 칸을 풀지 않고 DB 에 잠긴 그대로 받는다(2026-11-23 코드리뷰: 길목이 풀어 평문이 백업에 담겼다) */
        const r = await fetchFn(sbUrl(표이름, `select=*&order=${키}&limit=${백업쪽}&offset=${처음}`), { headers: { ...sbHeaders(), 'x-bk-raw': '1' } });
        if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(없는표(t) ? '표 없음' : `읽기 ${r.status}`); }
        const 쪽 = await r.json(); 모두.push(...쪽);
        if (쪽.length < 백업쪽) break;
      }
      const 묶음 = 나누기(모두);
      for (const [i, 행들] of 묶음.entries()) { const path = `backup/${날}/${표이름}-${i + 1}.json`; await 올리기(path, JSON.stringify(행들), fetchFn); 목록.파일.push(path); }
      목록.표[표이름] = 모두.length;
    } catch (e) { const 말 = String(e && e.message || e).slice(0, 80);   /* 아직 만들지 않은 표(SQL 전)는 빠짐이 아니라 없음으로 */
      if (말 === '표 없음') 목록.없음.push(표이름); else 목록.빠짐.push(`${표이름}: ${말}`); }
  }
  await 올리기(`backup/${날}/manifest.json`, JSON.stringify(목록), fetchFn).catch(e => 목록.빠짐.push('목록: ' + e.message));
  /* 7일 지난 날짜 폴더를 지운다 */
  let 지움 = 0;
  try {
    const 날들 = await 백업날들(fetchFn), 기준 = 한국날(지금 - 백업보관일 * 864e5);
    for (const d of 날들.filter(d => d < 기준)) {
      const 파일 = await 폴더파일(`backup/${d}/`, fetchFn);
      if (파일.length) { const r = await fetchFn(저장소('object/bk-files'), { method: 'DELETE', headers: { ...저장열쇠(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: 파일.map(f => `backup/${d}/${f}`) }) }); if (r.ok) 지움++; }
    }
  } catch { /* 넘어간다 */ }
  /* 시스템 기록은 30일만 둔다 - 로그인 없는 오류 접수로 표가 끝없이 커지지 않게(2026-11-23 코드리뷰) */
  try { await fetchFn(sbUrl(표, `at=lt.${new Date(지금 - 30 * 864e5).toISOString()}`), { method: 'DELETE', headers: { ...sbHeaders(), Prefer: 'return=minimal' } }); } catch { /* 넘어간다 */ }
  const 행수 = Object.values(목록.표).reduce((s, n) => s + n, 0);
  await 기록('backup', { level: 목록.빠짐.length ? 'warn' : 'info', msg: `임시 백업 ${날} - 표 ${Object.keys(목록.표).length}개 · ${행수}줄 · 파일 ${목록.파일.length}개${목록.빠짐.length ? ` · 빠짐 ${목록.빠짐.length}` : ''}${지움 ? ` · 오래된 ${지움}일치 지움` : ''}`,
    detail: { 표: 목록.표, 빠짐: 목록.빠짐, 없음: 목록.없음 } }, fetchFn);
  return { ...목록, 지움 };
}
async function 폴더파일(prefix, fetchFn = fetch) {
  const r = await fetchFn(저장소('object/list/bk-files'), { method: 'POST', headers: { ...저장열쇠(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }) });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return (Array.isArray(j) ? j : []).filter(x => x && x.name && x.id).map(x => x.name);
}
export async function 백업날들(fetchFn = fetch) {
  const r = await fetchFn(저장소('object/list/bk-files'), { method: 'POST', headers: { ...저장열쇠(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: 'backup/', limit: 100, sortBy: { column: 'name', order: 'desc' } }) });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return (Array.isArray(j) ? j : []).map(x => x && x.name).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n || '')).sort().reverse();
}
/* 운영 화면 - 날짜마다 목록(표 · 줄 수 · 빠진 것) */
export async function 백업목록(fetchFn = fetch) {
  const 날들 = await 백업날들(fetchFn), out = [];
  for (const d of 날들.slice(0, 10)) {
    const r = await fetchFn(저장소(`object/authenticated/bk-files/backup/${d}/manifest.json`), { headers: 저장열쇠() }).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    if (j) { out.push({ 날: d, 표: j.표 || {}, 파일: j.파일 || [], 빠짐: (j.빠짐 || []).filter(x => !/: 표 없음$/.test(x)), 없음: [...(j.없음 || []), ...(j.빠짐 || []).filter(x => /: 표 없음$/.test(x)).map(x => x.split(':')[0])] }); continue; }
    /* 목록 파일이 없으면(11-23 첫 백업 - 한글 파일 이름 '목록.json' 을 저장소가 받지 않았다) 폴더 안 파일로 보여 준다 */
    const 파일 = (await 폴더파일(`backup/${d}/`, fetchFn)).filter(n => /^[a-z_]+-\d+\.json$/.test(n)).map(n => `backup/${d}/${n}`);
    out.push({ 날: d, 표: {}, 파일, 빠짐: [`목록 파일이 없어 줄 수는 모릅니다 - 표 파일 ${파일.length}개`] });
  }
  return out;
}
/* 내려받기 주소 (5분) - backup/ 아래 json 만 */
export async function 백업주소(path, fetchFn = fetch) {
  if (!/^backup\/\d{4}-\d{2}-\d{2}\/[a-z_]+-\d+\.json$|^backup\/\d{4}-\d{2}-\d{2}\/manifest\.json$/.test(String(path || ''))) return { error: '내려받을 수 없는 파일입니다' };
  const r = await fetchFn(저장소(`object/sign/bk-files/${encodeURI(path)}`), { method: 'POST', headers: { ...저장열쇠(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
  const j = await r.json().catch(() => ({})), s = j.signedURL || j.signedUrl;
  if (!r.ok || !s) return { error: '내려받을 주소를 만들지 못했습니다' };
  return { url: `${저장소(String(s).replace(/^\/+/, ''))}&download=${encodeURIComponent(path.replace(/\//g, '_'))}` };
}
