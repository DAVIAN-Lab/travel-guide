// 마크다운 원문 → 문서 모델. DOM을 쓰지 않는 순수 함수만 둔다.
// 원칙: 화면은 마크다운을 그대로 그린다. 여기서 뽑는 정보(꼬리표·장소·학회)는 꾸밈과 색인에만 쓴다.
import MarkdownIt from './vendor/markdown-it.esm.min.mjs';
import { esc } from './html.mjs';

export const REPO = 'https://github.com/DAVIAN-Lab/travel-guide';

// 꼬리표 "— 이름 (학회 YYYY.MM · 노선)". bullet 첫 문단의 맨 끝에만 있다 (AGENTS.md §4).
export const TAG_RE = /\s—\s(?<name>[^()—]+?)\s\((?:(?<conf>[^()·]*?)\s)?(?<year>\d{4})\.(?<month>\d{2})(?:\s·\s(?<route>[^()]+))?\)$/u;
// 꼬리표를 쓰려다 형식이 틀린 것 (하이픈, 2026.4, 전각 괄호, 끝의 마침표). 경고만 한다.
const TAG_LIKE_RE = /\s[—–-]{1,2}\s*[^()（）—–]{1,20}?\s*[(（][^()（）]*\d{4}[^()（）]*[)）]\s*\.?$/u;
const CONF_COMMENT_RE = /<!--\s*관련 학회:\s*([\s\S]*?)\s*-->/;
const EDITION_RE = /^(?<series>[\p{L}\p{N}][\p{L}\p{N}&/\- ]*?)\s(?<year>\d{4})(?:\s\((?<months>\d{1,2}(?:-\d{1,2})?)월(?:\s—\s(?<venue>[^()]+?))?\))?(?:\s—\s(?<after>.+))?$/u;
const PROVENANCE_RE = /^(?<name>.+?)\s\((?<year>\d{4})\.(?<month>\d{2})\)$/u;

// ---------- 경로 ↔ 페이지 id ----------

export function pathToId(path) {
  if (path === 'general.md') return 'general';
  if (path === 'countries/README.md') return 'countries';
  let m = path.match(/^countries\/([a-z0-9-]+)\/README\.md$/);
  if (m) return m[1];
  m = path.match(/^countries\/([a-z0-9-]+)\/([a-z0-9-]+)\.md$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function idToPath(id) {
  if (id === 'general') return 'general.md';
  if (id === 'countries') return 'countries/README.md';
  if (/^[a-z0-9-]+$/.test(id)) return `countries/${id}/README.md`;
  if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) return `countries/${id}.md`;
  return null;
}

export function kindOf(id) {
  if (id === 'general') return 'general';
  if (id === 'countries') return 'index';
  return id && id.includes('/') ? 'city' : 'country';
}

// 사이트 안 링크. 같은 문서의 #앵커도 ?p=를 붙여 둔다 (도시 페이지에 끼워 넣은 국가 표 때문).
export function pageHref(id, hash = '') {
  return (id === 'countries' ? './' : `?p=${id}`) + hash;
}

export function rewriteHref(href, fromPath) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return { href, external: true };
  const u = new URL(href, `https://repo.invalid/${fromPath}`);
  if (u.host !== 'repo.invalid') return { href, external: true };
  const path = decodeURIComponent(u.pathname.slice(1));
  const id = pathToId(path);
  if (id) return { href: pageHref(id, u.hash), id };
  const kind = path === '' || path.endsWith('/') ? 'tree' : 'blob';
  return { href: `${REPO}/${kind}/main/${path}${u.hash}`, external: true };
}

// ---------- 원문 전처리 ----------

export function normalizeSource(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').normalize('NFC');
}

// 주석을 같은 개수의 줄바꿈으로 바꿔 줄 번호(token.map)가 GitHub 원문과 맞게 한다.
export function blankComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
}

// GitHub(github-slugger) 호환 제목 id. 소문자 → 글자·숫자·_·공백·하이픈 외 삭제 → 공백을 하이픈으로.
export function slugify(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

export function slugger() {
  const seen = new Map();
  return (text) => {
    const base = slugify(text);
    let slug = base;
    while (seen.has(slug)) {
      const n = seen.get(base) + 1;
      seen.set(base, n);
      slug = `${base}-${n}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}

// 괄호 깊이 0에서만 needle을 찾는다.
function depth0Split(text, needle, limit = Infinity) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && out.length < limit && text.startsWith(needle, i)) {
      out.push(text.slice(start, i));
      start = i + needle.length;
      i = start - 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

// "<!-- 관련 학회: ICLR 2026 (4월) — Riocentro. -->" 같은 주석 본문을 회차 목록으로.
export function parseConferences(body) {
  const res = { editions: [], note: '', bad: [] };
  const text = body.trim();
  if (/^TODO\b/.test(text)) return res;  // 템플릿 그대로
  const [listPart, rest = ''] = depth0Split(text, '. ', 1);
  const list = listPart.replace(/\.$/, '').trim();
  const tail = rest.replace(/\.$/, '').trim();
  const shared = tail.match(/^둘 다\s+(.+)$/u);
  for (const frag of depth0Split(list, ', ').map((s) => s.trim()).filter(Boolean)) {
    const m = frag.match(EDITION_RE);
    if (!m) { res.bad.push(frag); continue; }
    const g = m.groups;
    res.editions.push({
      series: g.series, year: +g.year, months: g.months || '', month: g.months ? +g.months.split('-')[0] : 0,
      venue: (g.venue || g.after || (shared ? shared[1] : '') || '').replace(/\.$/, '').trim(),
      label: `${g.series} ${g.year}`,
    });
  }
  if (res.editions.length === 0) {
    res.note = text;
    if (!/\d{4}/.test(text)) res.bad = [];  // 연도가 없는 산문 메모(대전)는 경고하지 않는다
  }
  else if (tail && !shared) res.note = tail;
  return res;
}

// ---------- markdown-it ----------

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
md.core.ruler.push('travel_guide', decorate);
const plain = new MarkdownIt({ html: false });

function inlineText(inline) {
  if (!inline) return '';
  if (!inline.children) return inline.content || '';
  return inline.children.map((c) => (
    c.type === 'text' || c.type === 'code_inline' ? c.content
      : c.type === 'softbreak' || c.type === 'hardbreak' ? ' ' : '')).join('');
}

function htmlToken(state, content) {
  const t = new state.Token('html_inline', '', 0);
  t.content = content;
  return t;
}

function textToken(state, content) {
  const t = new state.Token('text', '', 0);
  t.content = content;
  return t;
}

export function placeKind(href) {
  if (/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(href)) return 'share';
  if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps/.test(href)) return 'search';
  return 'site';
}

// 이름은 마지막 괄호 묶음으로 나눈다: "에어프레미아 (Air Premia, YP)" → ko / en.
export function splitName(name) {
  const m = name.match(/^(.*\S)\s*\(([^()]*)\)$/u);
  return m ? { ko: m[1], en: m[2] } : { ko: name, en: '' };
}

// 내용이 링크 하나뿐인 제목이면 장소.
function placeOf(inline) {
  const ch = (inline.children || []).filter((c) => !(c.type === 'text' && c.content.trim() === ''));
  if (ch.length < 3 || ch[0].type !== 'link_open' || ch[ch.length - 1].type !== 'link_close') return null;
  if (ch.slice(1, -1).some((c) => c.type === 'link_open')) return null;
  return { href: ch[0].meta?.raw ?? ch[0].attrGet('href'), name: inlineText(inline).trim() };
}

function splitTag(state, inline) {
  const ch = inline.children;
  const last = ch[ch.length - 1];
  if (!last || last.type !== 'text') return null;
  const m = last.content.match(TAG_RE);
  if (!m) return null;
  const lead = m[0].match(/^\s—\s/)[0];
  ch.splice(ch.length - 1, 1,
    textToken(state, last.content.slice(0, m.index) + lead),
    htmlToken(state, '<span class="tag">'),
    textToken(state, m[0].slice(lead.length)),
    htmlToken(state, '</span>'));
  const g = m.groups;
  return {
    name: g.name.trim(), conf: (g.conf || '').trim(), year: +g.year, month: +g.month,
    ym: `${g.year}.${g.month}`, route: (g.route || '').trim(),
  };
}

function rewriteLinks(inline, env) {
  for (const c of inline.children || []) {
    if (c.type !== 'link_open') continue;
    const raw = c.attrGet('href') || '';
    c.meta = { ...(c.meta || {}), raw };
    const r = rewriteHref(raw, env.doc.path);
    c.attrSet('href', r.href);
    if (r.external) { c.attrSet('target', '_blank'); c.attrSet('rel', 'noopener'); }
  }
}

// core 규칙: 제목 id, 섹션·장소·꼬리표·표 수집, 꾸밈 class.
function decorate(state) {
  const { tokens, env } = state;
  const doc = env.doc;
  // 첫 H2 전의 "빈 템플릿." 문단은 버린다 (빈 도시 배너가 대신한다).
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h2') break;
    if (tokens[i].type === 'paragraph_open' && tokens[i + 1].content.startsWith('빈 템플릿.')) {
      tokens.splice(i, 3);
      i--;
    }
  }
  let sec = null, place = null, sub = '';
  let listDepth = 0, quoteDepth = 0, table = null, row = null, inHead = false;
  const line = (t) => (t.map ? t.map[0] + 1 : 0);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const inline = tokens[i + 1];
        const text = inlineText(inline).trim();
        const id = env.slug(text);
        t.attrSet('id', id);
        const level = +t.tag.slice(1);
        if (level === 1) {
          if (!doc.title) doc.title = text;
        } else if (level === 2) {
          const m = text.match(/^(\d+)\.\s*(.*)$/u);
          sec = {
            num: m ? +m[1] : null, title: m ? m[2] : text, heading: text, slug: id,
            archive: /변경 이력|Archive/.test(text), filled: false, tags: 0, line: line(t),
          };
          doc.sections.push(sec);
          place = null; sub = '';
        } else {
          sub = text;
          const p = placeOf(inline);
          place = null;
          if (p) {
            const n = splitName(p.name);
            const kind = placeKind(p.href);
            place = {
              name: p.name, ko: n.ko, en: n.en, href: p.href, kind, level, slug: id,
              section: sec?.num ?? null, sectionTitle: sec?.title ?? '', archive: !!sec?.archive,
              airport: sec?.num === 2 && /^[A-Z]{3}$/.test(n.en) ? n.en : '', line: line(t),
            };
            doc.places.push(place);
            t.attrJoin('class', 'place');
            if (kind !== 'site') {
              inline.children.push(htmlToken(state,
                ` <a class="gmap" href="${esc(p.href)}" target="_blank" rel="noopener">${kind === 'share' ? '구글맵' : '구글맵 검색'}</a>`));
            }
          }
        }
        break;
      }
      case 'inline':
        rewriteLinks(t, env);
        break;
      case 'bullet_list_open': case 'ordered_list_open': listDepth++; break;
      case 'bullet_list_close': case 'ordered_list_close': listDepth--; break;
      case 'blockquote_open': quoteDepth++; break;
      case 'blockquote_close': quoteDepth--; break;
      case 'fence': case 'code_block':
        if (sec) sec.filled = true;
        break;
      case 'paragraph_open':
        if (sec && listDepth === 0 && tokens[i + 1].content.trim()) sec.filled = true;
        break;
      case 'list_item_open': {
        const p = tokens[i + 1], inline = tokens[i + 2];
        const item = {
          section: sec?.num ?? null, sectionTitle: sec?.title ?? '', archive: !!sec?.archive,
          place: place?.name ?? '', sub, line: line(t), depth: listDepth, top: listDepth === 1 && quoteDepth === 0,
          kind: 'other', text: '', head: '', hearsay: false, tag: null, link: null,
        };
        if (p?.type === 'paragraph_open' && inline?.type === 'inline') {
          item.text = inlineText(inline).trim();
          const ch = inline.children || [];
          const first = ch.findIndex((c) => !(c.type === 'text' && c.content === ''));
          if (ch[first]?.type === 'strong_open') item.head = inlineText({ children: ch.slice(first + 1, ch.findIndex((c) => c.type === 'strong_close')) }).trim();
          const a = ch.find((c) => c.type === 'link_open');
          if (a) {
            const close = ch.indexOf(ch.find((c, k) => k > ch.indexOf(a) && c.type === 'link_close'));
            item.link = { href: a.attrGet('href'), text: inlineText({ children: ch.slice(ch.indexOf(a) + 1, close) }).trim() };
          }
          if (/^TODO\b/.test(item.text)) { item.kind = 'todo'; t.attrJoin('class', 'todo'); }
          else if (/^아직 비어 있음\.?$/.test(item.text)) { item.kind = 'placeholder'; t.attrJoin('class', 'placeholder'); }
          else {
            item.tag = splitTag(state, inline);
            if (item.tag) item.kind = 'tag';
            else if (TAG_LIKE_RE.test(item.text)) doc.warnings.push({ line: item.line, msg: `꼬리표 형식이 맞지 않습니다: "${item.text.slice(-40)}"` });
            if (item.text.includes('(전언)')) { item.hearsay = true; t.attrJoin('class', 'hearsay'); }
          }
        }
        if (item.kind !== 'todo' && item.kind !== 'placeholder' && sec) sec.filled = true;
        if (item.tag) { doc.tags.push(item); if (sec) sec.tags++; }
        doc.items.push(item);
        break;
      }
      case 'table_open':
        table = { section: sec?.num ?? null, archive: !!sec?.archive, sub, head: [], rows: [], line: line(t) };
        break;
      case 'thead_open': inHead = true; break;
      case 'thead_close': inHead = false; break;
      case 'tr_open': row = []; break;
      case 'th_open': case 'td_open':
        row.push({ open: t, inline: tokens[i + 1], text: inlineText(tokens[i + 1]).trim() });
        break;
      case 'tr_close':
        if (inHead) table.head = row.map((c) => c.text);
        else table.rows.push(row);
        break;
      case 'table_close':
        finishTable(state, doc, sec, table);
        table = null;
        break;
      default:
    }
  }
}

function finishTable(state, doc, sec, table) {
  for (const r of table.rows) for (const c of r) if (/^TODO\b/.test(c.text)) c.open.attrJoin('class', 'todo');
  if (table.rows.length && sec) sec.filled = true;
  const isChecklist = sec?.num === 0 && !table.archive && table.head[2] === '최근 확인';
  if (isChecklist) {
    for (const r of table.rows) {
      const [label, status, seen] = r.map((c) => c.text);
      const row = { label, status, seen, by: '', at: '', line: 0 };
      const m = seen?.match(PROVENANCE_RE);
      if (m) {
        row.by = m.groups.name; row.at = `${m.groups.year}.${m.groups.month}`;
        r[2].inline.children = [htmlToken(state, `<span class="prov ok">확인: ${esc(row.by)} ${row.at}</span>`)];
      } else if (seen === '—' && status && !/^TODO\b/.test(status)) {
        r[2].inline.children = [htmlToken(state, '<span class="prov">사전 조사</span>')];
      }
      doc.checklist.push(row);
    }
  }
  doc.tables.push({ section: table.section, archive: table.archive, sub: table.sub, head: table.head, rows: table.rows.map((r) => r.map((c) => c.text)), line: table.line, checklist: isChecklist });
}

// ---------- 문서 하나 ----------

function emptyDoc(path) {
  const id = pathToId(path);
  return {
    path, id, kind: kindOf(id), title: '', ko: '', en: '', variant: '', intro: '',
    editions: [], confNote: '', confBad: [], sections: [], preHtml: '', items: [], tags: [], places: [],
    tables: [], checklist: [], countries: [], cities: [], warnings: [], error: null, lines: 0,
  };
}

// 절대 throw하지 않는다. 실패하면 꾸밈 없이 다시 그리고 doc.error를 채운다.
export function parseDoc(path, source) {
  const doc = emptyDoc(path);
  let text = '';
  try {
    text = normalizeSource(source);
    doc.lines = text.split('\n').length;
    if (!text.trim()) doc.warnings.push({ line: 0, msg: '문서가 비어 있습니다.' });
    const cm = text.match(CONF_COMMENT_RE);
    if (cm) {
      const c = parseConferences(cm[1]);
      doc.editions = c.editions; doc.confNote = c.note; doc.confBad = c.bad;
      for (const b of c.bad) doc.warnings.push({ line: lineOf(text, cm.index), msg: `관련 학회 주석을 읽지 못한 부분: "${b}"` });
    }
    const blanked = blankComments(text);
    const open = blanked.indexOf('<!--');
    if (open >= 0) doc.warnings.push({ line: lineOf(blanked, open), msg: '닫히지 않은 주석(<!--)이 있습니다.' });

    const env = { doc, slug: slugger() };
    const tokens = md.parse(blanked, env);
    renderParts(tokens, doc, env);
    finishDoc(doc);
  } catch (e) {
    const fresh = emptyDoc(path);
    Object.assign(doc, fresh, { lines: doc.lines, error: String(e?.message || e) });
    try { doc.preHtml = plain.render(blankComments(text || String(source))); }
    catch { doc.preHtml = `<pre>${esc(String(source))}</pre>`; }
  }
  return doc;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function renderParts(tokens, doc, env) {
  const starts = [];
  tokens.forEach((t, i) => { if (t.type === 'heading_open' && t.tag === 'h2') starts.push(i); });
  const preEnd = starts.length ? starts[0] : tokens.length;
  const h1 = tokens.findIndex((t, i) => i < preEnd && t.type === 'heading_open' && t.tag === 'h1');
  const pre = h1 >= 0 ? [...tokens.slice(0, h1), ...tokens.slice(h1 + 3, preEnd)] : tokens.slice(0, preEnd);
  doc.preHtml = md.renderer.render(pre, md.options, env);
  doc.intro = pre.filter((t) => t.type === 'inline').map((t) => inlineText(t)).join(' ');
  starts.forEach((s, k) => {
    doc.sections[k].headHtml = md.renderer.render(tokens.slice(s, s + 3), md.options, env);
    doc.sections[k].bodyHtml = md.renderer.render(tokens.slice(s + 3, starts[k + 1] ?? tokens.length), md.options, env);
  });
}

function finishDoc(doc) {
  const n = splitName(doc.title);
  doc.ko = n.ko; doc.en = n.en;
  if (/출국 가이드 변종/.test(doc.intro)) doc.variant = 'departure';
  else if (/부분 슬림 변종/.test(doc.intro)) doc.variant = 'partial';
  else if (/슬림 변종/.test(doc.intro)) doc.variant = 'slim';
  const listIn = (pred, kind) => doc.items
    .filter((it) => pred(it) && it.link)
    .map((it) => ({ it, id: rewriteHref(it.link.href, doc.path).id }))
    .filter((x) => x.id && kindOf(x.id) === kind);
  if (doc.kind === 'index') {
    doc.countries = listIn((it) => it.sectionTitle.startsWith('국가 목록') && it.top, 'country').map(({ it, id }) => ({
      id, name: it.link.text, ...splitName(it.link.text), line: it.line,
    }));
  }
  if (doc.kind === 'country') {
    doc.cities = listIn((it) => it.section === 6 && it.top, 'city').map(({ it, id }) => ({
      id, name: it.link.text, ...splitName(it.link.text),
      desc: it.text.slice(it.text.indexOf(it.link.text) + it.link.text.length).replace(/^\s*—\s*/u, '').trim(), line: it.line,
    }));
  }
}

// ---------- 여러 문서에 걸친 집계 ----------

export function editionKey(series, year) {
  return `${series} ${year}`;
}

// 꼬리표의 학회명(conf)은 시리즈 이름이다: "ICLR 2026.04" → ICLR 2026.
export function tagEdition(tag) {
  return tag.conf ? editionKey(tag.conf, tag.year) : '';
}

export function latest(tags) {
  return tags.reduce((a, t) => (t.tag.ym > a ? t.tag.ym : a), '');
}

// 국가 목록 → 국가 README → 도시 문서로 읽은 결과를 한 사이트 모델로 묶는다.
export function buildSite(index, general, countryDocs, cityDocs) {
  const byId = new Map();
  for (const d of [index, general, ...countryDocs, ...cityDocs]) if (d?.id) byId.set(d.id, d);
  const countries = index.countries.map((entry) => {
    const doc = byId.get(entry.id) || null;
    const cities = (doc?.cities || []).map((c) => ({ entry: c, doc: byId.get(c.id) || null }));
    return { entry, doc, cities };
  });
  for (const c of countries) {
    if (c.doc) c.doc.home = c;
    for (const ct of c.cities) if (ct.doc) { ct.doc.home = c; ct.doc.entry = ct.entry; }
  }
  if (general) general.entry = { name: '공통 팁', ko: '공통 팁', en: '' };
  const docs = [general, ...countryDocs, ...cityDocs].filter(Boolean);
  const tags = docs.flatMap((d) => d.tags.map((t) => ({ ...t, doc: d })));
  const editions = cityDocs.flatMap((d) => d.editions.map((e) => ({ ...e, doc: d })));
  const years = editions.map((e) => e.year);
  return {
    index, general, countries, byId, docs, tags, editions,
    stats: {
      countries: countries.length,
      cities: countries.reduce((n, c) => n + c.cities.length, 0),
      tags: tags.length,
      editions: editions.length,
      series: new Set(editions.map((e) => e.series)).size,
      from: years.length ? Math.min(...years) : 0,
      to: years.length ? Math.max(...years) : 0,
    },
  };
}

// 국가 README ## 6. 도시 목록 줄에 적힌 학회가 도시 주석과 어긋나면 도시 문서에 경고를 단다.
export function crossCheck(site) {
  for (const c of site.countries) {
    for (const ct of c.cities) {
      if (!ct.doc || ct.doc.missing) continue;
      if (!/\d{4}/.test(ct.entry.desc)) continue;
      for (const e of ct.doc.editions) {
        if (!ct.entry.desc.includes(e.series) || !ct.entry.desc.includes(String(e.year))) {
          ct.doc.warnings.push({ line: 0, msg: `${e.label}이(가) ${c.entry.ko} README 도시 목록 줄에 없습니다.` });
        }
      }
    }
  }
  return site;
}

// read(path) → Promise<{ text, ... } | null>. 국가 목록 → 국가 README → 도시 문서 순서로 읽는다.
export async function loadSite(read) {
  const load = async (path) => {
    const r = await read(path);
    if (r && typeof r.text === 'string') return parseDoc(path, r.text);
    const d = parseDoc(path, '');
    d.missing = true;
    d.warnings = [];
    d.error = `${path}을(를) 불러오지 못했습니다${r?.status ? ` (HTTP ${r.status})` : ''}.`;
    return d;
  };
  const [index, general] = await Promise.all([load('countries/README.md'), load('general.md')]);
  if (index.missing || index.countries.length === 0) throw new Error(index.error || '국가 목록이 비어 있습니다.');
  const countries = await Promise.all(index.countries.map((c) => load(idToPath(c.id))));
  const cities = await Promise.all(countries.flatMap((d) => d.cities.map((c) => load(idToPath(c.id)))));
  return crossCheck(buildSite(index, general, countries, cities));
}
