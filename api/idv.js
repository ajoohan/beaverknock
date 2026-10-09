/* 본인확인 — 포트원 V2.
 *
 * 다날(휴대폰 문자 인증)과 KG이니시스(통합 본인인증 - 카카오·네이버·토스·PASS)
 * **둘 다 연다** (2026-10-06, 둘 다 실계약 완료). 고르는 것은 손님이다 -
 * 앱 간편인증이 편한 분이 있고, 앱이 없어 문자가 편한 분이 있다.
 * 결과 확인(POST)은 어느 쪽이든 같다. 포트원 V2 가 PG 차이를 흡수해
 * verifiedCustomer 로 같은 모양을 돌려주기 때문이다.
 * ⚠ 다날은 테스트 모드를 지원하지 않는다. 실채널 키를 넣는 그 순간이 첫 시험이다.
 *
 * 지금까지는 아무 숫자 여섯 자리나 넣으면 통과했다. 화면에는 "본인확인 완료"가
 * 뜨고, 개인정보 처리방침에는 "본인확인된 이름을 전달한다"고 적혀 있었다.
 * 확인한 적이 없으니 그냥 거짓말이다.
 *
 * 흐름
 *   ① 브라우저가 포트원 창을 띄운다 (SDK)
 *   ② 끝나면 identityVerificationId 를 들고 여기로 온다
 *   ③ 여기서 포트원에 다시 물어 진짜 통과했는지 본다 - 브라우저 말을 믿지 않는다
 *   ④ 확인된 이름·생년월일·번호를 서명한 표를 끊어준다
 *   ⑤ 조건을 낼 때 그 표를 함께 낸다. demand.js 가 서명을 확인하고,
 *      화면에서 적은 이름이 아니라 표에 적힌 이름을 저장한다.
 *
 * CI·DI 는 받아도 버린다. 처리방침에 "주민등록번호는 받지도 저장하지도
 * 않는다"고 적어둔 이상, 그것에서 나온 값도 들고 있지 않는 편이 맞다.
 *
 * 환경변수
 *   PORTONE_API_SECRET    서버 전용 (V2 API Secret)
 *   PORTONE_STORE_ID      브라우저에 내려보낸다 (공개 식별자)
 *   PORTONE_CHANNEL_KEY_INICIS  KG이니시스 통합인증 채널 (공개 식별자)
 *   PORTONE_CHANNEL_KEY_DANAL   다날 휴대폰 본인인증 채널 (공개 식별자)
 *   PORTONE_CHANNEL_KEY   예전 한 개짜리. 위 둘이 비어 있을 때만 쓴다
 *   BK_SECRET_KEY         표에 서명할 때 쓴다 · bk_idv_use 에 적을 때도 쓴다
 *   BK_URL                bk_idv_use 를 읽고 쓴다
 *   PORTONE_LIVE          실계약 채널이면 '1'. 공용 테스트 MID 면 비워 둔다
 */

/* 테스트 MID 도 창은 뜨고 결과도 돌아온다. 그래서 '붙었는가(enabled)' 만으로는
   '진짜인가' 를 알 수 없다. 공급자 가입처럼 테스트 값으로 통과시키면 곤란한
   자리가 있어서, 실계약 여부를 따로 들고 다닌다.
   MID 가 오는 날 PORTONE_CHANNEL_KEY 와 이 값을 같이 바꾸면 된다. */
const isLive = () => process.env.PORTONE_LIVE === '1';

/* 같은 거래번호로 두 번 표를 끊어주지 않는다.
   휴대폰에서 돌아올 때 주소창에 ?identityVerificationId=... 가 그대로 붙는다.
   기록에도 남고 링크를 복사해 보낸 곳에도 남는다. 그 번호만 알면 남의
   이름·생년월일·연락처가 담긴 표를 받아갈 수 있었다.

   기본키라서 두 번째 insert 는 409 로 튕긴다 - 먼저 읽고 나중에 쓰면
   그 사이에 둘이 동시에 들어올 수 있으니, 읽지 않고 넣어보고 판단한다.
   true 면 이번이 처음이다. */
async function claimOnce(vid) {
  const { BK_URL, BK_SECRET_KEY } = process.env;
  if (!BK_URL || !BK_SECRET_KEY) return { ok: false, why: 'no db' };
  try {
    const r = await fetch(sbUrl('bk_idv_use'), {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ vid }),
    });
    if (r.status === 409) return { ok: false, why: 'used' };
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      /* 0018 전이면 표가 없다. 그때는 본인확인을 막지 않는다 - 다만 로그로 남긴다. */
      if (/does not exist|PGRST205/i.test(t)) {
        console.error('[idv] bk_idv_use 없음 - 0018 을 실행해야 한다');
        return { ok: true, skipped: true };
      }
      console.error('[idv] 사용 기록 실패', r.status, t.slice(0, 160));
      return { ok: false, why: 'db' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[idv] 사용 기록 오류', e && e.message);
    return { ok: false, why: 'db' };
  }
}

import { signIdv } from './_idv.js';
import { sbHeaders, sbUrl } from './_auth.js';

const API = 'https://api.portone.io/identity-verifications';

/* 열려 있는 창구. 순서가 곧 화면의 순서다 - 간편인증이 먼저다
   (앱 하나 열면 끝나서 대개 더 빠르다). 둘 다 비어 있으면 예전 한 개짜리
   키로 물러선다 - 키를 옮겨 넣는 사이에 본인확인이 꺼지면 안 된다. */
function channels() {
  const e = process.env, list = [];
  if (e.PORTONE_CHANNEL_KEY_INICIS) list.push({ k: 'inicis', key: e.PORTONE_CHANNEL_KEY_INICIS.trim() });
  if (e.PORTONE_CHANNEL_KEY_DANAL)  list.push({ k: 'danal',  key: e.PORTONE_CHANNEL_KEY_DANAL.trim() });
  if (!list.length && e.PORTONE_CHANNEL_KEY) list.push({ k: 'one', key: e.PORTONE_CHANNEL_KEY.trim() });
  return list;
}

const ready = () => !!(process.env.PORTONE_API_SECRET
  && process.env.PORTONE_STORE_ID && channels().length
  && process.env.BK_SECRET_KEY);

/* ── 남의 돈으로 도는 문에는 빗장을 건다 ──
   이 문은 로그인을 묻지 않는다. 조건을 쓰기 **전에** 본인확인을 받기 때문이다.
   그런데 한 번 부를 때마다 우리 열쇠로 포트원 API 를 두드린다 - 빗장이 없으면
   아무나 끝없이 두드려 우리 몫의 한도를 태울 수 있다.
   주소 검색(agent-verify.js)에는 같은 이유로 이미 빗장이 걸려 있었는데
   여기만 없었다. 같은 모양으로 건다. (2026-09-24)

   ⚠ 수를 정할 때 **한 사람 기준으로 세면 안 된다.** 국내 통신사는 여럿을
   한 주소(CGNAT) 뒤에 묶는다 - 같은 LTE 망에서 열 분이 1분 안에 본인확인을
   받으면 열한 번째 분이 막힌다. 오픈 첫날이 꼭 그렇다.
   30번이면 사람은 거의 닿지 않고, 두드리는 쪽은 1분에 30번으로 묶인다.
   주소 검색(agent-verify.js)이 40번인 것과 같은 결의 값이다. */
const hits = new Map();
const WINDOW = 60_000, MAX = 30;

function tooMany(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || (req.socket && req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  /* 표가 끝없이 자라지 않게 - 서버리스라도 한 인스턴스는 꽤 오래 산다 */
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW)) hits.delete(k);
  if (seen.length >= MAX) return true;
  seen.push(now); hits.set(ip, seen);
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* 화면이 시작할 때 한 번 묻는다 - 붙어 있으면 진짜 흐름을, 아니면 준비 중을 보여준다.
     store_id·channel_key 는 브라우저에 드러나도 되는 값이다. */
  if (req.method === 'GET') {
    if (!ready()) return res.status(200).json({ enabled: false, live: false });
    const ch = channels();
    /* ── 실계약이라고 해 놓고 예전 키로 물러선 상태 (2026-10-09) ──
       PORTONE_LIVE=1 만 먼저 넣고 새 창구 키(_INICIS · _DANAL)가 아직 없으면
       예전 PORTONE_CHANNEL_KEY(시험 채널)로 창이 열린다. 그런데 결과 확인(POST)은
       LIVE 채널만 받으므로 **모든 본인확인이 거절된다** - 손님은 인증을 끝까지
       하고도 '받을 수 없습니다' 만 본다. 그런데도 여기는 enabled·live 둘 다 참이라
       설정 실수가 겉으로 안 보였다. 경고를 함께 내보내고(운영 화면이 띄운다)
       서버 기록에도 남긴다. 창구를 막지는 않는다 - 예전 키가 실은 실채널일 수도 있다. */
    const warn = isLive() && ch.every(c => c.k === 'one') ? 'live-legacy-key' : null;
    if (warn) console.error('[idv] PORTONE_LIVE=1 인데 새 창구 키가 없다 - 예전 키로 열리고, 그 키가 시험 채널이면 모든 인증이 거절된다');
    return res.status(200).json({
      enabled: true, live: isLive(), store_id: process.env.PORTONE_STORE_ID,
      ...(warn ? { warn } : {}),
      channels: ch,
      channel_key: ch[0].key,          /* 10/6 이전 화면(캐시)이 읽던 자리. 새 화면은 channels 만 본다 - 몇 주 뒤 지운다 */
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });
  if (!ready()) return res.status(503).json({ error: '본인확인이 아직 연결되지 않았습니다' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const id = String(b.identity_verification_id ?? '').trim();
  if (!id || id.length > 120 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: '본인확인 정보를 확인하지 못했습니다' });
  }

  /* 생김새를 본 **뒤에** 센다. 오타로 되돌아온 것까지 세면, 잘못 누른 분이
     잠겨 버린다 - 포트원을 실제로 두드리는 것만 센다. */
  if (tooMany(req)) {
    return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
  }

  try {
    const r = await fetch(`${API}/${encodeURIComponent(id)}`, {
      headers: { Authorization: `PortOne ${process.env.PORTONE_API_SECRET}` },
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('[idv] 조회 실패', r.status, t.slice(0, 200));
      return res.status(502).json({ error: '본인확인 결과를 확인하지 못했습니다' });
    }
    const j = await r.json();
    if (j.status !== 'VERIFIED') {
      return res.status(400).json({ error: '본인확인이 완료되지 않았습니다', status: j.status });
    }

    /* ── 어느 창구에서 받은 인증인가 (2026-10-08) ──
       포트원은 **상점 단위**로 묻는다 - 우리 열쇠로 조회하면 같은 상점의
       어느 채널에서 받은 인증이든 VERIFIED 로 돌아온다. 그런데 9월 내내
       /api/idv 가 **시험 채널 키**를 공개로 내려보냈고, 그 채널은 포트원에
       아직 살아 있다. 그 키로 시험 인증을 마친 id 를 여기로 보내면, 실계약을
       켠 뒤에도 가짜 이름이 '확인된 이름' 으로 서명되어 나갔다.
       그래서 응답의 channel 을 본다.
         · 실계약(PORTONE_LIVE=1)이면 LIVE 채널만 받는다. channel 이 없으면 막는다.
         · 키가 실려 오면 지금 열어 둔 창구의 키여야 한다 - 시험 기간에도 그렇다.
       어긋나면 번호를 태우기(claimOnce) **전에** 돌려보낸다. */
    const 창구 = j.channel || null;
    const 열어둔키 = channels().map(c => c.key);
    const 어긋남 = isLive()
      ? (!창구 || 창구.type !== 'LIVE' || (창구.key && !열어둔키.includes(창구.key)))
      : (창구 && 창구.key && !열어둔키.includes(창구.key));
    if (어긋남) {
      console.error('[idv] 창구 불일치', 창구 ? `${창구.type || '?'} ${String(창구.key || '').slice(0, 24)}` : 'channel 없음');
      return res.status(403).json({ error: '이 본인확인은 받을 수 없습니다 - 다시 받아주세요', again: true });
    }

    /* 통과한 것을 확인한 다음에 번호를 잡는다. 실패한 시도까지 태워버리면
       다시 시도할 때 막힌다. */
    const once = await claimOnce(id);
    if (!once.ok) {
      return once.why === 'used'
        ? res.status(409).json({ error: '이미 사용된 본인확인입니다 - 다시 받아주세요', again: true })
        : res.status(502).json({ error: '본인확인 결과를 확인하지 못했습니다' });
    }

    const c = j.verifiedCustomer || {};
    const name  = String(c.name ?? '').trim();
    const phone = String(c.phoneNumber ?? '').replace(/[^0-9]/g, '');
    const birth = String(c.birthDate ?? '').replace(/-/g, '');   // YYYY-MM-DD → YYYYMMDD

    if (!name || !/^01[016789][0-9]{7,8}$/.test(phone)) {
      return res.status(502).json({ error: '본인확인 결과가 온전하지 않습니다' });
    }

    /* ci·di 는 여기서 끝난다. 로그에도 남기지 않는다. */
    /* live: 실계약에서 끊은 표인가. 전환 직전 시험 창구로 받은 표가 전환 뒤
       30분 동안 통하지 않게, 읽는 쪽(readIdv)이 이 값을 본다. */
    const token = signIdv({ name, phone, birth, op: String(c.operator ?? '').slice(0, 20), live: isLive() });

    return res.status(200).json({
      ok: true, name, phone, birth,
      operator: c.operator || null,
      token,
    });
  } catch (e) {
    console.error('[idv] 오류', e && e.message);
    return res.status(502).json({ error: '본인확인 서버에 닿지 못했습니다' });
  }
}
