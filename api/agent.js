/* 중개사·소유자·시행사 가입 신청 접수 — 브라우저 대신 여기서 저장한다.
 *
 * bk_demand 와 같은 원칙이다: 키는 서버에만 있고, 표에는 RLS 정책이 없어
 * 브라우저가 직접 넣지 못한다. 방어 순서도 같다 - 검증을 먼저, 속도 제한은 그 뒤.
 * 오타 세 번에 60초 잠기면 그건 방어가 아니라 방해다.
 *
 * 필요한 환경변수
 *   BK_URL         https://xxxx.supabase.co
 *   BK_SECRET_KEY  secret / service_role 키
 */

import crypto from 'node:crypto';
import { notify, mask } from './_notify.js';
import { checkShape } from './agent-verify.js';
import { userFrom } from './_auth.js';
import { readIdv } from './_idv.js';

const TABLE = 'bk_agent';

/* 같은 인스턴스가 살아 있는 동안의 연타 방지 */
const burst = new Map();
const BURST_WINDOW = 60_000, BURST_MAX = 3;

const ipHash = (ip, salt) =>
  crypto.createHash('sha256').update(String(ip) + '|' + salt).digest('hex').slice(0, 32);

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  if (typeof f === 'string' && f) return f.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const str = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/* developer 는 화면에서 뺐지만 여기서는 계속 받는다.
   기존 신청이 남아 있고, 옛 화면을 열어둔 창에서 넘어올 수 있다. */
const ROLES = ['agent', 'owner', 'developer'];
const ROLE_KO = { agent: '공인중개사', owner: '소유자', developer: '시행사' };

/* 소유자는 개인만이 아니다.
   법인이 가진 건물, 신탁등기가 되어 등기부상 소유자가 신탁사인 건물 -
   신탁 건은 형식상 소유자(신탁사)가 아니라 위탁자(시행사)가 물건을 움직인다.
   형식상 소유자만 받으면 정작 올려야 할 사람이 못 올린다. */
const OWNER_TYPES = ['individual', 'corp', 'trustor'];
const OWNER_KO = { individual: '개인', corp: '법인', trustor: '신탁 위탁자' };

/* 숫자만 남긴다. 사람은 하이픈을 넣기도 빼기도 한다. */
const digits = x => String(x ?? '').replace(/[^0-9]/g, '');

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
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  /* 사람은 비워두는 칸. 채워져 있으면 사람이 아니다. */
  if (str(b.website)) return res.status(200).json({ ok: true });
  /* 사람은 이 화면들을 3초 안에 통과하지 못한다 */
  if (Number(b.elapsed) < 3000) return res.status(429).json({ error: '너무 빠릅니다. 잠시 후 다시 시도해 주세요' });

  const role  = ROLES.includes(b.role) ? b.role : null;
  const ownerType = role === 'owner'
    ? (OWNER_TYPES.includes(b.owner_type) ? b.owner_type : 'individual') : null;
  /* 실계약 채널이 붙어 있으면 손으로 적은 이름·연락처를 쓰지 않는다.
     화면에서 무엇을 적었든 서명된 표에 적힌 값만 저장한다 - demand.js 와 같다.
     테스트 MID 일 때는 예전처럼 받는다. 테스트 값으로 공급자를 만들면 안 된다. */
  const idvLive = process.env.PORTONE_LIVE === '1';
  const idv = idvLive ? readIdv(b.idv_token) : null;
  if (idvLive && !idv) {
    return res.status(401).json({ error: '본인확인을 먼저 받아주세요', need_idv: true });
  }
  const name  = idv ? str(idv.name, 40) : str(b.name, 40);
  const phone = idv ? idv.phone : String(b.phone ?? '').replace(/-/g, '');

  const bad =
    !role                                        ? '역할이 없습니다' :
    !name || name.length < 2                     ? '성함을 확인해 주세요' :
    !/^01[016789][0-9]{7,8}$/.test(phone)        ? '연락처 형식이 맞지 않습니다' :
    role === 'agent' && !str(b.reg_no)           ? '개설등록번호가 없습니다' :
    /* 화면을 우회해 들어와도 형식은 여기서 다시 본다 */
    role === 'agent' && !checkShape(b.reg_no).ok ? checkShape(b.reg_no).reason :
    /* 법인·위탁자라면 어느 법인인지는 있어야 한다. 사람이 확인할 실마리가
       하나도 없으면 승인할 수가 없다 - 그러면 받아둔 의미가 없다. */
    role === 'owner' && ownerType === 'corp' && !str(b.corp_name)
      ? '법인명을 적어주세요' :
    role === 'owner' && ownerType === 'corp' && digits(b.corp_no).length !== 13 && digits(b.biz_no).length !== 10
      ? '법인등록번호(13자리) 또는 사업자등록번호(10자리) 중 하나를 적어주세요' :
    role === 'owner' && ownerType === 'trustor' && !str(b.corp_name)
      ? '위탁자(시행사) 이름을 적어주세요' :
    role === 'owner' && ownerType === 'trustor' && !str(b.trust_co)
      ? '어느 신탁사에 맡기셨는지 적어주세요' :
    null;
  if (bad) return res.status(400).json({ error: bad });

  /* 검증을 통과한 요청만 센다 */
  const ip = clientIp(req);
  const now = Date.now();
  const hits = (burst.get(ip) || []).filter(t => now - t < BURST_WINDOW);
  if (hits.length >= BURST_MAX) {
    return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
  }
  hits.push(now); burst.set(ip, hits);

  /* 계정과 이어둬야 나중에 '내가 승인된 파트너인가' 를 물을 수 있다 */
  const owner = await userFrom(req);

  const row = {
    role, name, phone,
    user_id: owner ? owner.id : null,
    email:    str(b.email, 120),
    office:   str(b.office, 80),
    reg_no:   str(b.reg_no, 40),
    reg_verified: b.reg_verified === true,
    addr:     str(b.addr, 200),
    relation: str(b.relation, 40),
    biz_no:   str(b.biz_no, 20),
    dev_type: str(b.dev_type, 40),
    owner_type: ownerType,
    corp_name:  str(b.corp_name, 80),
    corp_no:    digits(b.corp_no).slice(0, 13) || null,
    trust_co:   str(b.trust_co, 80),
    done:     str(b.done, 20),
    memo:     str(b.memo, 500),
    ip_hash:  ipHash(ip, BK_SECRET_KEY),
    ua:       str(req.headers['user-agent'], 200),
  };

  const post = body => fetch(`${BK_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: BK_SECRET_KEY,
      Authorization: 'Bearer ' + BK_SECRET_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  try {
    let r = await post(row);

    /* 표를 아직 안 만들었거나 컬럼이 없으면 알아볼 수 있게 답한다 */
    if (!r.ok) {
      const t = await r.text();
      if (/relation .* does not exist|PGRST205/i.test(t)) {
        return res.status(503).json({ error: '신청 표가 아직 준비되지 않았습니다 (bk_agent)' });
      }
      /* 이미 신청한 경우는 실패가 아니다.
         다만 어느 쪽에 걸렸는지는 알려야 한다 - 계정당 한 번(bk_agent_user_idx)인데
         "같은 번호로 접수됐다"고만 하면 번호를 바꿔가며 다시 시도하게 된다. */
      if (/duplicate key|23505/i.test(t)) {
        const why = /bk_agent_user_idx/.test(t) ? 'account' : 'phone';
        return res.status(200).json({ ok: true, already: true, why });
      }
      /* 컬럼이 없더라도 신청 자체는 살린다.
         0016 은 칸을 넷 늘렸다 - 하나만 빼고 다시 넣으면 다음 칸에서 또 걸린다.
         걸릴 때마다 그 칸을 빼고, 뺀 값은 메모에 적어 사람이 보게 남긴다. */
      let body = row, note = [], miss = t, dropped = 0;
      while (dropped < 8) {
        const m = miss.match(/'([a-z_]+)' column/i);
        if (!m || body[m[1]] === undefined) break;
        const k = m[1];
        if (body[k]) note.push(`${k}=${body[k]}`);
        const { [k]: _drop, ...rest } = body;
        body = rest; dropped++;
        if (note.length) {
          body = { ...body, memo: [row.memo, '[표에 없는 칸] ' + note.join(' · ')]
            .filter(Boolean).join(' / ').slice(0, 500) };
        }
        r = await post(body);
        if (r.ok) return res.status(200).json({ ok: true });
        miss = await r.text();
      }
      return res.status(500).json({ error: '저장에 실패했습니다' });
    }
    const sent = await notify(req, {
      subject: `새 가입 신청 · ${ROLE_KO[row.role] || row.role}`,
      rows: [
        ['역할', ROLE_KO[row.role] || row.role],
        ['성함', row.name || '-'],
        ['연락처', mask(row.phone)],
        ['사무소 · 물건', row.office || row.addr || '-'],
        ['등록번호 · 사업자', (row.reg_no || row.biz_no || '-') + (row.reg_no ? (row.reg_verified ? ' (공공데이터 확인됨)' : ' (형식만 확인)') : '')],
        ...(row.owner_type ? [['소유 형태', OWNER_KO[row.owner_type] || row.owner_type]] : []),
        ...(row.corp_name ? [['법인 · 위탁자', row.corp_name + (row.corp_no ? ` (${row.corp_no})` : '')]] : []),
        ...(row.trust_co ? [['신탁사', row.trust_co + ' - 등기부 또는 신탁원부로 위탁자 확인 필요']] : []),
        ['이메일', row.email || '-'],
      ],
      link: '/#/ops/live',
    });
    return res.status(200).json({ ok: true, notified: sent && sent.ok ? 'ok' : (sent && sent.skipped) || 'unknown' });
  } catch (e) {
    return res.status(500).json({ error: '저장 중 문제가 생겼습니다' });
  }
}
