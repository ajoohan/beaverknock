/* 본인확인 — 포트원 V2 (KG이니시스 통합본인인증).
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
 *   PORTONE_CHANNEL_KEY   브라우저에 내려보낸다 (공개 식별자)
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

const ready = () => !!(process.env.PORTONE_API_SECRET
  && process.env.PORTONE_STORE_ID && process.env.PORTONE_CHANNEL_KEY
  && process.env.BK_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  /* 화면이 시작할 때 한 번 묻는다 - 붙어 있으면 진짜 흐름을, 아니면 준비 중을 보여준다.
     store_id·channel_key 는 브라우저에 드러나도 되는 값이다. */
  if (req.method === 'GET') {
    return res.status(200).json(ready()
      ? { enabled: true, live: isLive(), store_id: process.env.PORTONE_STORE_ID,
          channel_key: process.env.PORTONE_CHANNEL_KEY }
      : { enabled: false, live: false });
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
    const token = signIdv({ name, phone, birth, op: String(c.operator ?? '').slice(0, 20) });

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
