/* ── 개인정보 암호화 전환 (2026-11-12) ──
   BK_DATA_KEY 를 넣기 전에 평문으로 저장된 줄을 찾아, 같은 값을 다시 써서 암호화한다(쓰기는 _crypto.js 길목이 잠근다).
   운영 화면의 '암호화 전환' 단추가 부른다(api/demands.js · 운영자만). 한 번에 200줄까지 - 남으면 다시 누른다.
   계약서 본문(doc)은 여기서 바꾸지 않는다: 작성 중인 것은 다음에 저장할 때 암호화되고(목록 순서가 흔들리지 않게),
   날인본은 고칠 수 없게 잠겨 있다(0031 트리거 - 위변조 방지가 우선).
   리뷰 11-12: 평문 판정은 칸 하나가 아니라 잠그는 글 칸 전부로(or) · 사무소 settings 는 판 번호(rev)가 그대로일 때만 쓴다. */
import { sbHeaders, sbUrl } from './_auth.js';
import { 암호켜짐 } from './_crypto.js';

const 한번 = 200;
const 평문 = 칸들 => `or=(${칸들.map(k => `${k}.not.like.e1:*`).join(',')})`;
const 대상 = [
  { 표: 'bk_demand', 칸: ['name', 'phone', 'birth', 'cur_addr', 'memo', 'must_free', 'manager', 'contact_pref', 'contact_times'], 거름: 평문(['name', 'phone', 'birth', 'cur_addr', 'memo', 'must_free', 'manager', 'contact_pref', 'contact_times']) },
  { 표: 'bk_agent', 칸: ['name', 'phone', 'email', 'addr', 'memo', 'corp_no'], 거름: 평문(['name', 'phone', 'email', 'addr', 'memo', 'corp_no']) },
  /* 사무소 settings(의뢰인 메모 · 사무소 메모 · 문자 기록) - 칸으로 거를 수 없어 따로 살핀다 */
  { 표: 'bk_agent', 칸: ['settings'], 거름: 'settings=not.is.null', 설정: true },
  { 표: 'bk_contract_msg', 칸: ['name', 'body', 'file'], 거름: 평문(['name', 'body']) },
  { 표: 'bk_proposal', 칸: ['contact_pref', 'report_detail', 'report_note', 'msg', 'note'], 거름: 평문(['contact_pref', 'report_detail', 'report_note', 'msg', 'note']) },
  { 표: 'bk_listing', 칸: ['ho', 'note'], 거름: 평문(['ho', 'note']) },
  { 표: 'bk_ops_log', 칸: ['detail'], 거름: 평문(['detail']) },
];
/* settings 안에 아직 평문인 개인정보가 있는가 - lmemo 의 글 · 사무소 메모 · 문자 기록 값 */
const 글들 = v => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(글들) : v && typeof v === 'object' ? Object.values(v).flatMap(글들) : [];
const 설정평문 = s => !!s && typeof s === 'object' && [s.memo, s.lmemo, (Array.isArray(s.smsLog) ? s.smsLog.map(x => x && x.vals) : [])]
  .flatMap(글들).some(t => t && !t.startsWith('e1:'));

async function 남은수(t) {
  if (t.설정) {
    const r = await fetch(sbUrl(t.표, `select=id,settings&${t.거름}&limit=1000`), { headers: { ...sbHeaders(), 'x-bk-raw': '1' } });
    if (!r.ok) return { 표: 'bk_agent.settings', error: (await r.text()).slice(0, 120) };
    return { 표: 'bk_agent.settings', 남음: (await r.json()).filter(x => 설정평문(x.settings)).length };
  }
  const r = await fetch(sbUrl(t.표, `select=id&${t.거름}&limit=1`), { headers: { ...sbHeaders(), Prefer: 'count=exact' } });
  if (!r.ok) return { 표: t.표, error: (await r.text()).slice(0, 120) };
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
  return { 표: t.표, 남음: m ? +m[1] : null };
}
export async function 암호전환(바꾸기) {
  if (!암호켜짐()) return { ok: false, error: 'BK_DATA_KEY 가 없어 암호화가 꺼져 있습니다', 켜짐: false };
  let 바꿈 = 0;
  const 실패 = [];
  if (바꾸기) {
    for (const t of 대상) {
      if (바꿈 >= 한번) break;
      let 줄들;
      if (t.설정) {
        /* 평문이 남은 사무소만 고른다(원문으로 읽어 가른 뒤, 그 줄들을 풀린 값으로 다시 읽어 쓴다) */
        const r0 = await fetch(sbUrl(t.표, `select=id,settings&${t.거름}&order=id&limit=1000`), { headers: { ...sbHeaders(), 'x-bk-raw': '1' } });
        if (!r0.ok) { 실패.push(t.표); continue; }
        const ids = (await r0.json()).filter(x => 설정평문(x.settings)).slice(0, 한번 - 바꿈).map(x => x.id);
        if (!ids.length) continue;
        const r = await fetch(sbUrl(t.표, `select=id,settings&id=in.(${ids.join(',')})`), { headers: sbHeaders() });
        if (!r.ok) { 실패.push(t.표); continue; }
        줄들 = await r.json();
      } else {
        const r = await fetch(sbUrl(t.표, `select=id,${t.칸.join(',')}&${t.거름}&order=id&limit=${한번 - 바꿈}`), { headers: sbHeaders() });
        if (!r.ok) { 실패.push(t.표); continue; }
        줄들 = await r.json();
      }
      for (const row of 줄들) {
        const 몸 = {}; for (const k of t.칸) if (row[k] !== undefined) 몸[k] = row[k];
        /* settings 는 그 사이 사무소가 저장했으면 덮지 않는다 - 판 번호가 그대로일 때만(feed.js 설정고침과 같은 약속) */
        const 판 = t.설정 && row.settings && row.settings.rev != null ? `&settings->>rev=eq.${encodeURIComponent(String(row.settings.rev))}` : t.설정 ? '&settings->>rev=is.null' : '';
        const w = await fetch(sbUrl(t.표, `id=eq.${row.id}${판}`), { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(몸) });
        if (w.ok && (await w.json().catch(() => [])).length) 바꿈++; else 실패.push(`${t.표}:${row.id}`);
      }
    }
  }
  const 현황 = await Promise.all(대상.map(남은수));
  return { ok: true, 켜짐: true, 바꿈, 실패: 실패.slice(0, 10), 현황 };
}
