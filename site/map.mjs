// 홈 세계지도. d3-geo + topojson으로 사이트 안에서 그린다 (외부 지도 서비스 없음).
// 홈에서만, 글이 먼저 뜬 뒤 늦게 불러온다. 전체 보기는 110m, 지역 보기는 제주·마요르카·로도스까지 보이는 50m.
import { html, str } from './html.mjs';
import { pageHref, cityPoint } from './parse.mjs';

const VENDOR = new URL('./vendor/', import.meta.url);
let libs = null;
const atlas = {};

function script(name) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = new URL(name, VENDOR).href;
    s.onload = ok;
    s.onerror = () => fail(new Error(`${name}을(를) 불러오지 못했습니다.`));
    document.head.append(s);
  });
}

// 순서 중요: d3-geo가 d3-array를 쓴다.
function loadLibs() {
  libs ||= script('d3-array.min.js').then(() => script('d3-geo.min.js')).then(() => script('topojson-client.min.js'))
    .catch((e) => { libs = null; throw e; });
  return libs;
}

function loadAtlas(res) {
  atlas[res] ||= fetch(new URL(`countries-${res}.json`, VENDOR))
    .then((r) => { if (!r.ok) throw new Error(`countries-${res}.json HTTP ${r.status}`); return r.json(); })
    .then((t) => window.topojson.feature(t, t.objects.countries))
    .catch((e) => { delete atlas[res]; throw e; });
  return atlas[res];
}

// 지역 = 기본 상자 ∪ 그 지역 도시들의 범위. 새 도시가 생겨도 경도로 자동 분류된다.
const REGIONS = [
  { key: 'all', label: '전체', box: [-165, -45, 165, 65], center: 0, res: '110m', test: () => true },
  { key: 'korea', label: '한국', box: [125.8, 33.1, 129.6, 38.4], center: 127.5, res: '50m', test: (c) => c.country === 'korea' },
  { key: 'asia', label: '아시아·오세아니아', box: [95, -40, 150, 42], center: 122, res: '50m', test: (c) => c.lng >= 60 },
  { key: 'emea', label: '유럽·중동·아프리카', box: [-10, -5, 56, 57], center: 22, res: '50m', test: (c) => c.lng >= -25 && c.lng < 60 },
  { key: 'americas', label: '미주', box: [-160, -26, -42, 52], center: -100, res: '50m', test: (c) => c.lng < -25 },
];

function pins(site) {
  return site.countries.flatMap((c) => c.cities.map((ct) => {
    const p = cityPoint(site, ct.entry.id);
    return p && {
      id: ct.entry.id, name: ct.entry.ko, country: c.entry.id, countryName: c.entry.ko, lat: p.lat, lng: p.lng,
      tags: ct.doc?.tags.length || 0, editions: ct.doc?.editions.map((e) => e.label) || [],
    };
  })).filter(Boolean);
}

function boxOf(region, list) {
  let [w, s, e, n] = region.box;
  for (const c of list) {
    if (region.key === 'all') continue;
    w = Math.min(w, c.lng - 1.5); e = Math.max(e, c.lng + 1.5);
    s = Math.min(s, c.lat - 1.5); n = Math.max(n, c.lat + 1.5);
  }
  return [w, s, e, n];
}

function projectionFor(region, list, width) {
  const d3 = window.d3;
  const [w, s, e, n] = boxOf(region, list);
  const mid = (w + e) / 2;
  const outline = { type: 'MultiPoint', coordinates: [[w, s], [mid, s], [e, s], [w, n], [mid, n], [e, n]] };
  const probe = d3.geoMercator().rotate([-region.center, 0]).fitWidth(width, outline);
  const [[x0, y0], [x1, y1]] = d3.geoPath(probe).bounds(outline);
  const height = Math.round(Math.min(Math.max(width * ((y1 - y0) / Math.max(1, x1 - x0)), 220), 560));
  const pad = 14;
  const proj = d3.geoMercator().rotate([-region.center, 0])
    .fitExtent([[pad, pad], [width - pad, height - pad]], outline)
    .clipExtent([[0, 0], [width, height]]);
  return { proj, height };
}

// 후기 있는 도시는 이름을 단다. 겹치면 앞 이름에 "+n"으로 합친다.
function labels(points) {
  const placed = [];
  for (const p of points.filter((q) => q.tags).sort((a, b) => b.tags - a.tags)) {
    const box = { x: p.x + 9, y: p.y - 8, w: p.name.length * 13 + 10, h: 18 };
    const hit = placed.find((l) => box.x < l.x + l.w + 14 && l.x < box.x + box.w && box.y < l.y + l.h && l.y < box.y + box.h);
    if (hit) hit.more++;
    else placed.push({ ...box, name: p.name, more: 0 });
  }
  return placed;
}

function draw(el, site, region, land) {
  const width = Math.max(280, Math.round(el.clientWidth));
  const all = pins(site);
  const inRegion = all.filter(region.test);
  const { proj, height } = projectionFor(region, inRegion, width);
  const path = window.d3.geoPath(proj);
  const pts = all.map((p) => {
    const xy = proj([p.lng, p.lat]);
    return xy && { ...p, x: xy[0], y: xy[1] };
  }).filter((p) => p && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  pts.sort((a, b) => a.tags - b.tags);
  const svg = str(html`<svg class="map-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${region.label} 지도: 도시 ${pts.length}곳">
    <path class="land" d="${path(land) || ''}"/>
    ${pts.map((p) => html`<circle class="${p.tags ? 'pin has' : 'pin'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.tags ? 6 : 4}"/>`)}
    ${labels(pts).map((l) => html`<text class="pin-label" x="${l.x.toFixed(1)}" y="${(l.y + 13).toFixed(1)}">${l.name}${l.more ? ` +${l.more}` : ''}</text>`)}
  </svg>`);
  return { svg, pts };
}

function card(found) {
  if (!found.length) return '';
  return str(html`<ul class="map-card">${found.map((p) => html`<li>
    <a href="${pageHref(p.id)}"><b>${p.name}</b></a> <span class="muted">${p.countryName}</span>
    ${p.tags ? html` <span class="n">●${p.tags}</span>` : ''}
    ${p.editions.length ? html`<span class="sub">${p.editions.join(' · ')}</span>` : ''}</li>`)}</ul>`);
}

export async function mountMap(el, site) {
  el.innerHTML = str(html`<div class="map">
    <div class="map-regions" role="group" aria-label="지역">${REGIONS.map((r, i) => html`<button type="button" data-region="${r.key}" aria-pressed="${String(i === 0)}">${r.label}</button>`)}</div>
    <div class="map-box"><p class="muted map-wait">지도를 불러오는 중…</p></div>
    <p class="map-legend"><span class="dot has"></span> 후기 있음 <span class="dot"></span> 기본 정보만 · 핀을 누르면 도시 목록</p>
    <div class="map-pick" aria-live="polite"></div>
  </div>`);
  const box = el.querySelector('.map-box');
  const pick = el.querySelector('.map-pick');
  let region = REGIONS[0], pts = [], token = 0, lastWidth = 0;

  async function show() {
    const my = ++token;
    try {
      await loadLibs();
      const land = await loadAtlas(region.res);
      if (my !== token || !el.isConnected) return;
      const out = draw(box, site, region, land);
      box.innerHTML = out.svg;
      pts = out.pts;
      lastWidth = box.clientWidth;
      pick.innerHTML = '';
    } catch (e) {
      if (my !== token) return;
      box.innerHTML = str(html`<p class="muted">지도를 불러오지 못했습니다 (${e.message}). <button type="button" class="map-retry">다시 시도</button></p>`);
    }
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-region]');
    if (b) {
      region = REGIONS.find((r) => r.key === b.dataset.region) || REGIONS[0];
      for (const x of el.querySelectorAll('button[data-region]')) x.setAttribute('aria-pressed', String(x === b));
      show();
      return;
    }
    if (e.target.closest('.map-retry')) { show(); return; }
    const svg = e.target.closest('svg.map-svg');
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const k = svg.viewBox.baseVal.width / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    const near = pts.map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) })).filter((q) => q.d <= 22 * k)
      .sort((a, b) => a.d - b.d).map((q) => q.p);
    pick.innerHTML = card(near);
  });

  let timer = 0;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }
    if (Math.abs(box.clientWidth - lastWidth) < 8) return;
    clearTimeout(timer);
    timer = setTimeout(show, 150);
  });
  ro.observe(box);
  await show();
}
