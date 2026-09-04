/* 본인확인 표에 서명하고 확인한다.
 *
 * 브라우저가 "확인했습니다" 라고 말하는 것을 믿으면 아무 의미가 없다.
 * 포트원에 직접 물어 확인한 뒤, 그 결과를 서버 열쇠로 서명해 표로 끊어준다.
 * 조건을 낼 때 그 표를 함께 받고, 표에 적힌 이름을 저장한다 -
 * 화면에서 손으로 적은 이름이 아니라.
 *
 * 표는 30분만 산다. 조건 하나 쓰는 데 그보다 오래 걸리지 않는다.
 */

import crypto from 'node:crypto';

const TTL = 30 * 60 * 1000;

const b64u = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const mac = (body, key) =>
  b64u(crypto.createHmac('sha256', key).update(body).digest());

export function signIdv(payload) {
  const key = process.env.BK_SECRET_KEY;
  if (!key) throw new Error('BK_SECRET_KEY 없음');
  const body = b64u(JSON.stringify({ ...payload, at: Date.now() }));
  return `${body}.${mac(body, key)}`;
}

/** 서명과 유효기간을 본다. 어느 하나라도 어긋나면 null. */
export function readIdv(token) {
  const key = process.env.BK_SECRET_KEY;
  if (!key || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  /* 서명 비교는 길이가 달라도 같은 시간이 걸리게 한다 */
  const want = Buffer.from(mac(body, key));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;

  let p;
  try { p = JSON.parse(unb64u(body).toString('utf8')); } catch { return null; }
  if (!p || typeof p.at !== 'number' || Date.now() - p.at > TTL) return null;
  if (!p.name || !p.phone) return null;
  return p;
}
