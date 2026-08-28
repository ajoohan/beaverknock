/* 조건 접수 — 브라우저 대신 여기서 저장한다.
 *
 * 이 함수를 두는 이유는 하나다: 페이지에서 Supabase 키를 없애기 위해서.
 * 예전에는 퍼블리시 키가 소스에 그대로 있어 누구나 직접 INSERT 할 수 있었다.
 * 이제 브라우저는 이 함수만 부르고, 키는 서버에만 있다.
 *
 * 필요한 환경변수
 *   BK_URL         https://xxxx.supabase.co
 *   BK_SECRET_KEY  service_role 키
 */

import crypto from 'node:crypto';

const TABLE = 'bk_demand';

/* 같은 인스턴스가 살아 있는 동안의 연타 방지.
   서버리스라 인스턴스가 갈리면 초기화된다 — 지속적인 차단은 아래 DB 카운트가 맡는다. */
const burst = new Map();
const BURST_WINDOW = 60_000, BURST_MAX = 3;

const WINDOW_MIN = 10;     // DB 기준 창
const WINDOW_MAX = 5;      // 한 IP가 10분 안에 넣을 수 있는 최대 건수

const ipHash = (ip, salt) =>
  crypto.createHash('sha256').update(String(ip) + '|' + salt).digest('hex').slice(0, 32);

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  if (typeof f === 'string' && f) return f.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const str = (v, max = 400) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const arr = (v, max = 30) =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, max).map(x => x.trim().slice(0, 80)) : [];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 받습니다' });

  const { BK_URL, BK_SECRET_KEY } = process.env;
  if (!BK_URL || !BK_SECRET_KEY) {
    return res.status(503).json({
      error: '서버에 환경변수가 설정되지 않았습니다',
      need: ['BK_URL', 'BK_SECRET_KEY'].filter(k => !process.env[k]),
    });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ error: '본문을 읽지 못했습니다' });

  /* ── 사람인지 보는 세 가지 ── */
  if (str(b.website)) return res.status(200).json({ ok: true });          // 함정칸: 봇만 채운다. 조용히 성공처럼 답한다.
  if (Number(b.elapsed) < 3000) return res.status(429).json({ error: '너무 빠릅니다. 잠시 후 다시 시도해 주세요' });

  const ip = clientIp(req);
  const now = Date.now();
  const hit = (burst.get(ip) || []).filter(t => now - t < BURST_WINDOW);
  if (hit.length >= BURST_MAX) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
  hit.push(now); burst.set(ip, hit);
  if (burst.size > 5000) burst.clear();

  /* ── 값 검사 — 화면을 우회해 들어오는 요청도 여기서 걸린다 ── */
  const kind = b.kind === 'shop' ? 'shop' : b.kind === 'home' ? 'home' : null;
  const dongs = arr(b.dongs);
  const name = str(b.name, 40);
  const phone = String(b.phone ?? '').replace(/-/g, '');
  const bad =
    !kind ? '유형이 없습니다' :
    !dongs.length ? '지역을 하나 이상 골라주세요' :
    !name ? '이름이 없습니다' :
    !/^01[016789][0-9]{7,8}$/.test(phone) ? '연락처 형식이 맞지 않습니다' :
    (b.agree_third_party !== true || b.agree_multi_alert !== true) ? '필수 동의가 없습니다' :
    null;
  if (bad) return res.status(400).json({ error: bad });

  const salt = BK_SECRET_KEY.slice(0, 24);
  const iph = ipHash(ip, salt);
  const sb = p => `${BK_URL}/rest/v1/${p}`;
  const H = {
    apikey: BK_SECRET_KEY,
    Authorization: 'Bearer ' + BK_SECRET_KEY,
    'Content-Type': 'application/json',
  };

  /* ── 인스턴스를 갈아타도 남는 제한: 최근 10분 접수 수를 센다 ── */
  try {
    const since = new Date(now - WINDOW_MIN * 60_000).toISOString();
    const r = await fetch(sb(`${TABLE}?select=id&ip_hash=eq.${iph}&created_at=gte.${since}`), { headers: H });
    if (r.ok) {
      const prev = await r.json();
      if (Array.isArray(prev) && prev.length >= WINDOW_MAX) {
        return res.status(429).json({ error: `${WINDOW_MIN}분 안에 너무 많이 접수됐습니다. 잠시 후 다시 시도해 주세요` });
      }
    }
    /* 조회가 실패해도(컬럼 없음 등) 접수는 막지 않는다 — 앞의 두 방어는 이미 통과했다 */
  } catch { /* 무시 */ }

  const row = {
    kind, who: kind, dongs,
    deal: kind === 'shop' ? null : str(b.deal, 20),
    dep: int(b.dep), rent: int(b.rent), fee_included: true,
    key_money: kind === 'shop' ? int(b.key_money) : null,

    htype: kind === 'shop' ? [] : arr(b.htype),
    rooms: kind === 'shop' ? null : str(b.rooms, 20),
    when_text: kind === 'shop' ? null : str(b.when_text, 200),
    musts: kind === 'shop' ? [] : arr(b.musts),
    must_free: kind === 'shop' ? null : str(b.must_free, 300),
    floor_avoid: kind === 'shop' ? null : str(b.floor_avoid, 20),
    household: kind === 'shop' ? null : str(b.household, 20),
    elevator: kind === 'shop' ? null : str(b.elevator, 20),
    loan_plan: kind === 'shop' ? null : str(b.loan_plan, 20),

    biz: kind === 'shop' ? str(b.biz, 100) : null,
    area_min: kind === 'shop' ? num(b.area_min) : null,
    area_max: kind === 'shop' ? num(b.area_max) : null,
    shop_floor_free: kind === 'shop' ? str(b.shop_floor_free, 300) : null,
    facilities_free: kind === 'shop' ? str(b.facilities_free, 300) : null,
    key_ok: kind === 'shop' ? str(b.key_ok, 30) : null,
    sign_need: kind === 'shop' ? str(b.sign_need, 30) : null,
    park_need: kind === 'shop' ? int(b.park_need) : null,
    shop_note: kind === 'shop' ? str(b.shop_note, 500) : null,
    open_when: kind === 'shop' ? str(b.open_when, 30) : null,

    memo: str(b.memo, 1000),

    name, phone,
    birth: str(b.birth, 8),
    verify_method: b.verify_method === 'pass' ? 'pass' : b.verify_method === 'sms' ? 'sms' : null,
    verified_at: b.verified_at ? new Date().toISOString() : null,

    contact_pref: str(b.contact_pref, 30),
    contact_times: arr(b.contact_times, 10),

    agree_third_party: true,
    agree_multi_alert: true,
    agree_marketing: b.agree_marketing === true,

    slots: int(b.slots) || 5,
    slots_left: int(b.slots) || 5,
    source: str(b.source, 80),
    user_agent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    ip_hash: iph,
  };

  try {
    const r = await fetch(sb(TABLE), { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) {
      const t = await r.text();
      console.error('접수 저장 실패', r.status, t.slice(0, 300));
      return res.status(502).json({ error: '저장하지 못했습니다', detail: t.slice(0, 200) });
    }
  } catch (e) {
    console.error('접수 저장 오류', e);
    return res.status(502).json({ error: 'DB에 닿지 못했습니다' });
  }

  res.status(201).json({ ok: true });
}
