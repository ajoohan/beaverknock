/* 개설등록번호 확인.
 *
 * 1차 조회처: 전국 명부 (api/_brokers.js · 국토교통부 · 106,749곳)
 *   서울은 오픈API 가 종료됐고 지자체 API 는 제각각이라 파일을 통째로 들고 있다.
 *   네트워크를 타지 않아 빠르고 도로명주소까지 나온다.
 *
 * 2차 조회처: 경기데이터드림 "부동산 중개업 사무소 정보 현황"
 *   https://openapi.gg.go.kr/Rlestatebrkragofc
 *   경기도 전역 30,432건 · 하남시 872건 · 호출 제한 없음
 *   파일은 사람이 갱신해야 하니, 파일에 없으면 여기로 한 번 더 물어본다 -
 *   이번 주에 개설한 하남 사무소가 파일에는 아직 없을 수 있다.
 *   인증키 발급: https://data.gg.go.kr/portal/openapi/insertApikeyPage.do
 *
 * 이 API 는 등록번호로 직접 조회하지 못한다. 요청인자가 시군명·시군코드뿐이라
 * 시군 전체를 받아 여기서 대조한다. 그래서 목록을 캐시에 담아둔다.
 *
 * 확인한 척하지 않는다. 찾으면 verified:true, 못 찾으면 false 와 그 이유를
 * 그대로 돌려준다. 어느 쪽이든 신청 자체는 막지 않는다 -
 * 최근 개설한 사무소는 공공데이터에 아직 없을 수 있다.
 *
 * ── 주소도 여기서 찾는다 ──
 * 함수 열두 개가 상한이라 새 파일을 못 만든다. 하는 일이 같으니 -
 * 공공데이터에 물어보고 있는 그대로 돌려주는 일 - 한 지붕 아래 둔다.
 *
 *   what:'addr'  도로명주소 검색 (행정안전부 주소기반산업지원서비스)
 *   what:'bld'   건축물대장 표제부 (국토교통부 · 면적·용도·사용승인일)
 *
 * 선택 환경변수
 *   GG_API_KEY    경기데이터드림 인증키 (없으면 형식만 본다)
 *   JUSO_KEY      도로명주소 검색 승인키 (business.juso.go.kr · 무료·즉시)
 *   DATA_GO_KEY   공공데이터포털 서비스키 (data.go.kr · 무료·승인 1~2일)
 *   BLD_API       건축물대장 엔드포인트 (신청하신 문서의 주소가 다르면 여기에)
 */

import { findByKey, findByName, STATE_NM, STD_DATE } from './_brokers.js';

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

/* 1984-05 를 그대로 보여주면 자료 같다. 사람이 읽는 말로 바꾼다. */
function koMonth(v) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v ?? ''));
  return m ? `${m[1]}년 ${Number(m[2])}월 등록` : (v || null);
}

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

/* ══════════ 도로명주소 검색 ══════════
   행정안전부 주소기반산업지원서비스. 승인키는 무료이고 신청하면 바로 나온다.

   키가 없으면 '없다' 고 말한다. 지금까지는 주소에 '미사' 가 들어 있으면
   미사강변 아파트라고 지어내 채워 넣고 "건축물대장에서 자동으로 채웠습니다"
   라고 적었다. 확인한 적 없는 것을 확인했다고 말하면, 그 말을 믿고 넘어간
   사람이 나중에 다친다. 지어내느니 비워 두는 편이 낫다. */
const JUSO_API = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';

/* ── 남의 돈으로 도는 문에는 빗장을 건다 ──
   주소와 건축물대장은 우리 인증키로 나간다. 건축물대장은 하루 10,000건,
   주소는 5초에 10건이 상한이다. 이 문은 가입 화면에서도 쓰이므로 로그인을
   요구할 수 없는데, 그러면 아무나 두드려 하루치를 태울 수 있다.
   그날 진짜 손님이 주소를 못 찾는 일이 생기지 않게 IP 로 센다.

   서버리스라 이 표는 인스턴스마다 따로 있고 언젠가 접히면서 사라진다.
   정교한 방벽은 아니지만, 한 곳에서 몰아치는 것을 늦추는 데는 충분하다. */
const hits = new Map();
const LOOK_WINDOW = 60_000, LOOK_MAX = 40;

function tooMany(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter(t => now - t < LOOK_WINDOW);
  /* 표가 끝없이 자라지 않게 - 서버리스라도 한 인스턴스는 꽤 오래 산다 */
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < LOOK_WINDOW)) hits.delete(k);
  if (seen.length >= LOOK_MAX) return true;
  seen.push(now); hits.set(ip, seen);
  return false;
}

async function searchAddr(req, res, b) {
  const key = process.env.JUSO_KEY;
  const q = String(b.keyword || '').trim();
  if (!q || q.length < 2) return res.status(400).json({ error: '두 글자 이상 넣어주세요' });
  if (tooMany(req)) return res.status(429).json({ error: '잠시 후 다시 찾아주세요 - 주소를 직접 적으셔도 됩니다' });
  if (!key) {
    return res.status(200).json({ ok: true, off: true, rows: [],
      note: '주소 검색이 아직 연결되지 않았습니다 - 주소를 직접 적어주세요' });
  }
  try {
    const u = new URL(JUSO_API);
    u.searchParams.set('confmKey', key);
    u.searchParams.set('currentPage', String(Math.max(1, parseInt(b.page, 10) || 1)));
    u.searchParams.set('countPerPage', '10');
    u.searchParams.set('keyword', q);
    u.searchParams.set('resultType', 'json');
    const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return res.status(502).json({ error: '주소를 찾지 못했습니다' });
    const j = await r.json();
    const c = (j.results && j.results.common) || {};
    /* 0 이 정상이다. 그 밖의 코드는 그쪽이 남긴 말을 그대로 옮긴다 -
       '승인키가 잘못되었습니다' 같은 말은 우리가 바꿔 쓸 이유가 없다. */
    if (c.errorCode && c.errorCode !== '0') {
      return res.status(200).json({ ok: true, rows: [], note: c.errorMessage || '주소를 찾지 못했습니다' });
    }
    const rows = (j.results.juso || []).map(x => ({
      road:   x.roadAddrPart1 || x.roadAddr || '',
      detail: x.roadAddrPart2 || '',
      jibun:  x.jibunAddr || '',
      zip:    x.zipNo || '',
      bdNm:   x.bdNm || '',
      si:     x.siNm || '', sgg: x.sggNm || '', emd: x.emdNm || '',
      /* 건축물대장을 물어보려면 이 셋이 필요하다 */
      admCd:  x.admCd || '',            // 법정동코드 10자리 (앞 5 시군구 + 뒤 5 법정동)
      bun:    x.lnbrMnnm || '',         // 지번 본번
      ji:     x.lnbrSlno || '',         // 지번 부번
      mount:  x.mtYn === '1',           // 산 여부
    }));
    return res.status(200).json({ ok: true, rows, total: +c.totalCount || rows.length });
  } catch (e) {
    return res.status(502).json({ error: '주소 조회가 지연되고 있습니다 - 직접 적으셔도 됩니다' });
  }
}

/* ══════════ 건축물대장 표제부 ══════════
   면적·주용도·사용승인일을 채운다. 사람이 옮겨 적다 틀리는 것을 줄이는 일이지,
   확인의 근거는 아니다 - 채운 값은 고칠 수 있게 둔다.

   엔드포인트는 신청한 문서에 적힌 것을 쓴다. 문서가 바뀌는 일이 있어
   환경변수로 바꿀 수 있게 두었다. */
const BLD_DEFAULT = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';

async function readBuilding(req, res, b) {
  const key = process.env.DATA_GO_KEY;
  const admCd = String(b.admCd || '').replace(/[^0-9]/g, '');
  if (admCd.length !== 10) return res.status(400).json({ error: '어느 필지인지 알 수 없습니다' });
  if (tooMany(req)) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요 - 면적·용도는 직접 적으셔도 됩니다' });
  if (!key) {
    return res.status(200).json({ ok: true, off: true,
      note: '건축물대장이 아직 연결되지 않았습니다 - 면적·용도는 직접 적어주세요' });
  }
  try {
    const u = new URL(process.env.BLD_API || BLD_DEFAULT);
    u.searchParams.set('serviceKey', key);
    u.searchParams.set('sigunguCd', admCd.slice(0, 5));
    u.searchParams.set('bjdongCd', admCd.slice(5));
    u.searchParams.set('platGbCd', b.mount ? '1' : '0');   // 0 대지 · 1 산
    u.searchParams.set('bun', String(b.bun || '0').padStart(4, '0'));
    u.searchParams.set('ji', String(b.ji || '0').padStart(4, '0'));
    u.searchParams.set('numOfRows', '5');
    u.searchParams.set('pageNo', '1');
    u.searchParams.set('_type', 'json');
    const r = await fetch(u, { signal: AbortSignal.timeout(7000) });
    const text = await r.text();

    /* 공공데이터포털은 오류를 200 으로도, 400/500 으로도, XML 로도 보낸다.
       어느 쪽이든 그쪽이 남긴 코드와 말을 그대로 옮긴다 - '불러오지 못했습니다'
       한 줄로는 키가 틀린 건지, 그 필지가 없는 건지, 저쪽이 잠깐 죽은 건지
       알 수 없다. 고칠 수 없는 오류 메시지는 오류가 아니다.
       인증키는 어떤 경우에도 밖으로 내보내지 않는다. */
    const upstream = () => {
      const code = (text.match(/<returnReasonCode>([^<]+)</) || text.match(/"returnReasonCode"\s*:\s*"?([^",<]+)/) || [])[1];
      const msg  = (text.match(/<returnAuthMsg>([^<]+)</) || text.match(/<errMsg>([^<]+)</)
                 || text.match(/"resultMsg"\s*:\s*"([^"]+)/) || [])[1];
      return [msg, code && `코드 ${code}`].filter(Boolean).join(' · ');
    };
    const BAD_KEY = /SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_ACCESS_DENIED|30\b|20\b/;

    let j = null;
    try { j = JSON.parse(text); } catch (e) { /* XML 이면 아래에서 걸린다 */ }
    const head = j && j.response && j.response.header;
    const okCode = !head || head.resultCode === '00' || head.resultCode === '0';

    if (!r.ok || !j || !okCode) {
      const why = upstream();
      /* 키 문제는 사람이 고쳐야 하는 것이라 따로 말해준다 */
      const keyBad = BAD_KEY.test(why) || /인증키|SERVICE_KEY/i.test(why);
      return res.status(200).json({ ok: true,
        note: keyBad
          ? `건축물대장 인증키가 받아들여지지 않았습니다 (${why || 'HTTP ' + r.status}) - `
            + 'DATA_GO_KEY 에 Decoding 키를 넣으셨는지 확인해 주세요'
          : `건축물대장을 불러오지 못했습니다${why ? ` (${why})` : ` (HTTP ${r.status})`}`,
        why: why || null, status: r.status });
    }

    const body = j.response.body;
    const raw = body && body.items && body.items.item;
    const it = Array.isArray(raw) ? raw[0] : raw;
    if (!it) {
      return res.status(200).json({ ok: true, none: true,
        note: '건축물대장에 없는 필지입니다 - 직접 적어주세요' });
    }
    const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    const m2 = num(it.totArea);
    return res.status(200).json({ ok: true,
      bldNm:   it.bldNm || '',
      purpose: it.mainPurpsCdNm || '',
      totArea: m2,
      py:      m2 ? Math.round(m2 / 3.3058 * 10) / 10 : null,
      archArea: num(it.archArea),
      floors:  num(it.grndFlrCnt),
      hhld:    num(it.hhldCnt),
      approved: String(it.useAprDay || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'),
      addr:    it.newPlatPlc || it.platPlc || '',
    });
  } catch (e) {
    return res.status(200).json({ ok: true, note: '건축물대장 조회가 지연되고 있습니다 - 직접 적으셔도 됩니다' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  /* 주소는 로그인 전에도 찾을 수 있어야 한다 - 가입하면서 쓰는 것이라
     여기에 문을 두면 가입 자체가 막힌다. 등록번호 조회와 같은 자리다. */
  if (b.what === 'addr') return searchAddr(req, res, b);
  if (b.what === 'bld')  return readBuilding(req, res, b);

  const shape = checkShape(b.reg_no);
  if (!shape.ok) return res.status(400).json({ error: shape.reason });

  const key = keyOf(shape.value);
  const ok = (hit, source, regNo) => {
    const st = typeof hit.state === 'number' ? STATE_NM[hit.state] : hit.state;
    if (st && st !== '영업중') {
      return res.status(200).json({
        ok: true, verified: false, reg_no: regNo, office: hit.office || null,
        note: `등록은 확인했지만 현재 상태가 '${st}' 입니다. 담당자가 확인한 뒤 연락드립니다.`,
      });
    }
    return res.status(200).json({
      ok: true, verified: true, reg_no: regNo,
      office: hit.office || null, rep: hit.rep || null, addr: hit.addr || null,
      state: st || null, since: koMonth(hit.since), source,
    });
  };
  const unverified = (note, detail) => res.status(200).json({
    ok: true, verified: false, reg_no: shape.value, note,
    ...(detail ? { detail: String(detail).slice(0, 200) } : {}),
  });

  /* ① 전국 명부 - 네트워크를 타지 않는다 */
  const local = findByKey(key);
  if (local) return ok(local, `국토교통부 (${STD_DATE} 기준)`, shape.value);

  /* ② 경기 실시간 - 파일 기준일 이후 개설한 곳을 위해 한 번 더 본다 */
  const gkey = process.env.GG_API_KEY;
  const sigun = norm(b.sigun) || DEFAULT_SIGUN;
  if (gkey) {
    try {
      const rows = await fetchSigun(sigun, gkey);
      const hit = rows.find(r => keyOf(r.COPRTN_REG_NO) === key);
      if (hit) {
        const d = norm(hit.REGIST_DE);
        return ok({
          office: hit.BIZMAN_CMPNM_INFO, rep: hit.BRKR_NM,
          addr: hit.LEGALDONG_NM || hit.SIGUN_NM, state: norm(hit.STATE_DIV_NM),
          since: /^\d{8}$/.test(d) ? `${d.slice(0,4)}-${d.slice(4,6)}` : null,
        }, '경기데이터드림', hit.COPRTN_REG_NO || shape.value);
      }
    } catch (e) {
      console.error('[agent-verify] gg', sigun, e && e.message);
    }
  }

  /* ③ 번호로 못 찾았다. 상호가 정확히 맞으면 오타일 수 있으니 알려만 준다. */
  const byName = findByName(nameKey(b.office));
  if (byName) {
    return unverified(
      `'${byName.office}' 는 명부에 있지만 등록번호가 다릅니다`
      + ` (등록된 번호 ${byName.reg_no}). 번호를 다시 확인해 주세요.`);
  }

  return unverified(
    '전국 공공데이터에서 찾지 못했습니다. 최근 개설하셨다면 아직 반영되지 않았을 수 있습니다'
    + ' - 신청은 접수되며 담당자가 확인 후 연락드립니다.');
}
