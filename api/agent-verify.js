/* 개설등록번호 확인.
 *
 * 조회처: 경기데이터드림 "부동산 중개업 사무소 정보 현황"
 *   https://openapi.gg.go.kr/Rlestatebrkragofc
 *   경기도 전역 30,432건 · 하남시 872건 · 호출 제한 없음
 *   인증키 발급: https://data.gg.go.kr/portal/openapi/insertApikeyPage.do
 *
 * 이 API 는 등록번호로 직접 조회하지 못한다. 요청인자가 시군명·시군코드뿐이라
 * 시군 전체를 받아 여기서 대조한다. 그래서 목록을 캐시에 담아둔다.
 *
 * 확인한 척하지 않는다. 찾으면 verified:true, 못 찾으면 false 와 그 이유를
 * 그대로 돌려준다. 어느 쪽이든 신청 자체는 막지 않는다 -
 * 최근 개설한 사무소는 공공데이터에 아직 없을 수 있다.
 *
 * 선택 환경변수
 *   GG_API_KEY   경기데이터드림 인증키 (없으면 형식만 본다)
 */

const API = 'https://openapi.gg.go.kr/Rlestatebrkragofc';
const DEFAULT_SIGUN = '하남시';
const TTL = 6 * 60 * 60 * 1000;

/* ── 형식 ──
   요즘 번호는 41450-2019-00217 이지만, 1980~90년대에 낸 사무소는
   '가3665-4' 처럼 전혀 다르게 생겼다. 하남시 872곳 안에 그런 번호가 섞여 있다.
   신형만 받으면 오래된 중개사가 자기 진짜 번호를 넣고도 막힌다. */
const MODERN = /^([1-5][0-9]{4})-((?:19|20)[0-9]{2})-([0-9]{1,6})$/;

const norm = v => String(v ?? '').trim().replace(/\s+/g, '');
const digits = v => String(v ?? '').replace(/[^0-9]/g, '');

export function checkShape(raw) {
  const v = norm(raw);
  if (!v) return { ok: false, reason: '개설등록번호를 적어주세요' };
  if (v.length > 30) return { ok: false, reason: '개설등록번호가 너무 깁니다' };
  if (digits(v).length < 3) return { ok: false, reason: '개설등록번호를 다시 확인해 주세요' };
  if (/[^0-9A-Za-z가-힣\-()제호 ]/.test(v)) return { ok: false, reason: '개설등록번호에 쓸 수 없는 문자가 있습니다' };

  const m = MODERN.exec(v);
  if (m) {
    const year = Number(m[2]);
    const now = new Date().getFullYear();
    if (year < 1980 || year > now) return { ok: false, reason: `등록연도(${year})를 확인해 주세요` };
    return { ok: true, form: 'modern', sgg: m[1], year, serial: m[3], value: v };
  }
  /* 옛 번호는 규칙이 제각각이라 형태로 판정하지 않는다 - 조회로 가린다 */
  return { ok: true, form: 'legacy', value: v };
}

/* 41450-2019-00217 과 41450-2019-217 은 같은 번호다 */
function keyOf(v) {
  const m = MODERN.exec(norm(v));
  if (m) return `${m[1]}-${m[2]}-${String(Number(m[3]))}`;
  return norm(v).replace(/[제호()\-]/g, '').toUpperCase();
}

/* 상호는 표기가 흔들린다 - '미사중앙공인중개사사무소' / '미사중앙 공인중개사 사무소' */
const nameKey = v => norm(v).replace(/[()\-·.]/g, '')
  .replace(/(공인)?중개사?(사무소|사무실|중개인)?$/, '').toUpperCase();

const cache = new Map();

async function fetchSigun(sigun, key) {
  const hit = cache.get(sigun);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;

  const rows = [];
  const size = Number(process.env.GG_PAGE_SIZE) || 1000;
  for (let page = 1; page <= Math.ceil(6000 / size); page++) {
    const url = `${API}?KEY=${encodeURIComponent(key)}&Type=json`
      + `&pIndex=${page}&pSize=${size}&SIGUN_NM=${encodeURIComponent(sigun)}`;
    /* 기본 UA 로는 500 이 온다. 평범한 브라우저처럼 물어본다. */
    const r = await fetch(url, { headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  + ' (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    } });
    if (!r.ok) throw new Error('http ' + r.status);
    const text = await r.text();
    let j; try { j = JSON.parse(text); }
    catch { throw new Error('json 아님: ' + text.slice(0, 120)); }
    /* 키가 틀렸거나 상한을 넘으면 여기로 온다 - 메시지를 그대로 살린다 */
    if (j.RESULT) throw new Error(j.RESULT.CODE + ' ' + (j.RESULT.MESSAGE || ''));
    const body = j.Rlestatebrkragofc;
    if (!Array.isArray(body)) throw new Error('모양이 다름: ' + Object.keys(j).join(','));
    const total = body[0]?.head?.[0]?.list_total_count ?? 0;
    const got = body[1]?.row || [];
    rows.push(...got);
    if (!got.length || rows.length >= total) break;
  }
  cache.set(sigun, { at: Date.now(), rows });
  return rows;
}

const STATE_OK = new Set(['영업중', '정상']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const shape = checkShape(b.reg_no);
  if (!shape.ok) return res.status(400).json({ error: shape.reason });

  /* 왜 못 봤는지는 남긴다. 삼키면 다음에 또 헤맨다 - 키 자체는 담지 않는다. */
  const unverified = (note, detail) => res.status(200).json({
    ok: true, verified: false, reg_no: shape.value, note,
    ...(detail ? { detail: String(detail).slice(0, 200) } : {}),
  });

  const key = process.env.GG_API_KEY;
  if (!key) {
    return unverified('번호 형식은 확인했습니다. 실제 등록 여부는 담당자가 확인한 뒤 연락드립니다.');
  }

  /* 경기도 자료다. 하남 밖 번호는 자동으로 가리지 못한다 - 그렇다고 말한다. */
  const sigun = norm(b.sigun) || DEFAULT_SIGUN;

  try {
    const rows = await fetchSigun(sigun, key);
    if (!rows.length) return unverified('조회할 자료를 받지 못했습니다. 담당자가 확인한 뒤 연락드립니다.');

    const want = keyOf(shape.value);
    let hit = rows.find(r => keyOf(r.COPRTN_REG_NO) === want);

    if (!hit) {
      /* 번호는 못 찾아도 상호가 정확히 맞으면 오타일 수 있다 - 알려만 준다 */
      const wantName = nameKey(b.office);
      const byName = wantName.length >= 2
        ? rows.find(r => nameKey(r.BIZMAN_CMPNM_INFO) === wantName) : null;
      if (byName) {
        return res.status(200).json({
          ok: true, verified: false, reg_no: shape.value,
          note: `${sigun}에 '${byName.BIZMAN_CMPNM_INFO}' 는 있지만 등록번호가 다릅니다`
              + ` (등록된 번호 ${byName.COPRTN_REG_NO}). 번호를 다시 확인해 주세요.`,
        });
      }
      return unverified(
        `${sigun} 공공데이터에서 찾지 못했습니다. 최근 개설하셨거나 다른 지역이면 아직 없을 수 있습니다`
        + ' - 신청은 접수되며 담당자가 확인 후 연락드립니다.');
    }

    const state = norm(hit.STATE_DIV_NM);
    if (state && !STATE_OK.has(state)) {
      return res.status(200).json({
        ok: true, verified: false, reg_no: shape.value,
        office: hit.BIZMAN_CMPNM_INFO || null,
        note: `등록은 확인했지만 현재 상태가 '${state}' 입니다. 담당자가 확인한 뒤 연락드립니다.`,
      });
    }

    const d = norm(hit.REGIST_DE);
    return res.status(200).json({
      ok: true, verified: true,
      reg_no: hit.COPRTN_REG_NO || shape.value,
      office: hit.BIZMAN_CMPNM_INFO || null,
      rep:    hit.BRKR_NM || null,
      addr:   hit.LEGALDONG_NM || hit.SIGUN_NM || null,
      state:  state || null,
      since:  /^\d{8}$/.test(d) ? `${d.slice(0,4)}년 ${+d.slice(4,6)}월 등록` : null,
      source: '경기데이터드림',
    });
  } catch (e) {
    console.error('[agent-verify]', sigun, e && e.message);
    return unverified('지금은 조회처에 닿지 못했습니다. 담당자가 확인한 뒤 연락드립니다.',
      (e && e.message) || 'unknown');
  }
}
