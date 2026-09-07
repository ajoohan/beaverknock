/* 누가 보낸 요청인지 확인한다.
 *
 * 브라우저가 "저는 아무개입니다" 라고 적어 보내는 것은 믿지 않는다.
 * Supabase 가 발급한 access_token 을 Supabase 에 되물어 확인한다.
 * 확인된 것만 user_id 로 쓴다.
 *
 * 환경변수
 *   BK_URL          https://xxxx.supabase.co
 *   BK_PUBLIC_KEY   publishable/anon 키 (auth 조회용 apikey 헤더)
 *   BK_SECRET_KEY   없으면 이것으로 대신한다
 */

const cache = new Map();          /* 같은 토큰을 짧게 재사용한다 - 화면 하나에 여러 번 부른다 */
const TTL = 60_000;

export function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : null;
}

/** 토큰이 진짜인지 Supabase 에 물어본다. 아니면 null. */
export async function userFrom(req) {
  const token = bearer(req);
  if (!token || token.length < 20 || token.length > 4000) return null;

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL) return hit.user;

  const { BK_URL, BK_PUBLIC_KEY, BK_SECRET_KEY } = process.env;
  if (!BK_URL) return null;
  const key = BK_PUBLIC_KEY || BK_SECRET_KEY;
  if (!key) return null;

  try {
    const r = await fetch(`${BK_URL}/auth/v1/user`, {
      headers: { apikey: key, Authorization: 'Bearer ' + token },
    });
    if (!r.ok) { cache.set(token, { at: Date.now(), user: null }); return null; }
    const j = await r.json();
    const user = j && j.id ? { id: j.id, email: j.email || null } : null;
    cache.set(token, { at: Date.now(), user });
    /* 캐시가 무한히 자라지 않게 한다 - 서버리스라 오래 살지는 않지만 */
    if (cache.size > 500) cache.clear();
    return user;
  } catch (e) {
    return null;
  }
}

/* Supabase REST 를 서비스 키로 부르는 공통 부분 */
export const sbHeaders = () => ({
  apikey: process.env.BK_SECRET_KEY,
  Authorization: 'Bearer ' + process.env.BK_SECRET_KEY,
  'Content-Type': 'application/json',
});
export const sbUrl = (path, q) =>
  `${process.env.BK_URL}/rest/v1/${path}${q ? '?' + q : ''}`;

/* 손님에게 알림을 보내려면 계정 메일이 필요하다.
   조건 접수에서는 전화번호만 받는다 - 메일 주소는 로그인 계정 쪽에만 있다.
   실패하면 null 을 준다. 메일 하나 때문에 제안이 막히면 안 된다. */
export async function emailOf(userId) {
  const { BK_URL, BK_SECRET_KEY } = process.env;
  if (!BK_URL || !BK_SECRET_KEY || !userId) return null;
  try {
    const r = await fetch(`${BK_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: BK_SECRET_KEY, Authorization: 'Bearer ' + BK_SECRET_KEY },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.email) || null;
  } catch (e) {
    return null;
  }
}
