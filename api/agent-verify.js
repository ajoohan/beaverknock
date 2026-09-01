/* 개설등록번호 확인.
 *
 * 지금까지는 아무 번호나 넣어도 "공공데이터에서 사무소를 찾았습니다" 라고
 * 답하고 지어낸 사무소를 보여줬다. 실제 중개사를 상대로는 그냥 거짓말이다.
 *
 * 공공데이터포털 키가 있으면 실제로 조회하고, 없으면 형식만 본다.
 * 어느 쪽인지 응답에 그대로 담는다 - 확인한 척하지 않는다.
 *
 * 선택 환경변수
 *   DATA_GO_KR_KEY   공공데이터포털 서비스 키 (없으면 형식 검사만)
 */

/* 개설등록번호는 시군구코드(5) - 연도(4) - 일련번호(4~5) 다.
   앞 두 자리는 시도 코드로 11(서울)~50(제주) 범위에 든다. */
const SHAPE = /^([1-5][0-9]{4})-((?:19|20)[0-9]{2})-([0-9]{4,5})$/;

const norm = v => String(v ?? '').trim().replace(/\s/g, '');

export function checkShape(raw) {
  const v = norm(raw);
  const m = SHAPE.exec(v);
  if (!m) return { ok: false, reason: '형식이 맞지 않습니다. 41450-2019-00217 처럼 적어주세요' };
  const year = Number(m[2]);
  const now = new Date().getFullYear();
  if (year < 1985 || year > now) return { ok: false, reason: `등록연도(${year})를 확인해 주세요` };
  return { ok: true, sgg: m[1], year, serial: m[3], value: v };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const shape = checkShape(b.reg_no);
  if (!shape.ok) return res.status(400).json({ error: shape.reason });

  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    /* 조회처가 없으면 그렇다고 말한다. 통과시키되 확인했다고 하지 않는다. */
    return res.status(200).json({
      ok: true, verified: false,
      reg_no: shape.value,
      note: '번호 형식은 맞습니다. 실제 등록 여부는 담당자가 확인한 뒤 연락드립니다.',
    });
  }

  /* 국토교통부 부동산중개업 조회. 응답 모양이 지자체마다 달라
     찾으면 알려주고, 못 찾아도 신청 자체는 막지 않는다. */
  try {
    const url = 'https://api.odcloud.kr/api/BrokerageOfficeService/v1/getBrokerageOffice'
      + `?serviceKey=${encodeURIComponent(key)}&page=1&perPage=5`
      + `&cond%5BregNo%3A%3AEQ%5D=${encodeURIComponent(shape.value)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('lookup failed');
    const j = await r.json();
    const hit = (j.data || [])[0];
    if (!hit) {
      return res.status(200).json({
        ok: true, verified: false, reg_no: shape.value,
        note: '공공데이터에서 찾지 못했습니다. 최근 개설하셨다면 반영에 며칠 걸립니다 - 담당자가 확인 후 연락드립니다.',
      });
    }
    return res.status(200).json({
      ok: true, verified: true, reg_no: shape.value,
      office: hit.중개사무소명 || hit.사업자명 || null,
      rep: hit.대표자명 || null,
      addr: hit.소재지도로명주소 || hit.소재지지번주소 || null,
      state: hit.상태 || hit.영업상태 || null,
    });
  } catch (e) {
    return res.status(200).json({
      ok: true, verified: false, reg_no: shape.value,
      note: '지금은 조회처에 닿지 못했습니다. 담당자가 확인한 뒤 연락드립니다.',
    });
  }
}
