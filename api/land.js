/* 토지 조회 경유 (2026-11-06) - 브이월드가 해외 IP 를 막아(미국 함수에서 502) 이 함수만 서울(icn1)에서 돈다(vercel.json functions).
 * feed.js(건축물대장 불러오기)가 서버 비밀값에서 나온 열쇠를 붙여 부른다 - 화면에서 바로 부르지 않는다. PNU 하나만 받는다 */
import { 토지원자료, 토지열쇠, 토지사유 } from './_bld.js';
import { sameSecret } from './_auth.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만' });
  if (!process.env.BK_SECRET_KEY || !sameSecret(String(req.headers['x-bk-land'] || ''), 토지열쇠())) return res.status(403).json({ error: '열쇠가 맞지 않습니다' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const pnu = String(b.pnu || '');
  if (!/^\d{19}$/.test(pnu)) return res.status(400).json({ error: 'PNU 모양이 아닙니다' });
  const 키 = process.env.VWORLD_KEY;
  if (!키) return res.status(503).json({ error: 'VWORLD_KEY 없음' });
  토지사유.length = 0;
  const o = await 토지원자료(pnu, 키);
  return res.status(200).json({ ...o, why: 토지사유.splice(0).slice(0, 2) });
}
