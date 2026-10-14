// 홈 세계지도. d3-geo + topojson으로 사이트 안에서 그린다 (외부 지도 서비스 없음).
// 홈에서만, 글이 먼저 뜬 뒤 늦게 불러온다. 전체 보기는 110m, 지역 보기는 제주·마요르카·로도스까지 보이는 50m.
import { esc, html, str } from './html.mjs';
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

const MAX_ZOOM = 16;  // 지역 지도를 처음 크기의 몇 배까지 확대할지

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

// 후기 있는 도시는 이름을 단다 (확대하면 모든 도시). 겹치면 앞 이름에 "+n"으로 합친다.
function labels(points, every) {
  const placed = [];
  for (const p of points.filter((q) => every || q.tags).sort((a, b) => b.tags - a.tags)) {
    const box = { x: p.x + 9, y: p.y - 8, w: p.name.length * 13 + 10, h: 18 };
    const hit = placed.find((l) => box.x < l.x + l.w + 14 && l.x < box.x + box.w && box.y < l.y + l.h && l.y < box.y + box.h);
    if (hit) hit.more++;
    else placed.push({ ...box, name: p.name, more: 0 });
  }
  return placed;
}

// 땅은 처음 맞춘 투영으로 한 번만 그리고, 확대·이동은 transform으로 한다. 핀과 이름은 marks()가 화면 좌표로 다시 그린다.
function draw(el, site, region, land) {
  const width = Math.max(280, Math.round(el.clientWidth));
  const all = pins(site);
  const { proj, height } = projectionFor(region, all.filter(region.test), width);
  const path = window.d3.geoPath(proj);
  const base = all.map((p) => {
    const xy = proj([p.lng, p.lat]);
    return xy && { ...p, x: xy[0], y: xy[1] };
  }).filter((p) => p && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  base.sort((a, b) => a.tags - b.tags);
  const svg = str(html`<svg class="map-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${region.label} 지도: 도시 ${base.length}곳">
    <g class="land-g"><path class="land" d="${path(land) || ''}"/></g><g class="marks"></g>
  </svg>`);
  return { svg, view: { base, path, width, height, res: region.res } };
}

function marks(base, v, width, height) {
  const pts = base.map((p) => ({ ...p, x: v.x + p.x * v.k, y: v.y + p.y * v.k }))
    .filter((p) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  const svg = str(html`${pts.map((p) => html`<circle class="${p.tags ? 'pin has' : 'pin'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.tags ? 6 : 4}"/>`)}
    ${labels(pts, v.k >= 2).map((l) => html`<text class="pin-label" x="${l.x.toFixed(1)}" y="${(l.y + 13).toFixed(1)}">${l.name}${l.more ? ` +${l.more}` : ''}</text>`)}`);
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
    <div class="map-stage">
      <div class="map-box"><p class="muted map-wait">지도를 불러오는 중…</p></div>
      <div class="map-zoom" role="group" aria-label="확대·축소">
        <button type="button" data-zoom="2" aria-label="확대" disabled>+</button><button type="button" data-zoom="0.5" aria-label="축소" disabled>−</button>
      </div>
    </div>
    <p class="map-legend"><span class="dot has"></span> 후기 있음 <span class="dot"></span> 기본 정보만 · 핀을 누르면 도시 목록 · 휠이나 +/−로 확대, 끌어서 이동</p>
    <div class="map-pick" aria-live="polite"></div>
  </div>`);
  const box = el.querySelector('.map-box');
  const pick = el.querySelector('.map-pick');
  let region = REGIONS[0], drawn = null, pts = [], token = 0, lastWidth = 0, frame = 0;
  const v = { k: 1, x: 0, y: 0 };

  function paint() {
    frame = 0;
    if (!drawn) return;
    box.querySelector('.land-g').setAttribute('transform', `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${v.k.toFixed(4)})`);
    const out = marks(drawn.base, v, drawn.width, drawn.height);
    box.querySelector('.marks').innerHTML = out.svg;
    pts = out.pts;
    box.classList.toggle('zoomed', v.k > 1);
    for (const b of el.querySelectorAll('button[data-zoom]')) b.disabled = b.dataset.zoom > 1 ? v.k >= MAX_ZOOM : v.k <= 1;
    // 전체 보기(110m)를 크게 확대하면 제주·싱가포르까지 있는 50m로 바꾼다. 투영은 그대로라 땅 모양만 갈아 끼운다.
    if (drawn.res === '110m' && v.k >= 3 && !drawn.detail) {
      const d = drawn;
      d.detail = true;
      loadAtlas('50m').then((land) => { if (d === drawn) box.querySelector('.land')?.setAttribute('d', d.path(land) || ''); }).catch(() => { d.detail = false; });
    }
  }
  const repaint = () => { frame ||= requestAnimationFrame(paint); };

  // (cx, cy)는 viewBox 좌표. 그 점을 제자리에 둔 채 배율을 바꾼다. 처음 범위 밖으로는 나가지 않는다.
  function zoom(f, cx, cy) {
    const k = Math.min(MAX_ZOOM, Math.max(1, v.k * f));
    if (!drawn || k === v.k) return false;
    v.x = cx - (cx - v.x) * (k / v.k);
    v.y = cy - (cy - v.y) * (k / v.k);
    v.k = k;
    clamp();
    repaint();
    return true;
  }
  function clamp() {
    v.x = Math.min(0, Math.max(drawn.width * (1 - v.k), v.x));
    v.y = Math.min(0, Math.max(drawn.height * (1 - v.k), v.y));
  }
  // 화면 좌표 → viewBox 좌표 (s: 화면 1px당 viewBox 단위)
  function local(svg, e) {
    const r = svg.getBoundingClientRect();
    const s = svg.viewBox.baseVal.width / r.width;
    return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s, s };
  }

  async function show() {
    const my = ++token;
    try {
      await loadLibs();
      const land = await loadAtlas(region.res);
      if (my !== token || !el.isConnected) return;
      const out = draw(box, site, region, land);
      box.innerHTML = out.svg;
      drawn = out.view;
      Object.assign(v, { k: 1, x: 0, y: 0 });
      cancelAnimationFrame(frame);
      paint();
      lastWidth = box.clientWidth;
      pick.innerHTML = '';
    } catch (e) {
      if (my !== token) return;
      drawn = null;
      pts = [];
      box.innerHTML = str(html`<p class="muted">지도를 불러오지 못했습니다 (${e.message}). <button type="button" class="map-retry">다시 시도</button></p>`);
    }
  }

  // 끌어서 이동은 확대했을 때만 (폰에서는 확대 전엔 지도 위에서도 페이지가 스크롤된다).
  let drag = null, dragged = false;
  box.addEventListener('pointerdown', (e) => {
    dragged = false;
    const svg = e.target.closest('svg.map-svg');
    if (!svg || !drawn || v.k === 1 || !e.isPrimary || e.button !== 0) return;
    drag = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: v.x, y: v.y, s: local(svg, e).s };
    svg.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (drag?.id !== e.pointerId) return;
    const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
    if (!dragged && Math.hypot(dx, dy) < 4) return;
    dragged = true;
    box.classList.add('dragging');
    v.x = drag.x + dx * drag.s;
    v.y = drag.y + dy * drag.s;
    clamp();
    repaint();
  });
  const end = (e) => { if (drag?.id === e.pointerId) { drag = null; box.classList.remove('dragging'); } };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  // 더 확대·축소할 수 없으면 막지 않아서 페이지가 그대로 스크롤된다.
  box.addEventListener('wheel', (e) => {
    const svg = e.target.closest('svg.map-svg');
    if (!svg) return;
    const { x, y } = local(svg, e);
    const dy = Math.max(-200, Math.min(200, e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)));
    if (zoom(Math.exp(-dy * 0.004), x, y)) e.preventDefault();
  }, { passive: false });
  box.addEventListener('dblclick', (e) => {
    const svg = e.target.closest('svg.map-svg');
    if (svg) { const { x, y } = local(svg, e); zoom(2, x, y); }
  });

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-region]');
    if (b) {
      region = REGIONS.find((r) => r.key === b.dataset.region) || REGIONS[0];
      for (const x of el.querySelectorAll('button[data-region]')) x.setAttribute('aria-pressed', String(x === b));
      show();
      return;
    }
    const z = e.target.closest('button[data-zoom]');
    if (z) { if (drawn) zoom(Number(z.dataset.zoom), drawn.width / 2, drawn.height / 2); return; }
    if (e.target.closest('.map-retry')) { show(); return; }
    const svg = e.target.closest('svg.map-svg');
    if (!svg || dragged) return;
    const { x, y, s } = local(svg, e);
    const near = pts.map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) })).filter((q) => q.d <= 22 * s)
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

// ---------- 도시 페이지 장소 지도 (Leaflet + OpenStreetMap) ----------
// 사이트의 유일한 외부 요청. 버튼을 눌렀을 때만 불러오고, 타일을 미리 받거나 저장하지 않는다.
// OSM이 접속을 막으면 타일 대신 안내 그림이 오므로(tileerror가 안 남) views.mjs의 PLACE_MAP을 false로 바꾼다.
const TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자',
};
let leaflet = null;

function loadLeaflet() {
  if (!leaflet) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('leaflet.css', VENDOR).href;
    document.head.append(css);
    leaflet = script('leaflet.js').catch((e) => { leaflet = null; css.remove(); throw e; });
  }
  return leaflet;
}

// 위치는 fit()이 정한다 (접힌 채 만들어졌을 수 있어서 펼칠 때 부른다). 화면을 떠날 때 remove()로 창 이벤트까지 정리.
// Leaflet은 툴팁·팝업 문자열을 HTML로 넣으므로 모두 이스케이프한다.
export async function mountPlaceMap(el, doc, pinned) {
  await loadLeaflet();
  const L = window.L;
  el.innerHTML = '';
  const map = L.map(el, { attributionControl: true });
  L.tileLayer(TILES.url, { maxZoom: 19, attribution: TILES.attribution, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map);
  const pts = [];
  for (const { place: p, lat, lng } of pinned) {
    const popup = str(html`<b>${p.ko}</b>${p.en ? html`<br><span class="muted">${p.en}</span>` : ''}<br>
      <a href="${p.href}" target="_blank" rel="noopener">구글맵</a> · <a href="${pageHref(doc.id, `#${p.slug}`)}">본문의 후기</a>`);
    L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#ff385c', fillOpacity: 1 })
      .bindPopup(popup).bindTooltip(esc(p.ko), { direction: 'top', offset: [0, -8] }).addTo(map);
    pts.push([lat, lng]);
  }
  const fit = () => {
    map.invalidateSize();
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
  };
  return { fit, remove: () => map.remove() };
}
