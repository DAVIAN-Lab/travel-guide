// 화면. 모든 함수는 { html, title, mount } 를 돌려준다. 문자열 조립은 html``(자동 이스케이프)로만.
import { html, raw, str } from './html.mjs';
import { REPO, pageHref, latest, tagEdition, slugify } from './parse.mjs';
import { search } from './search.mjs';

const SITE = 'DAVIAN 출장 가이드';
const editUrl = (doc) => `${REPO}/edit/main/${doc.path}`;
const blobUrl = (doc, line) => `${REPO}/blob/main/${doc.path}${line ? `#L${line}` : ''}`;

export function fatal(e) {
  return { html: str(html`<div class="fatal"><h1>${SITE}</h1>
    <p>사이트를 불러오지 못했습니다: ${e?.message || e}</p>
    <p><a href="${REPO}">GitHub에서 원문 보기</a></p></div>`) };
}

// ---------- 공통 틀 ----------

function shortName(doc) {
  return doc?.entry?.ko || doc?.ko || doc?.title || doc?.id || '';
}

const ICON = {
  menu: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2.6" fill="none"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

function countBadge(n) {
  return n ? html`<span class="n" title="후기 ${n}개">●${n}</span>` : '';
}

function tree(site, current) {
  const row = (id, name, n) => html`<a href="${pageHref(id)}" class="${n ? 'has' : ''}"${raw(id === current ? ' aria-current="page"' : '')}>${name}${countBadge(n)}</a>`;
  return html`<nav class="tree" aria-label="국가·도시"><ul>${site.countries.map((c) => html`
    <li>${row(c.entry.id, c.entry.ko, c.doc?.tags.length)}<ul>${c.cities.map((ct) => html`
      <li>${row(ct.entry.id, ct.entry.ko, ct.doc?.tags.length)}</li>`)}</ul></li>`)}</ul></nav>`;
}

function shell(site, r, ctx, main, { current = '', tab = '', wide = false } = {}) {
  const nav = (href, label, key) => html`<a href="${href}"${raw(tab === key ? ' aria-current="page"' : '')}>${label}</a>`;
  return str(html`
<header class="top">
  <button type="button" class="menu" aria-label="국가·도시 목록" aria-controls="drawer" aria-expanded="false">${raw(ICON.menu)}</button>
  <a class="brand" href="./">${SITE}</a>
  <nav class="tabs">${nav('./', '지도', 'home')}${nav('?p=general', '공통 팁', 'general')}${nav('?p=conferences', '학회', 'conferences')}</nav>
  <form class="search" role="search" action="./">
    <input type="search" name="q" value="${r.q}" placeholder="도시, 장소, 팁 검색" aria-label="검색" autocomplete="off" enterkeyhint="search">
    <button type="submit" class="orb" aria-label="검색">${raw(ICON.search)}</button>
  </form>
</header>
<div class="layout">
  <aside id="drawer" class="drawer"><nav class="drawer-tabs" aria-label="메뉴">${nav('./', '지도', 'home')}${nav('?p=general', '공통 팁', 'general')}${nav('?p=conferences', '학회', 'conferences')}</nav>${tree(site, current)}</aside>
  <main id="main" class="${wide ? 'wide' : ''}">${main}</main>
</div>
<footer class="foot">
  <a href="${REPO}">GitHub 원문</a>
  ${ctx.deployed ? html`<span>사이트 반영: ${fmtDate(ctx.deployed)}</span>` : ''}
  <button type="button" class="reload">최신 내용 불러오기</button>
  <span class="muted">수정 후 반영까지 최대 10분</span>
  <a href="site/check.html">점검</a>
</footer>`);
}

function fmtDate(httpDate) {
  const d = new Date(httpDate);
  if (Number.isNaN(d.getTime())) return httpDate;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function mountShell(root, ctx) {
  const btn = root.querySelector('.menu');
  btn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('drawer-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.body.classList.remove('drawer-open');
  root.querySelector('.reload')?.addEventListener('click', () => ctx.reload());
  // 입력할 때마다 결과만 바꾼다 (입력창은 그대로라 포커스·한글 조합이 유지된다).
  const form = root.querySelector('form.search');
  const input = form?.querySelector('input');
  input?.addEventListener('input', () => ctx.onSearch(input.value, false));
  input?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    ctx.onSearch(input.value, true);
  });
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.submitter) ctx.onSearch(input.value, true);  // 돋보기 버튼. Enter는 위 keydown이 처리
  });
  for (const b of root.querySelectorAll('button[data-copy]')) {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.classList.add('done'); }
      catch { window.prompt('복사해서 쓰세요', b.dataset.copy); }
    });
  }
}

// ---------- 페이지 고르기 ----------

export function page(site, r, ctx) {
  let v;
  if (r.searching) v = { title: r.q ? `검색: ${r.q}` : '검색', main: raw(searchMain(site, r.q)), opts: {} };
  else if (!r.p) v = home(site);
  else if (r.p === 'conferences') v = r.e ? editionPage(site, r.e) : conferences(site);
  else if (site.byId.has(r.p) && r.p !== 'countries') v = docPage(site, site.byId.get(r.p));
  else v = { title: '없는 페이지', main: html`<p>"${r.p}" 페이지가 없습니다. <a href="./">홈으로</a></p>`, opts: {} };
  return {
    title: v.title,
    html: shell(site, r, ctx, v.main, v.opts),
    mount: (root) => { mountShell(root, ctx); v.mount?.(root); },
  };
}

// ---------- 홈 ----------

function home(site) {
  const s = site.stats;
  const rank = { city: 0, country: 1, general: 2 };
  const withTags = site.docs.filter((d) => d.tags.length)
    .sort((a, b) => b.tags.length - a.tags.length || rank[a.kind] - rank[b.kind]);
  const card = (d) => {
    const secs = d.sections.filter((x) => x.tags).map((x) => x.title);
    const where = d.kind === 'country' ? `${shortName(d)} 국가 공통` : d.variant === 'departure' ? `${shortName(d)} · 출국 가이드` : shortName(d);
    const air = d.variant === 'departure' ? d.places.find((p) => p.airport) : null;
    const eds = [...new Set(d.tags.map((t) => tagEdition(t.tag)).filter(Boolean))];
    return html`<li class="card"><a href="${pageHref(d.id)}">
      <b>${where}</b> <span class="n">●${d.tags.length}</span>
      <span class="sub">${air ? `${air.ko}(${air.airport}) 팁` : secs.join(' · ')}</span>
      ${eds.length ? html`<span class="sub muted">${eds.join(' · ')}</span>` : ''}</a></li>`;
  };
  const main = html`
  <section class="home">
    <p class="stats">${s.countries}개국 · ${s.cities}개 도시 · 후기 ${s.tags}개 · 학회 ${s.editions}회 (${s.from}–${s.to})</p>
    <nav class="home-quick chips" aria-label="바로 가기"><a href="?p=general">공통 팁</a><a href="?p=conferences">학회 목록</a><a href="#국가도시">국가·도시 전체</a></nav>
    <h2>후기가 있는 곳</h2>
    <ul class="cards">${withTags.map(card)}</ul>
    <div id="map-slot"></div>
    <h2 class="list-title" id="국가도시">국가·도시</h2>
    <ul class="home-list">${site.countries.map((c) => html`<li><a href="${pageHref(c.entry.id)}">${c.entry.ko}</a>:
      ${c.cities.map((ct, i) => html`${i ? ' · ' : ''}<a href="${pageHref(ct.entry.id)}" class="${ct.doc?.tags.length ? 'has' : ''}">${ct.entry.ko}</a>`)}</li>`)}</ul>
  </section>`;
  // 지도는 글이 그려진 다음에 불러온다 (폰에서 글 먼저).
  const mount = (root) => {
    const slot = root.querySelector('#map-slot');
    setTimeout(() => import('./map.mjs').then((m) => m.mountMap(slot, site)).catch((e) => {
      slot.innerHTML = str(html`<p class="muted">지도를 불러오지 못했습니다 (${e.message}).</p>`);
    }), 0);
  };
  return { title: '', main, mount, opts: { tab: 'home', wide: true } };
}

// ---------- 문서 (도시·국가·공통 팁) ----------

function crumbs(site, doc) {
  const parts = [html`<a href="./">홈</a>`];
  if (doc.kind === 'city' && doc.home) parts.push(html`<a href="${pageHref(doc.home.entry.id)}">${doc.home.entry.ko}</a>`);
  parts.push(html`<span>${shortName(doc)}</span>`);
  return html`<nav class="crumb" aria-label="경로">${parts.map((p, i) => html`${i ? ' › ' : ''}${p}`)}</nav>`;
}

function confLine(doc) {
  if (!doc.editions.length) return doc.confNote ? html`<p class="confs muted">${doc.confNote}</p>` : '';
  return html`<p class="confs">${doc.editions.map((e, i) => html`${i ? ' · ' : ''}<span>${e.label}${e.months ? ` (${e.months}월${e.venue ? ` · ${e.venue}` : ''})` : e.venue ? ` (${e.venue})` : ''}</span>`)}</p>`;
}

function metaLine(doc) {
  const n = doc.tags.length;
  return html`<p class="meta">${n ? `후기 ${n}개 · 최근 ${latest(doc.tags)}` : '후기 없음'} · <a href="${editUrl(doc)}" target="_blank" rel="noopener">GitHub에서 수정</a></p>`;
}

function warnLine(doc) {
  if (doc.missing) {
    return html`<p class="warn">${doc.error} 잠시 뒤 다시 열거나 <a href="${blobUrl(doc)}" target="_blank" rel="noopener">GitHub 원문</a>을 보세요.</p>`;
  }
  if (doc.error) {
    return html`<p class="warn">이 문서를 해석하지 못해 꾸밈 없이 보여 줍니다 (${doc.error}). <a href="${blobUrl(doc)}" target="_blank" rel="noopener">GitHub 원문</a></p>`;
  }
  if (!doc.warnings.length) return '';
  const w = doc.warnings[0];
  return html`<p class="warn">형식 경고 ${doc.warnings.length}건: <a href="${blobUrl(doc, w.line)}" target="_blank" rel="noopener">${w.line}번째 줄</a> ${w.msg}
    ${doc.warnings.length > 1 ? html` <a href="site/check.html">전체 보기</a>` : ''}</p>`;
}

function skeleton(doc) {
  if (doc.kind !== 'city' || doc.tags.length || doc.missing) return '';
  const eds = doc.editions;
  const tagText = (e) => ` — 이름 (${e.series} ${e.year}.${e.month ? String(e.month).padStart(2, '0') : 'MM'})`;
  return html`<aside class="banner">
    <p><b>아직 후기가 없습니다.</b> 아래는 사전 조사한 기본 정보입니다.
    ${eds.length ? `${eds.map((e) => e.label).join(' · ')}에 다녀오셨다면 한 줄 남겨 주세요.` : '다녀오셨다면 한 줄 남겨 주세요.'}</p>
    ${eds.length ? html`<p class="copies"><span class="muted">꼬리표 복사</span> ${eds.map((e) => html`<button type="button" data-copy="${tagText(e)}" title="${tagText(e).trim()} 복사">${e.label}</button>`)}</p>` : ''}
    <p class="actions">
      <a href="${editUrl(doc)}" target="_blank" rel="noopener">GitHub에서 수정</a> <span class="muted">반영까지 최대 10분</span></p>
  </aside>`;
}

function departureLine(site, doc) {
  if (doc.kind !== 'city' || doc.home?.entry.id === 'korea') return '';
  const icn = site.docs.flatMap((d) => d.places.map((p) => ({ p, d }))).find((x) => x.p.airport === 'ICN');
  return html`<p class="depart">출국 전: ${icn ? html`<a href="${pageHref(icn.d.id, `#${icn.p.slug}`)}">${icn.p.ko}(ICN) 팁</a> · ` : ''}<a href="?p=general">공통 팁</a></p>`;
}

const noIds = (s) => s.replace(/ id="[^"]*"/g, '');

function countryFacts(doc) {
  const c = doc.kind === 'city' ? doc.home?.doc : null;
  if (!c) return '';
  const quick = c.sections.find((s) => s.num === 0 && !s.archive);
  const sos = c.sections.find((s) => s.num === 5 && !s.archive);
  if (!quick && !sos) return '';
  return html`<section class="embed">
    <h2 class="embed-title"><a href="${pageHref(c.id)}">${shortName(c)} 공통 정보</a></h2>
    ${quick ? raw(noIds(quick.bodyHtml)) : ''}
    ${sos ? html`<h3>${sos.title}</h3>${raw(noIds(sos.bodyHtml))}` : ''}
  </section>`;
}

function sections(doc, after0) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    out.push(html`<details class="empties"><summary>비어 있는 섹션 ${run.length}개: ${run.map((s) => s.title).join(' · ')}</summary>
      ${run.map((s) => html`<section class="sec empty">${raw(s.headHtml)}${raw(s.bodyHtml)}</section>`)}</details>`);
    run = [];
  };
  let placed = false;
  for (const s of doc.sections) {
    if (s.archive) {
      flush();
      out.push(html`<details class="archive"><summary>${raw(s.headHtml)}${s.filled ? '' : html`<span class="muted"> 비어 있음</span>`}</summary>${raw(s.bodyHtml)}</details>`);
    } else if (!s.filled && s.num !== 0) {
      run.push(s);
    } else {
      flush();
      out.push(html`<section class="sec">${raw(s.headHtml)}${raw(s.bodyHtml)}</section>`);
    }
    if (s.num === 0 && !placed) { out.push(after0); placed = true; }
  }
  flush();
  return placed ? out : [after0, ...out];
}

function docPage(site, doc) {
  const title = doc.kind === 'general' ? '공통 팁' : shortName(doc);
  const en = doc.kind === 'general' ? '' : doc.en;
  const main = html`<article class="doc ${doc.kind}">
    ${doc.kind === 'general' ? '' : crumbs(site, doc)}
    <h1 id="${slugify(doc.title)}">${doc.kind === 'general' ? doc.title : title}${en ? html` <span class="en">${en}</span>` : ''}</h1>
    ${confLine(doc)}
    ${metaLine(doc)}
    ${warnLine(doc)}
    ${skeleton(doc)}
    ${departureLine(site, doc)}
    ${doc.missing ? '' : html`<div class="pre">${raw(doc.preHtml)}</div>`}
    ${sections(doc, countryFacts(doc))}
  </article>`;
  return { title, main, opts: { current: doc.id, tab: doc.kind === 'general' ? 'general' : '' } };
}

// ---------- 검색 ----------

const KIND = { doc: '페이지', place: '장소', section: '섹션', row: '체크리스트', item: '후기·팁' };

export function searchMain(site, q) {
  if (!q.trim()) {
    return str(html`<section class="search-page"><h1>검색</h1>
      <p class="muted">도시·섹션·장소·체크리스트·후기 문장을 모두 찾습니다. 예:
      ${['교통카드', '리우 숙소', '비엔나', '브라질 콘센트', 'bangalo'].map((x, i) => html`${i ? ' · ' : ''}<a href="?q=${encodeURIComponent(x)}">${x}</a>`)}</p></section>`);
  }
  const { total, results } = search(site, q);
  return str(html`<section class="search-page">
    <h1>"${q}" 검색 결과 ${total}개</h1>
    ${total > results.length ? html`<p class="muted">앞의 ${results.length}개만 보여 줍니다. 검색어를 더 붙여 보세요.</p>` : ''}
    ${total ? '' : html`<p class="muted">찾지 못했습니다. 한 단어로 줄이거나 영어 이름으로 찾아보세요.</p>`}
    <ul class="results">${results.map((x) => html`<li class="result ${x.kind}">
      <a class="hit" href="${x.href}"><span class="kind">${KIND[x.kind]}</span> <b>${x.title || x.text.slice(0, 60)}</b></a>
      ${x.gmap ? html` <a class="gmap" href="${x.gmap}" target="_blank" rel="noopener">${x.gmapLabel}</a>` : ''}
      <span class="crumbs">${[...x.crumbs, x.where || x.sub || ''].filter(Boolean).join(' › ')}</span>
      ${x.kind === 'item' || x.kind === 'row' ? html`<span class="snip">${x.text.length > 160 ? `${x.text.slice(0, 160)}…` : x.text}</span>` : ''}
    </li>`)}</ul></section>`);
}

// ---------- 학회 ----------

// 회차 = 도시 주석의 (학회, 연도) ∪ 꼬리표의 (학회, 연도).
function editionsOf(site) {
  const map = new Map();
  const get = (series, year) => {
    const key = `${series} ${year}`;
    if (!map.has(key)) map.set(key, { key, series, year, places: [], tags: [] });
    return map.get(key);
  };
  for (const e of site.editions) get(e.series, e.year).places.push(e);
  for (const t of site.tags) if (t.tag.conf) get(t.tag.conf, t.tag.year).tags.push(t);
  return [...map.values()];
}

function editionLink(ed, withYear) {
  const where = ed.places.map((p) => shortName(p.doc)).join('·') || '장소 미상';
  const label = withYear ? html`<b>${ed.year}</b> ${where}` : html`<b>${ed.series}</b> ${where}`;
  const href = ed.tags.length ? `?p=conferences&e=${encodeURIComponent(ed.key)}` : ed.places[0] ? pageHref(ed.places[0].doc.id) : '';
  return href ? html`<a href="${href}" class="${ed.tags.length ? 'has' : ''}">${label}${countBadge(ed.tags.length)}</a>` : html`<span>${label}</span>`;
}

function conferences(site) {
  const eds = editionsOf(site);
  const years = [...new Set(eds.map((e) => e.year))].sort((a, b) => b - a);
  const series = [...new Set(eds.map((e) => e.series))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const main = html`<section class="confs-page">
    <h1>학회</h1>
    <p class="muted">${site.stats.editions}회 · ${site.stats.series}개 학회. 후기가 있는 회차(●)는 후기를 모아 보여 주고, 나머지는 개최 도시로 갑니다.</p>
    <p class="jump"><a href="#연도별">연도별</a> · <a href="#학회별">학회별</a></p>
    <h2 id="연도별">연도별</h2>
    <dl class="by">${years.map((y) => html`<dt>${y}</dt><dd><ul class="chips">${eds.filter((e) => e.year === y).sort((a, b) => a.series.localeCompare(b.series)).map((e) => html`<li>${editionLink(e, false)}</li>`)}</ul></dd>`)}</dl>
    <h2 id="학회별">학회별</h2>
    <dl class="by">${series.map((s) => html`<dt>${s}</dt><dd><ul class="chips">${eds.filter((e) => e.series === s).sort((a, b) => b.year - a.year).map((e) => html`<li>${editionLink(e, true)}</li>`)}</ul></dd>`)}</dl>
  </section>`;
  return { title: '학회', main, opts: { tab: 'conferences' } };
}

function editionPage(site, key) {
  const ed = editionsOf(site).find((e) => e.key === key);
  if (!ed) return { title: key, main: html`<p>"${key}" 회차를 찾지 못했습니다. <a href="?p=conferences">학회 목록</a></p>`, opts: { tab: 'conferences' } };
  const groups = [];
  for (const t of ed.tags) {
    let g = groups.find((x) => x.doc === t.doc);
    if (!g) groups.push(g = { doc: t.doc, items: [] });
    g.items.push(t);
  }
  groups.sort((a, b) => b.items.length - a.items.length);
  const docName = (d) => (d.kind === 'country' ? `${shortName(d)} 국가 공통` : shortName(d));
  const main = html`<article class="edition">
    <nav class="crumb"><a href="?p=conferences">학회</a> › ${ed.key}</nav>
    <h1>${ed.key}</h1>
    ${ed.places.map((p) => html`<p class="confs">${p.months ? `${p.months}월 · ` : ''}<a href="${pageHref(p.doc.id)}">${shortName(p.doc)}</a>${p.venue ? ` · ${p.venue}` : ''}</p>`)}
    <p class="meta">후기 ${ed.tags.length}개${groups.length > 1 ? `: ${groups.map((g) => `${docName(g.doc)} ${g.items.length}`).join(' · ')}` : ''}</p>
    ${groups.map((g) => html`<section class="sec">
      <h2><a href="${pageHref(g.doc.id)}">${docName(g.doc)}</a> <span class="n">●${g.items.length}</span></h2>
      <ul>${g.items.map((t) => html`<li class="${t.hearsay ? 'hearsay' : ''}">${raw(t.html || '')}
        <a class="where" href="${pageHref(g.doc.id, t.anchor ? `#${t.anchor}` : '')}">${[t.sectionTitle, t.place].filter(Boolean).join(' › ')}</a></li>`)}</ul>
    </section>`)}
  </article>`;
  return { title: ed.key, main, opts: { tab: 'conferences' } };
}
