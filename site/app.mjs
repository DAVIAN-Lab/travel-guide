// 진입점: 마크다운 불러오기 · 주소(?p=) 해석 · 화면 전환.
import { loadSite } from './parse.mjs';
import * as views from './views.mjs';

const ROOT = new URL('../', import.meta.url);
const app = document.getElementById('app');
let site = null;
let deployed = '';
let shown = '';       // 지금 그려진 주소(hash 제외). 같은 문서 안 hash 이동은 다시 그리지 않는다. 검색 중이면 ''.
let cleanup = null;   // 지난 화면이 남긴 정리 함수 (장소 지도)

async function loadAll(reload = false) {
  return loadSite(async (path) => {
    try {
      const res = await fetch(new URL(path, ROOT), { cache: reload ? 'reload' : 'default' });
      if (!res.ok) return { status: res.status };
      if (path === 'countries/README.md') deployed = res.headers.get('Last-Modified') || '';
      return { text: await res.text() };
    } catch {
      return null;
    }
  });
}

function route() {
  const u = new URL(location.href);
  let hash = u.hash.slice(1);
  try { hash = decodeURIComponent(hash); } catch { /* 그대로 */ }
  return {
    p: u.searchParams.get('p') || '', e: u.searchParams.get('e') || '', q: u.searchParams.get('q') || '',
    searching: u.searchParams.has('q'), hash,
  };
}

function dispose() {
  try { cleanup?.(); } catch { /* 무시 */ }
  cleanup = null;
}

function render() {
  if (!site) return;
  const r = route();
  dispose();
  const v = views.page(site, r, { deployed, reload, onSearch });
  app.innerHTML = v.html;
  shown = location.pathname + location.search;
  document.title = v.title ? `${v.title} · DAVIAN 출장 가이드` : 'DAVIAN 출장 가이드';
  cleanup = v.mount?.(app) || null;
  restoreScroll(r);
}

function restoreScroll(r) {
  const y = history.state?.scrollY;
  if (typeof y === 'number') window.scrollTo(0, y);
  else if (!(r.hash && jumpTo(r.hash))) window.scrollTo(0, 0);
}

// id는 숫자로 시작할 수 있어 querySelector 대신 getElementById. 접힌 섹션은 펼친다.
function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
  el.scrollIntoView({ block: 'start' });
  return true;
}

// 스크롤 위치는 멈출 때마다 지금 기록에 적어 둔다 (뒤로·앞으로·새로고침 때 되살린다).
function saveScroll() {
  try { history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, ''); } catch { /* 무시 */ }
}

function navigate(href) {
  const to = new URL(href, location.href);
  const same = to.pathname + to.search === location.pathname + location.search;
  clearTimeout(searchTimer);
  flushSearchUrl();
  saveScroll();
  // 지금 주소와 같은 링크(홈에서 "지도" 탭 등)는 기록을 늘리지 않는다.
  try { history[to.href === location.href ? 'replaceState' : 'pushState']({}, '', to); } catch { location.href = to; return; }
  if (same && to.hash) { jumpTo(route().hash); return; }
  render();
  document.getElementById('main')?.focus({ preventScroll: true });
}

// 검색창 입력: 결과 영역만 바꾸고, 주소는 첫 입력에 한 번 push한 뒤 잠깐 멈췄을 때 replace한다
// (Safari는 replaceState를 30초에 100번 넘게 부르면 막는다).
let searchTimer = 0, urlTimer = 0, pendingUrl = '';
function flushSearchUrl() {
  clearTimeout(urlTimer);
  if (pendingUrl) { try { history.replaceState(history.state, '', pendingUrl); } catch { /* 무시 */ } }
  pendingUrl = '';
}

function onSearch(q, now) {
  clearTimeout(searchTimer);
  const run = () => {
    const main = document.getElementById('main');
    if (!main) return;
    const url = `?q=${encodeURIComponent(q)}`;
    if (!route().searching) {
      saveScroll();
      try { history.pushState({}, '', url); } catch { /* 무시 */ }
      dispose();
      shown = '';
      main.className = '';
      views.closeDrawer();
      for (const a of document.querySelectorAll('.tabs a, .drawer-tabs a, .tree a')) a.removeAttribute('aria-current');
    } else {
      pendingUrl = url;
      clearTimeout(urlTimer);
      urlTimer = setTimeout(flushSearchUrl, 400);
    }
    main.innerHTML = views.searchMain(site, q);
    document.title = `${q ? `검색: ${q}` : '검색'} · DAVIAN 출장 가이드`;
    window.scrollTo(0, 0);
  };
  if (now) run(); else searchTimer = setTimeout(run, 120);
}

async function reload() {
  saveScroll();
  app.classList.add('busy');
  let fresh = null;
  try { fresh = await loadAll(true); } catch { /* 아래에서 알린다 */ } finally { app.classList.remove('busy'); }
  if (!fresh) {
    const b = app.querySelector('.reload');
    if (b) b.textContent = '불러오지 못했습니다 · 다시 시도';
    return;
  }
  site = fresh;
  render();
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const to = new URL(a.href, location.href);
  if (to.origin !== location.origin || to.pathname !== location.pathname) return;
  e.preventDefault();
  navigate(to.href);
});

// popstate는 주소창에서 hash만 바꿔도 온다. 같은 문서면 다시 그리지 않고 위치만 옮긴다.
window.addEventListener('popstate', () => {
  clearTimeout(searchTimer);
  clearTimeout(urlTimer);
  pendingUrl = '';
  if (site && location.pathname + location.search === shown) restoreScroll(route());
  else render();
});
let scrollTimer = 0;
window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScroll, 300); }, { passive: true });
window.addEventListener('pagehide', saveScroll);
history.scrollRestoration = 'manual';

try {
  site = await loadAll();
  render();
} catch (e) {
  app.innerHTML = views.fatal(e).html;
}
