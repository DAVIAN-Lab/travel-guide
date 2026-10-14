// 진입점: 마크다운 불러오기 · 주소(?p=) 해석 · 화면 전환.
import { loadSite } from './parse.mjs';
import * as views from './views.mjs';

export const ROOT = new URL('../', import.meta.url);
const app = document.getElementById('app');
let site = null;
let deployed = '';

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

function render() {
  if (!site) return;
  const r = route();
  const v = views.page(site, r, { deployed, reload, onSearch });
  app.innerHTML = v.html;
  document.title = v.title ? `${v.title} · DAVIAN 출장 가이드` : 'DAVIAN 출장 가이드';
  v.mount?.(app);
  const y = history.state?.scrollY;
  if (typeof y === 'number') window.scrollTo(0, y);
  else if (!(r.hash && jumpTo(r.hash, false))) window.scrollTo(0, 0);
}

// id는 숫자로 시작할 수 있어 querySelector 대신 getElementById. 접힌 섹션은 펼친다.
function jumpTo(id, smooth) {
  const el = document.getElementById(id);
  if (!el) return false;
  for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  return true;
}

function saveScroll() {
  try { history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, ''); } catch { /* 무시 */ }
}

export function navigate(href, { replace = false } = {}) {
  const to = new URL(href, location.href);
  const same = to.search === location.search && to.pathname === location.pathname;
  saveScroll();
  try { history[replace ? 'replaceState' : 'pushState']({}, '', to); } catch { location.href = to; return; }
  if (same && to.hash) { jumpTo(route().hash, true); return; }
  render();
}

// 검색창 입력: 결과 영역만 바꾸고, 주소는 첫 입력에 한 번 push한 뒤 잠깐 멈췄을 때 replace한다
// (Safari는 replaceState를 30초에 100번 넘게 부르면 막는다).
let searchTimer = 0, urlTimer = 0;
function onSearch(q, now) {
  clearTimeout(searchTimer);
  const run = () => {
    const main = document.getElementById('main');
    if (!main) return;
    const url = `?q=${encodeURIComponent(q)}`;
    if (!route().searching) {
      saveScroll();
      try { history.pushState({}, '', url); } catch { /* 무시 */ }
      for (const a of document.querySelectorAll('.tabs a, .tree a')) a.removeAttribute('aria-current');
    } else {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(() => { try { history.replaceState({}, '', url); } catch { /* 무시 */ } }, 400);
    }
    main.innerHTML = views.searchMain(site, q);
    document.title = `${q ? `검색: ${q}` : '검색'} · DAVIAN 출장 가이드`;
    window.scrollTo(0, 0);
  };
  if (now) run(); else searchTimer = setTimeout(run, 120);
}

async function reload() {
  app.classList.add('busy');
  try { site = await loadAll(true); } finally { app.classList.remove('busy'); }
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

window.addEventListener('popstate', () => render());
window.addEventListener('hashchange', () => site && jumpTo(route().hash, true));
history.scrollRestoration = 'manual';

try {
  site = await loadAll();
  render();
} catch (e) {
  app.innerHTML = views.fatal(e).html;
}
