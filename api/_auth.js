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

/* 운영 화면은 암호 하나로 열려 있었다.
   주소만 알면 화면을 거치지 않고 POST 한 번으로 조건에 담긴 이름과
   연락처를 통째로 받아갈 수 있었다. 암호는 사람 사이를 돌아다니고,
   한 번 새면 누가 열었는지도 남지 않는다.

   계정을 함께 본다 - 암호를 알아도 명단에 없는 계정이면 열리지 않는다.

   BK_OPS_USERS  쉼표로 구분한 운영자 메일 또는 user id
                 비어 있으면 예전대로 암호만 본다. 환경변수를 넣기 전에
                 배포되어 운영자가 잠기는 일은 없어야 한다. */
export function opsAllowlist() {
  return String(process.env.BK_OPS_USERS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/* ── 여럿이 함께 시험해 보는 기간 ──
   명단에 넣으려면 그 사람이 먼저 가입해서 메일을 알려주고, 넣고, 다시 배포해야
   한다. 며칠 시험하자고 사람마다 그 왕복을 하는 것은 무리다.

   그래서 '언제까지' 를 하나 둔다. 그 기간에는 로그인한 계정이면 - 명단에
   없어도 - 접근 암호를 아는 한 열 수 있다. 기간이 지나면 서버가 스스로 닫는다.
   닫는 일을 사람에게 맡기지 않는다 - 임시로 열어둔 문은 잊혀서 계속 열려 있다.

   BK_OPS_OPEN_UNTIL  예) 2026-09-15  또는 2026-09-15T18:00:00+09:00
                      비어 있으면 이 기능은 없는 것과 같다.
                      30일 넘게 앞을 적으면 무시한다 - 그런 값은 대개 오타이고,
                      임시로 열어둔 문이 반년씩 열려 있는 쪽이 훨씬 나쁘다.

   열어두어도 로그인은 여전히 필요하다. 누가 무엇을 열어봤는지가 열람 기록에
   남아야 하기 때문이다 - 이름 없는 손님으로 들여보내지는 않는다. */
const OPEN_MAX = 30 * 864e5;

export function opsOpenUntil() {
  const raw = String(process.env.BK_OPS_OPEN_UNTIL || '').trim();
  if (!raw) return null;
  /* 날짜만 적으면 그날이 다 가도록 둔다 - '15일까지' 는 15일 밤까지다 */
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T23:59:59+09:00' : raw);
  if (!Number.isFinite(t)) return null;
  if (t - Date.now() > OPEN_MAX) return null;
  return t;
}

/** 운영 화면을 열 수 있는 계정인지 본다.
 *  통과면 { user, guest } (명단이 없으면 user 는 null 일 수 있다), 아니면 { code, error }.
 *  암호보다 먼저 부른다 - 로그인도 안 한 요청에 암호를 시험할 기회를 주지 않는다. */
export async function opsAccount(req) {
  const allow = opsAllowlist();
  /* 명단이 없어도 누구인지는 알아둔다 - 열람 기록에 적어야 한다 */
  const user = await userFrom(req);
  if (!allow.length) return { user };
  if (!user) return { code: 401, error: '운영자 계정으로 로그인한 뒤 다시 시도해 주세요' };
  const id = String(user.id || '').toLowerCase();
  const email = String(user.email || '').toLowerCase();
  /* member 는 '로그인만으로 이미 확인이 끝났다' 는 뜻이다. 이 표시가 있으면
     각 화면은 접근 암호를 또 묻지 않는다 - 로그인이 훨씬 강한 문이기 때문이다.
     암호는 사람 사이를 돌아다니고 누가 썼는지 남지 않지만, 계정은 그렇지 않다. */
  if (allow.includes(id) || allow.includes(email)) return { user, member: true };

  /* 시험 기간이면 명단에 없어도 들인다. 기간이 지나면 자동으로 다시 막힌다. */
  const until = opsOpenUntil();
  if (until && Date.now() < until) return { user, guest: true, until };

  return { code: 403, error: '이 계정에는 운영 권한이 없습니다' };
}

/** 이 요청에 접근 암호를 더 물어야 하는가.
 *
 *  로그인한 계정으로 이미 확인이 끝났으면 묻지 않는다. 운영자에게도,
 *  시험 기간에 링크를 받은 분에게도 한 번 더 묻는 일은 번거롭기만 하고
 *  실제로 막아주는 것이 없다 - 명단을 통과한 사람만 여기까지 온다.
 *
 *  묻는 경우는 하나뿐이다. BK_OPS_USERS 가 비어 있으면 계정을 아예 안 보므로
 *  그때는 암호가 유일한 문이다. 그 하나를 놓치면 운영 화면이 그냥 열린다. */
export const opsNeedsPass = gate => !gate.member && !gate.guest;
