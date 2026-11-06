/* 우리 사무소 서식 올리기 (2026-11-06 · 파트너 기획 [237] '서식 자료실에 우리 사무소 서식 올리기 - 한글 · 워드 · PDF · 사진')
 * 파일은 Supabase 저장소 bk-forms 버킷(비공개)에 '사무소id/서식id.확장자' 로 둔다. 목록은 bk_agent.settings.forms.
 * 내려받기는 5분짜리 서명 주소 - 버킷은 공개하지 않는다. 버킷이 없으면(SQL 실행 전) need:'forms' 로 알린다.
 * 한 사무소 30개 · 한 파일 3MB(본문 상한 4.5MB, base64 는 1.33배). 확장자와 파일 머리(매직 바이트)가 맞아야 받는다 */
import crypto from 'node:crypto';
export const 서식버킷 = 'bk-forms', 서식최대 = 30, 서식크기 = 3 * 1024 * 1024;
const 종류 = { pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
export const 서식확장자 = Object.keys(종류);
/* 파일 머리 - PDF %PDF · PNG · JPEG FFD8 · 옛 오피스/한글(OLE) D0CF11E0 · 새 오피스/hwpx(zip) PK */
export function 머리맞음(ext, buf) {
  const h = buf.subarray(0, 8).toString('hex');
  if (ext === 'pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (ext === 'png') return h.startsWith('89504e470d0a1a0a');
  if (ext === 'jpg' || ext === 'jpeg') return h.startsWith('ffd8ff');
  if (['hwp', 'doc', 'xls'].includes(ext)) return h.startsWith('d0cf11e0a1b11ae1');
  if (['hwpx', 'docx', 'xlsx'].includes(ext)) return h.startsWith('504b0304');
  return false;
}
export function 서식들(x) {
  const out = [], 본 = new Set();
  for (const f of Array.isArray(x) ? x : []) {
    if (!f || !/^[0-9a-f]{12}$/.test(String(f.id)) || 본.has(f.id) || !서식확장자.includes(f.ext)) continue;
    본.add(f.id);
    out.push({ id: f.id, name: String(f.name || '').slice(0, 60) || '이름 없는 서식', ext: f.ext, size: +f.size || 0, at: String(f.at || '').slice(0, 19) });
    if (out.length >= 서식최대) break;
  }
  return out;
}
const 이름다듬기 = s => String(s || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
/* 올리기 전 확인 - { ext, buf, name } 또는 { error } */
export function 서식확인(b) {
  const 원이름 = String(b.name || '');
  const ext = (원이름.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1];
  const e = String(ext || '').toLowerCase();
  if (!서식확장자.includes(e)) return { error: '한글(hwp · hwpx) · 워드 · 엑셀 · PDF · JPG · PNG 파일만 올릴 수 있습니다' };
  const data = String(b.data || '');
  if (!data || !/^[A-Za-z0-9+/=\r\n]+$/.test(data)) return { error: '파일을 읽지 못했습니다 - 다시 골라 주세요' };
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) return { error: '빈 파일입니다' };
  if (buf.length > 서식크기) return { error: '파일이 3MB 를 넘습니다 - PDF 로 줄이거나 나눠 올려 주세요' };
  if (!머리맞음(e, buf)) return { error: '파일 내용이 확장자와 맞지 않습니다 - 원본 파일을 올려 주세요' };
  return { ext: e, buf, name: 이름다듬기(b.label || 원이름) || '이름 없는 서식' };
}
const 저장소 = p => `${process.env.BK_URL}/storage/v1/${p}`;
const 열쇠 = () => ({ apikey: process.env.BK_SECRET_KEY, Authorization: 'Bearer ' + process.env.BK_SECRET_KEY });
const 버킷없음 = t => /bucket not found|Bucket not found|not_found|404/i.test(String(t || ''));
export async function 서식올리기(agentId, ext, buf, fetchFn = fetch) {
  const id = crypto.randomBytes(6).toString('hex'), path = `${agentId}/${id}.${ext}`;
  const r = await fetchFn(저장소(`object/${서식버킷}/${path}`), { method: 'POST', headers: { ...열쇠(), 'Content-Type': 종류[ext], 'x-upsert': 'false' }, body: buf });
  if (r.ok) return { id };
  const t = await r.text().catch(() => '');
  return 버킷없음(t) ? { need: 'forms' } : { error: '파일을 올리지 못했습니다' };
}
export async function 서식주소(agentId, f, fetchFn = fetch) {
  const path = `${agentId}/${f.id}.${f.ext}`;
  const r = await fetchFn(저장소(`object/sign/${서식버킷}/${path}`), { method: 'POST', headers: { ...열쇠(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
  const j = await r.json().catch(() => ({}));
  const s = j.signedURL || j.signedUrl;
  if (!r.ok || !s) return 버킷없음(JSON.stringify(j)) ? { need: 'forms' } : { error: '내려받을 주소를 만들지 못했습니다' };
  const 이름 = `${f.name}.${f.ext}`;
  return { url: `${저장소(String(s).replace(/^\/+/, ''))}&download=${encodeURIComponent(이름)}` };
}
export async function 서식지우기(agentId, f, fetchFn = fetch) {
  const r = await fetchFn(저장소(`object/${서식버킷}`), { method: 'DELETE', headers: { ...열쇠(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [`${agentId}/${f.id}.${f.ext}`] }) });
  return r.ok;
}
