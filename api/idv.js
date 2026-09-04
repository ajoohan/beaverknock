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
 *   BK_SECRET_KEY         표에 서명할 때 쓴다
 */

import crypto from 'node:crypto';
import { signIdv } from './_idv.js';

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
      ? { enabled: true, store_id: process.env.PORTONE_STORE_ID,
          channel_key: process.env.PORTONE_CHANNEL_KEY }
      : { enabled: false });
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
