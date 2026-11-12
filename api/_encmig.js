/* ── 개인정보 암호화 전환 (2026-11-12) ──
   BK_DATA_KEY 를 넣기 전에 평문으로 저장된 줄을 찾아, 같은 값을 다시 써서 암호화한다(쓰기는 _crypto.js 길목이 잠근다).
   운영 화면의 '암호화 전환' 단추가 부른다(api/demands.js · 운영자만). 한 번에 200줄까지 - 남으면 다시 누른다.
   계약서 본문(doc)은 여기서 바꾸지 않는다: 작성 중인 것은 다음에 저장할 때 암호화되고(목록 순서가 흔들리지 않게),
   날인본은 고칠 수 없게 잠겨 있다(0031 트리거 - 위변조 방지가 우선). */
import { sbHeaders, sbUrl } from './_auth.js';
import { 암호켜짐 } from './_crypto.js';

const 한번 = 200;
const 대상 = [
  { 표: 'bk_demand', 칸: ['name', 'phone', 'birth', 'cur_addr', 'memo', 'must_free', 'manager', 'contact_pref', 'contact_times'], 거름: 'phone=not.like.e1:*&phone=not.is.null' },
  { 표: 'bk_agent', 칸: ['name', 'phone', 'email', 'addr', 'memo', 'corp_no', 'settings'], 거름: 'phone=not.like.e1:*&phone=not.is.null' },
  { 표: 'bk_contract_msg', 칸: ['name', 'body', 'file'], 거름: 'body=not.like.e1:*' },
  { 표: 'bk_proposal', 칸: ['contact_pref', 'report_detail', 'report_note'], 거름: 'contact_pref=not.is.null&contact_pref=not.like.e1:*' },
];
async function 남은수(t) {
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
      const r = await fetch(sbUrl(t.표, `select=id,${t.칸.join(',')}&${t.거름}&order=id&limit=${한번 - 바꿈}`), { headers: sbHeaders() });
      if (!r.ok) { 실패.push(t.표); continue; }
      for (const row of await r.json()) {
        const 몸 = {}; for (const k of t.칸) if (row[k] !== undefined) 몸[k] = row[k];
        const w = await fetch(sbUrl(t.표, `id=eq.${row.id}`), { method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(몸) });
        if (w.ok) 바꿈++; else 실패.push(`${t.표}:${row.id}`);
      }
    }
  }
  const 현황 = await Promise.all(대상.map(남은수));
  return { ok: true, 켜짐: true, 바꿈, 실패: 실패.slice(0, 10), 현황 };
}
