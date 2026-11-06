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

import crypto from 'node:crypto';

/** 비밀값 비교 - 길이도 흘리지 않는다(양쪽을 같은 길이의 해시로 바꿔 비교) (2026-11-03 보안점검) */
export function sameSecret(a, b) {
  const h = v => crypto.createHash('sha256').update(String(v ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(h(a), h(b)) && String(a ?? '') === String(b ?? '');
}

/** 짧은 시간에 몰아치는 시도를 센다(인스턴스마다 따로 - 정교한 방벽은 아니지만 한 곳의 몰아치기는 늦춘다).
 *  add=false 면 세기만 하고 늘리지 않는다 - 실패할 때만 늘리는 데 쓴다. */
const tries = new Map();
export function overLimit(key, max, windowMs, add = true) {
  const now = Date.now();
  const seen = (tries.get(key) || []).filter(t => now - t < windowMs);
  if (tries.size > 2000) for (const [k, v] of tries) if (!v.some(t => now - t < windowMs)) tries.delete(k);
  if (seen.length >= max) { tries.set(key, seen); return true; }
  if (add) seen.push(now);
  tries.set(key, seen);
  return false;
}
export const ipOf = req => String((req && req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'unknown';

/** 운영 접근 암호 - 틀린 시도는 IP 마다 10분에 10번까지. 넘으면 맞는 암호도 잠시 받지 않는다 */
/* ── 운영 임시 링크 (2026-11-03 보안점검) ──
   전에는 링크 안에 운영 암호를 되돌릴 수 있는 모양으로 넣었다 - 링크만 있으면 누구나 암호 원문을 꺼냈고,
   기한도 브라우저가 스스로 지킬 뿐이었다. 이제 링크에는 서버가 서명한 표(기한 + 무작위 + 서명)만 든다.
   서명 열쇠는 운영 암호에서 나오므로, 암호를 바꾸면 그동안 나간 링크가 모두 죽는다. */
const linkKey = real => crypto.createHash('sha256').update('bk-ops-link|' + String(real ?? ''), 'utf8').digest();
const linkSig = (real, body) => crypto.createHmac('sha256', linkKey(real)).update(body).digest('base64url');
export function makeOpsLinkToken(real, days) {
  const until = Date.now() + Math.min(30, Math.max(1, +days || 7)) * 864e5;
  const body = until + '.' + crypto.randomBytes(9).toString('base64url');
  return { token: 'L1.' + body + '.' + linkSig(real, body), until };
}
export function opsLinkValid(given, real) {
  const m = /^L1\.(\d{13})\.([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/.exec(String(given || ''));
  if (!m || +m[1] < Date.now()) return false;
  return sameSecret(m[3], linkSig(real, m[1] + '.' + m[2]));
}

export function opsPassCheck(req, given, real) {
  const key = 'opsfail:' + ipOf(req);
  if (overLimit(key, 10, 10 * 60_000, false)) return { code: 429, error: '암호를 여러 번 틀렸습니다 - 10분 뒤에 다시 시도해 주세요' };
  if (sameSecret(given, real) || opsLinkValid(given, real)) return null;
  overLimit(key, 10, 10 * 60_000, true);
  return { code: 401, error: '접근 암호가 맞지 않습니다' };
}

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
    /* 메일 확인 시각도 담는다 - 운영자 명단을 메일로 대조할 때 확인을 마친 메일만 쓴다(opsAccount) */
    const user = j && j.id ? { id: j.id, email: j.email || null, email_confirmed_at: j.email_confirmed_at || j.confirmed_at || null,
      provider: (j.app_metadata && j.app_metadata.provider) || null } : null;
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
/* 부운영자 (2026-11-06 대표님) - BK_OPS_SUBS 쉼표로 구분한 계정 id(또는 확인된 메일).
   운영 화면을 다 보되 연락처 · 메일은 늘 가린 것만, 승인 · 반려 · 지우기 · 임시 링크는 못 한다(demands.js · agent-status.js).
   운영자 명단(BK_OPS_USERS)에도 있으면 운영자로 본다 */
export function opsSublist() {
  return String(process.env.BK_OPS_SUBS || '')
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
  const allow = opsAllowlist(), subs = opsSublist();
  /* 명단이 없어도 누구인지는 알아둔다 - 열람 기록에 적어야 한다 */
  const user = await userFrom(req);
  if (!allow.length) return { user };
  if (!user) return { code: 401, error: '운영자 계정으로 로그인한 뒤 다시 시도해 주세요' };
  const id = String(user.id || '').toLowerCase();
  /* 메일로 명단을 대조할 때는 확인을 마친 메일만 - 확인 안 된 메일을 적어 들어온 계정이 명단을 통과하지 않게 (2026-11-03) */
  /* 소셜 로그인(카카오·구글 등)은 그쪽이 확인한 메일이다. 막는 것은 '비밀번호로 가입하고 메일 확인을 안 한 계정' 뿐 */
  const 믿는메일 = user.email_confirmed_at || user.confirmed_at || (user.provider && user.provider !== 'email');
  const email = 믿는메일 ? String(user.email || '').toLowerCase() : '';
  /* member 는 '로그인만으로 이미 확인이 끝났다' 는 뜻이다. 이 표시가 있으면
     각 화면은 접근 암호를 또 묻지 않는다 - 로그인이 훨씬 강한 문이기 때문이다.
     암호는 사람 사이를 돌아다니고 누가 썼는지 남지 않지만, 계정은 그렇지 않다. */
  if (allow.includes(id) || allow.includes(email)) return { user, member: true };
  if (subs.includes(id) || (email && subs.includes(email))) return { user, member: true, sub: true };

  /* 시험 기간이면 명단에 없어도 들인다. 기간이 지나면 자동으로 다시 막힌다. */
  const until = opsOpenUntil();
  if (until && Date.now() < until) return { user, guest: true, until };

  return { code: 403, error: '이 계정에는 운영 권한이 없습니다' };
}

/** 이 요청에 접근 암호를 더 물어야 하는가.
 *
 *  **명단(BK_OPS_USERS)에 든 계정에만** 묻지 않는다. 그 계정은 대표님이 직접
 *  적어 넣은 것이라 로그인 자체가 암호보다 강한 문이다.
 *
 *  ⚠ 전에는 시험 기간의 손님(guest)에게도 묻지 않았다. 까닭으로 적어둔 말은
 *  '명단을 통과한 사람만 여기까지 온다' 였는데, **guest 는 바로 그 명단을
 *  건너뛴 경로다.** 그래서 기간이 열려 있는 동안에는 가입만 하면 누구나 -
 *  명단에 없어도, 링크가 없어도 - 운영 화면이 열렸다. 거기에는 전체 계정의
 *  메일 주소와 중개사 이름·연락처가 있다. (2026-09-24 에 재 보고 고쳤다)
 *
 *  임시 링크에는 암호가 실려 있으므로(makeOpsLink), 링크를 받은 분의 길은
 *  그대로다. 계정만 있는 사람의 길만 닫힌다. */
export const opsNeedsPass = gate => !gate.member;
