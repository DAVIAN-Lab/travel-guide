// 검색: 부분 일치 + 악센트 무시 + 한글 자모 분해 (입력 중인 "교통ㅋ", "칻"도 맞는다).
// NFKC는 쓰지 않는다 (호환 자모가 바뀌어 입력 중 글자가 깨진다).
import { pageHref } from './parse.mjs';

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// 혼자 입력된 겹자모 (호환 자모)
const SPLIT = {
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
};

export function jamo(s) {
  let out = '';
  for (const ch of s) {
    const k = ch.codePointAt(0) - 0xAC00;
    if (k >= 0 && k < 11172) out += CHO[Math.floor(k / 588)] + JUNG[Math.floor((k % 588) / 28)] + JONG[k % 28];
    else out += SPLIT[ch] || ch;
  }
  return out;
}

// 소문자 → 악센트 제거 (NFD 후 결합 부호 삭제) → 공백 제거.
export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').replace(/\s+/g, '');
}

const key = (s) => jamo(norm(s));
const SEP = '\u0001';
const WEIGHT = { doc: 0, place: 1, section: 2, row: 3, item: 4 };

function shortName(d) {
  return d.kind === 'general' ? '공통 팁' : d.entry?.ko || d.ko || d.title;
}

export function buildIndex(site) {
  const recs = [];
  const aliases = (id) => { const a = site.geo?.cities?.[id]?.aliases; return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; };
  for (const d of site.docs) {
    if (d.missing) continue;
    const crumbs = d.kind === 'city' ? [d.home?.entry.ko, shortName(d)] : [shortName(d)];
    const hidden = [d.en, d.home?.entry.en, ...aliases(d.id)].filter(Boolean);
    const add = (kind, title, text, href, extra = {}) => {
      const names = [title, ...(kind === 'doc' ? hidden : [])].join(SEP);
      recs.push({
        kind, title, text, href, crumbs: crumbs.filter(Boolean), reviewed: d.tags.length > 0, ...extra,
        titleKey: key(names), hay: key([names, text, ...crumbs, ...hidden, extra.trail || ''].join(SEP)),
      });
    };
    add('doc', shortName(d), [d.kind === 'country' ? '국가 공통 정보' : '', ...d.editions.map((e) => e.label)].join(' '), pageHref(d.id),
      { sub: d.kind === 'city' ? d.home?.entry.ko : d.kind === 'country' ? '국가' : '' });
    for (const s of d.sections) if (!s.archive) add('section', s.heading, '', pageHref(d.id, `#${s.slug}`));
    for (const p of d.places) {
      if (p.archive) continue;  // Archive(옛 정보)는 섹션처럼 색인하지 않는다
      add('place', p.name, '', pageHref(d.id, `#${p.slug}`), { gmap: p.kind !== 'site' ? p.href : '', gmapLabel: p.kind === 'share' ? '구글맵' : '구글맵 검색', trail: p.sectionTitle });
    }
    const quick = d.sections.find((s) => s.num === 0 && !s.archive);
    for (const r of d.checklist) add('row', r.label, r.status, pageHref(d.id, quick ? `#${quick.slug}` : ''), { trail: quick?.title || '' });
    for (const it of d.items) {
      if (it.archive || it.kind === 'todo' || it.kind === 'placeholder' || !it.text) continue;
      if (d.kind === 'country' && it.section === 6) continue;  // 도시 목록 줄은 도시 결과와 겹친다
      add('item', it.head || '', it.text, pageHref(d.id, it.anchor ? `#${it.anchor}` : ''),
        { where: [it.sectionTitle, it.place].filter(Boolean).join(' › '), trail: [it.sectionTitle, it.place].join(SEP) });
    }
  }
  return recs;
}

let cache = null;

export function search(site, q, limit = 80) {
  if (!cache || cache.site !== site) cache = { site, recs: buildIndex(site) };
  const terms = String(q).trim().split(/\s+/).map(key).filter(Boolean);
  if (!terms.length) return { total: 0, results: [] };
  const hits = [];
  cache.recs.forEach((r, i) => {
    if (!terms.every((t) => r.hay.includes(t))) return;
    const inTitle = terms.every((t) => r.titleKey.includes(t));
    hits.push({ r, score: WEIGHT[r.kind] * 4 + (inTitle ? 0 : 2) + (r.reviewed ? 0 : 1), i });
  });
  hits.sort((a, b) => a.score - b.score || a.i - b.i);
  return { total: hits.length, results: hits.slice(0, limit).map((h) => h.r) };
}
