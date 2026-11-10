/* 다른 사무소가 쓴 계약서 올리기 (2026-11-10 파트너 기획 '공동중개 - 상대 사무소가 작성한 계약서를 올려 목록에 추가')
 * 우리 사무소가 쓴 계약서(bk_contract)와 섞지 않는다 - 날인본 잠금 · 양식 검사를 받지 않는 남의 서류다.
 * 목록은 bk_agent.settings.ext(사무소마다 100건), 파일은 bk-files 버킷(0036) ext/사무소id/파일id.확장자.
 * 일정(계약일 · 중도금 · 잔금)은 대시보드 달력 · 달력 구독 · 아침 알림에 같이 든다 */
import { 서식확장자 } from './_forms.js';
export const 외부최대 = 100;
export const 외부거래 = ['매매', '전세', '월세', '연세', '단기임대', '분양권', '기타'];
const 날꼴 = /^\d{4}-\d{2}-\d{2}$/;
const 글 = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const 금액 = v => { const n = Math.round(+String(v ?? '').replace(/[^0-9]/g, '')); return n > 0 && n < 1e13 ? n : 0; };
export function 외부하나(e) {
  if (!e || typeof e !== 'object' || !/^[0-9a-f]{12}$/.test(String(e.id))) return null;
  const title = 글(e.title, 80);
  if (!title) return null;
  const 날 = k => 날꼴.test(String(e[k] || '')) ? String(e[k]) : '';
  const f = e.file && /^[0-9a-f]{12}$/.test(String(e.file.id)) && 서식확장자.includes(e.file.ext)
    ? { id: e.file.id, ext: e.file.ext, size: +e.file.size || 0, name: 글(e.file.name, 60) || '계약서' } : null;
  return { id: e.id, title, kind: 외부거래.includes(e.kind) ? e.kind : '기타', office: 글(e.office, 40), price: 금액(e.price),
    cd: 날('cd'), md: 날('md'), bd: 날('bd'), memo: 글(e.memo, 200), state: ['done', 'cancel'].includes(e.state) ? e.state : '',
    ...(f ? { file: f } : {}), at: String(e.at || '').slice(0, 19) };
}
export function 외부들(x) {
  const out = [], 본 = new Set();
  for (const e of Array.isArray(x) ? x : []) { const v = 외부하나(e); if (!v || 본.has(v.id)) continue; 본.add(v.id); out.push(v); if (out.length >= 외부최대) break; }
  return out;
}
export const 외부경로 = (agentId, f) => `ext/${agentId}/${f.id}.${f.ext}`;
/* 일정 - 계약일 · 중도금 · 잔금. 취소한 건은 뺀다 */
export function 외부일정(e) {
  if (!e || e.state === 'cancel') return [];
  const out = [];
  if (e.cd) out.push({ k: 'contract', 이름: '계약일', 날: e.cd, 메모: '공동중개 계약입니다' });
  if (e.md) out.push({ k: 'mid', 이름: '중도금', 날: e.md, 메모: '중도금 입금을 확인하세요' });
  if (e.bd) out.push({ k: 'balance', 이름: '잔금', 날: e.bd, 메모: e.state === 'done' ? '잔금 마침' : '잔금 준비를 확인하세요' });
  return out;
}
