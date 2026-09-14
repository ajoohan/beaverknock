/* 카카오 연결 해제 웹훅 — 밖에서 끊긴 인연을 우리도 정리한다.
 *
 * 사람은 우리 화면에 오지 않고도 연결을 끊을 수 있다. 카카오계정 설정에서,
 * 카카오톡의 '연결된 서비스 관리'에서, 또는 카카오계정 자체를 없애면서.
 * 그때 카카오가 이 주소를 두드린다. 두드림을 받지 못하면 우리 쪽에는
 * 이름과 연락처가 그대로 남는다 - 본인은 끊었다고 믿는데.
 *
 * 카카오 개발자센터에 등록할 주소
 *   https://beaverknock.co.kr/api/auth/kakao/unlink
 *
 * 요청 (GET 또는 POST 둘 다 온다)
 *   Authorization: KakaoAK ${대표 어드민 키}
 *   app_id · user_id · referrer_type  (질의문자열 또는 JSON 본문)
 *
 * 답
 *   3초 안에 200. 그것 말고는 재시도 대상이 된다.
 *
 * 환경변수
 *   KAKAO_ADMIN_KEY   카카오 개발자센터 > 앱 > 앱 키 > 어드민 키
 *   BK_URL · BK_SECRET_KEY
 */

import crypto from 'node:crypto';
import { logOps } from '../../_opslog.js';
import { sbHeaders, sbUrl } from '../../_auth.js';

/* 어드민 키는 비밀이다. 길이가 다르면 그것만으로도 답이 갈리지 않게 한다. */
function sameKey(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

const param = (req, name) => {
  const b = req.body && typeof req.body === 'object' ? req.body : null;
  if (b && b[name] != null) return String(b[name]);
  try {
    const u = new URL(req.url, 'https://x');
    const v = u.searchParams.get(name);
    if (v != null) return v;
  } catch (e) { /* 주소가 이상하면 질의문자열은 없는 셈 친다 */ }
  return '';
};

const admin = path => `${process.env.BK_URL}/auth/v1/admin/${path}`;
const adminHeaders = () => ({
  apikey: process.env.BK_SECRET_KEY,
  Authorization: 'Bearer ' + process.env.BK_SECRET_KEY,
  'Content-Type': 'application/json',
});

/* 카카오가 준 것은 카카오 회원번호뿐이다. 우리 계정표에는 그 번호로 찾는 길이
   없다 - Supabase 는 identities 안에 넣어 두고 검색은 메일로만 해준다.
   그래서 명단을 넘겨 가며 찾는다. 지금 계정 수에서는 한두 번이면 끝난다.
   명단이 이 한도를 넘도록 자라면 그때는 가입 시점에 번호를 따로 적어 둬야 한다. */
const PER = 200, MAX_PAGES = 10;

async function findByKakaoId(kakaoId) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(admin(`users?page=${page}&per_page=${PER}`), { headers: adminHeaders() });
    if (!r.ok) throw new Error('계정 명단을 읽지 못했습니다 ' + r.status);
    const j = await r.json();
    const users = j.users || j || [];
    for (const u of users) {
      const ids = (u.identities || [])
        .filter(i => i.provider === 'kakao')
        .map(i => String(i.provider_id ?? (i.identity_data && i.identity_data.sub) ?? ''));
      /* 매직링크로 만든 계정은 identities 에 kakao 가 없다 - 메타데이터도 본다 */
      const meta = u.user_metadata || {};
      if (String(meta.provider) === 'kakao') ids.push(String(meta.provider_id ?? meta.sub ?? ''));
      if (ids.includes(kakaoId)) return u;
    }
    if (users.length < PER) return null;          /* 마지막 쪽까지 봤다 */
  }
  throw new Error('명단이 한도를 넘었다');         /* 조용히 못 찾은 척하지 않는다 */
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET 또는 POST 만 받습니다' });
  }

  const { KAKAO_ADMIN_KEY, BK_URL, BK_SECRET_KEY } = process.env;
  /* 키가 없으면 확인할 방법이 없다. 확인 못 하는 요청으로 계정을 지우지 않는다. */
  if (!KAKAO_ADMIN_KEY || !BK_URL || !BK_SECRET_KEY) {
    console.error('[kakao:unlink] 환경변수가 없다');
    return res.status(503).json({ error: 'not configured' });
  }

  const auth = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const m = /^KakaoAK\s+(.+)$/i.exec(auth);
  if (!m || !sameKey(m[1].trim(), KAKAO_ADMIN_KEY)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const kakaoId = param(req, 'user_id').trim();
  const why = param(req, 'referrer_type').slice(0, 40) || 'UNKNOWN';
  if (!/^[0-9]{1,20}$/.test(kakaoId)) {
    return res.status(400).json({ error: 'user_id' });
  }

  try {
    const u = await findByKakaoId(kakaoId);
    /* 이미 없는 사람이다. 카카오에게는 끝났다고 답한다 - 다시 부를 일이 없다. */
    if (!u) {
      await logOps(req, null, { action: 'kakao-unlink', count: 0, detail: `${why} · 해당 계정 없음` });
      return res.status(200).json({ ok: true });
    }

    /* ① 파트너 신청이 걸려 있으면 계정만 떼어낸다.
          중개사 행을 지우면 그 사람이 손님에게 보낸 제안이 함께 사라진다
          (bk_proposal 이 bk_agent 를 cascade 로 따라간다). 끊은 사람의 뜻은
          '나와의 연결을 끊어라' 이지 '남이 받은 제안을 지워라' 가 아니다.
          사람이 보고 처리하도록 기록만 남긴다. */
    let agent = 0;
    const ar = await fetch(sbUrl('bk_agent', `user_id=eq.${u.id}`), {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: null }),
    });
    if (ar.ok) agent = (await ar.json()).length;

    /* ② 조건은 지운다. 이름·연락처가 들어 있고, 더 들고 있을 근거가 없다.
          붙어 있던 제안은 cascade 로 함께 사라진다 - 받는 사람이 떠났으니 맞다. */
    let gone = 0;
    const dr = await fetch(sbUrl('bk_demand', `user_id=eq.${u.id}`), {
      method: 'DELETE',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
    });
    if (!dr.ok) throw new Error('조건을 지우지 못했습니다 ' + dr.status);
    gone = (await dr.json()).length;

    /* ③ 계정을 지운다. 마지막이다 - 위 둘이 실패하면 여기까지 오지 않는다. */
    const ur = await fetch(admin('users/' + encodeURIComponent(u.id)), {
      method: 'DELETE', headers: adminHeaders(),
    });
    if (!ur.ok && ur.status !== 404) throw new Error('계정을 지우지 못했습니다 ' + ur.status);

    await logOps(req, null, {
      action: 'kakao-unlink', count: gone,
      detail: `${why} · 조건 ${gone}건 삭제${agent ? ` · 파트너 신청 ${agent}건 분리(확인 필요)` : ''}`,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    /* 200 이 아니면 카카오가 다시 부른다. 조용히 성공한 척하지 않는다. */
    console.error('[kakao:unlink]', e && e.message);
    await logOps(req, null, { action: 'kakao-unlink', detail: `${why} · 실패: ${(e && e.message) || ''}` })
      .catch(() => {});
    return res.status(500).json({ error: 'failed' });
  }
}
