// 진입점: 마크다운 불러오기 · 주소(?p=) 해석 · 화면 전환.
import { parseDoc, idToPath, buildSite } from './parse.mjs';
import * as views from './views.mjs';

export const ROOT = new URL('../', import.meta.url);
const app = document.getElementById('app');
let site = null;
let deployed = '';

async function loadDoc(path, reload) {
  try {
    const res = await fetch(new URL(path, ROOT), { cache: reload ? 'reload' : 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (path === 'countries/README.md') deployed = res.headers.get('Last-Modified') || '';
    return parseDoc(path, await res.text());
  } catch (e) {
    const d = parseDoc(path, '');
    d.missing = true;
    d.error = `${path}을(를) 불러오지 못했습니다 (${e.message}).`;
    return d;
  }
}

// 국가 목록 → 국가 README의 ## 6. 도시 목록 → 도시 문서. 따로 관리하는 목록은 없다.
async function loadAll(reload = false) {
  const [index, general] = await Promise.all([
    loadDoc('countries/README.md', reload), loadDoc('general.md', reload)]);
  if (index.missing || index.countries.length === 0) throw new Error(index.error || '국가 목록이 비어 있습니다.');
  const countries = await Promise.all(index.countries.map((c) => loadDoc(idToPath(c.id), reload)));
  const cityIds = countries.flatMap((d) => d.cities.map((c) => c.id));
  const cities = await Promise.all(cityIds.map((id) => loadDoc(idToPath(id), reload)));
  return buildSite(index, general, countries, cities);
}

function route() {
  const u = new URL(location.href);
  let hash = u.hash.slice(1);
  try { hash = decodeURIComponent(hash); } catch { /* 그대로 */ }
  return { p: u.searchParams.get('p') || '', e: u.searchParams.get('e') || '', q: u.searchParams.get('q') || '', hash };
}

function render() {
  if (!site) return;
  const r = route();
  const v = views.page(site, r, { deployed, reload });
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
