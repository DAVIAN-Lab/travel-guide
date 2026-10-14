// 점검 페이지: 해석기 함정 시험 + 실제 콘텐츠 형식 검사. 결과는 탭 제목에 CHECK PASS / CHECK FAIL (n).
import {
  parseDoc, slugify, slugger, blankComments, TAG_RE, parseConferences, rewriteHref, loadSite, geoProblems, placeKey, REPO,
} from './parse.mjs';
import { html, str } from './html.mjs';
import { norm, jamo } from './search.mjs';

const ROOT = new URL('../', import.meta.url);
const out = document.getElementById('out');

const eq = (a, b) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`기대 ${y}, 실제 ${x}`);
};
const yes = (v, msg) => { if (!v) throw new Error(msg || '거짓'); };

const CITY = (body, head = '') => `> 이 도시는 [미국 (USA)](README.md) 공통 가이드를 따릅니다.\n\n# 시험 (Test)\n${head}\n${body}`;

const tests = [
  ['제목 id: 번호와 마침표', () => eq(slugify('8. 주의사항'), '8-주의사항')],
  ['제목 id: 슬래시는 지우고 공백은 그대로 하이픈', () => eq(slugify('7. 관광 / 시간 활용'), '7-관광--시간-활용')],
  ['제목 id: em dash', () => eq(slugify('퀵 체크리스트 — 옛 상태'), '퀵-체크리스트--옛-상태')],
  ['제목 id: 가운뎃점 삭제', () => eq(slugify('4. 화폐·결제·환전'), '4-화폐결제환전')],
  ['제목 id: 괄호·영문 소문자', () => eq(slugify('인천국제공항 (ICN)'), '인천국제공항-icn')],
  ['제목 id: 중복은 -1, -2', () => { const s = slugger(); eq([s('공항 — 옛 후기'), s('공항 — 옛 후기'), s('공항 — 옛 후기')], ['공항--옛-후기', '공항--옛-후기-1', '공항--옛-후기-2']); }],

  ['꼬리표: 학회 + 노선', () => eq({ ...' — 조영우 (ICLR 2026.04 · JFK-GIG, 산티아고 경유)'.match(TAG_RE).groups }, { name: '조영우', conf: 'ICLR', year: '2026', month: '04', route: 'JFK-GIG, 산티아고 경유' })],
  ['꼬리표: 학회 무관', () => eq('— 조영우 (2026.05)'.replace(/^/, 'x ').match(TAG_RE).groups.conf, undefined)],
  ['꼬리표: 두 단어 학회명', () => eq(' — 김 (IEEE VIS 2023.10)'.match(TAG_RE).groups.conf, 'IEEE VIS')],
  ['꼬리표 아님: 하이픈', () => eq(' - 조영우 (ICLR 2026.04)'.match(TAG_RE), null)],
  ['꼬리표 아님: 월 한 자리', () => eq(' — 조영우 (ICLR 2026.4)'.match(TAG_RE), null)],
  ['꼬리표 아님: 끝에 마침표', () => eq(' — 조영우 (ICLR 2026.04).'.match(TAG_RE), null)],
  ['꼬리표 아님: 전각 괄호', () => eq(' — 조영우 （ICLR 2026.04）'.match(TAG_RE), null)],
  ['꼬리표: 본문 속 em dash와 섞이지 않음', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 4. 교통\n\n- **도어투도어 원칙** — 끊기지 않게. 사례는 [## 8. 주의사항](#8-주의사항) 참고. — 조영우 (ICLR 2026.04)\n'));
    eq(d.tags.length, 1); eq(d.tags[0].tag.name, '조영우'); eq(d.tags[0].head, '도어투도어 원칙');
  }],
  ['형식이 틀린 꼬리표는 경고', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 3. 숙소\n\n- 좋았음. — 조영우 (ICLR 2026.4)\n'));
    eq(d.tags.length, 0); yes(d.warnings.some((w) => w.msg.includes('꼬리표')));
  }],
  ['(전언)은 굵은 머리말 뒤에 있어도 감지', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 8. 주의사항\n\n- **하차 지점 확인** — (전언) 강도 사례. — 조영우 (ICLR 2026.04)\n- (전언) **상위 등급** — 조언. — 조영우 (ICLR 2026.04)\n'));
    eq(d.items.filter((i) => i.hearsay).length, 2);
  }],

  ['주석은 줄 수를 유지하며 지운다', () => eq(blankComments('a\n<!-- x\ny -->\nb'), 'a\n\n\nb')],
  ['주석 글은 화면에 나오지 않는다', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 1. 개요\n\n<!-- agent:\n비밀 메모\n-->\n\n- 본문\n'));
    yes(!JSON.stringify(d).includes('비밀 메모'));
  }],
  ['줄 번호는 원문 줄과 같다', () => {
    const d = parseDoc('countries/usa/t.md', '# T (T)\n\n<!-- a\nb\nc -->\n\n## 3. 숙소\n\n- 하나. — 김 (2026.01)\n');
    eq(d.tags[0].line, 9);
  }],
  ['닫히지 않은 주석: 경고만 하고 throw하지 않는다', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 1. 개요\n\n<!-- 닫지 않음\n\n- 본문\n'));
    eq(d.error, null); yes(d.warnings.some((w) => w.msg.includes('닫히지 않은')));
  }],
  ['빈 파일·이상한 입력도 throw하지 않는다', () => {
    for (const s of ['', '﻿', '\0\0\0', '#', '|a|\n|-|\n|b|', '- '.repeat(5000), '['.repeat(10000), '<!--'.repeat(500)]) parseDoc('countries/usa/t.md', s);
  }],
  ['CRLF·BOM은 정규화한다', () => eq(parseDoc('countries/usa/t.md', '﻿# 가 (A)\r\n\r\n## 1. 개요\r\n\r\n- x\r\n').sections[0].slug, '1-개요')],

  ['학회 주석: 괄호 안 장소', () => eq(parseConferences('ICCV 2019 (10월 — COEX), ICASSP 2024 (4월).').editions.map((e) => [e.label, e.venue]), [['ICCV 2019', 'COEX'], ['ICASSP 2024', '']])],
  ['학회 주석: 괄호 뒤 장소', () => eq(parseConferences('ICLR 2026 (4월) — Riocentro Convention Center.').editions[0].venue, 'Riocentro Convention Center')],
  ['학회 주석: "둘 다" 장소', () => eq(parseConferences('NeurIPS 2022 (12월), NeurIPS 2023 (12월). 둘 다 Ernest N. Morial Convention Center.').editions.map((e) => e.venue), ['Ernest N. Morial Convention Center', 'Ernest N. Morial Convention Center'])],
  ['학회 주석: 괄호가 든 "둘 다" 장소', () => eq(parseConferences('WACV 2023 (1월), WACV 2024 (1월). 둘 다 Waikoloa Beach (Big Island, Hawaii).').editions[1].venue, 'Waikoloa Beach (Big Island, Hawaii)')],
  ['학회 주석: 기간·특수 이름', () => eq(parseConferences('IEEE VIS 2023 (10월), ACM MM 2024 (10-11월), ECML/PKDD 2023 (9월), IJCNLP-AACL 2023 (11월) — Nusa Dua.').editions.map((e) => [e.series, e.months, e.month]), [['IEEE VIS', '10', 10], ['ACM MM', '10-11', 10], ['ECML/PKDD', '9', 9], ['IJCNLP-AACL', '11', 11]])],
  ['학회 주석: 산문 메모', () => { const c = parseConferences('정기 개최지는 아니나 KAIST 권역 출장 등으로 정기 방문.'); eq([c.editions.length, c.bad.length, !!c.note], [0, 0, true]); }],
  ['학회 주석: 숫자·기호·한글 학회명, 못 읽는 조각은 남긴다', () => {
    const c = parseConferences('3DV 2025 (3월), S&P 2025 (5월), 정보과학회 2024 (6월), ICLR 2027, 무엇 (4월).');
    eq([c.editions.map((e) => e.label), c.bad], [['3DV 2025', 'S&P 2025', '정보과학회 2024', 'ICLR 2027'], ['무엇 (4월)']]);
  }],

  ['장소: 링크 하나뿐인 H3만, 이름은 마지막 괄호로', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 3. 숙소\n\n### [아사도르 히우스 (Assador Rio\'s)](https://maps.app.goo.gl/x)\n\n### 그냥 제목 [링크](https://maps.app.goo.gl/y)\n\n- TODO: `### [호텔 (Hotel)](https://maps.app.goo.gl/...)` 형식.\n'));
    eq(d.places.map((p) => [p.ko, p.en, p.kind]), [['아사도르 히우스', "Assador Rio's", 'share']]);
  }],
  ['장소: 공항은 ## 2 + 세 글자 코드', () => {
    const d = parseDoc('countries/usa/t.md', CITY('## 2. 공항\n\n### [존 F. 케네디 국제공항 (JFK)](https://www.google.com/maps/search/JFK)\n\n## 3. 숙소\n\n### [JFK 공항 메리어트 (New York Marriott JFK Airport)](https://maps.app.goo.gl/z)\n'));
    eq(d.places.map((p) => p.airport), ['JFK', '']);
  }],

  ['링크: 같은 국가 README → 국가 페이지', () => eq(rewriteHref('README.md', 'countries/brazil/rio-de-janeiro.md').href, '?p=brazil')],
  ['링크: 다른 국가 도시', () => eq(rewriteHref('../usa/new-york.md', 'countries/brazil/README.md').href, '?p=usa/new-york')],
  ['링크: 같은 문서 앵커', () => eq(decodeURIComponent(rewriteHref('#8-주의사항', 'countries/brazil/rio-de-janeiro.md').href), '?p=brazil/rio-de-janeiro#8-주의사항')],
  ['링크: 규칙 문서는 GitHub로', () => eq(rewriteHref('../../AGENTS.md', 'countries/usa/atlanta.md').href, `${REPO}/blob/main/AGENTS.md`)],
  ['링크: 폴더는 GitHub tree로', () => eq(rewriteHref('../templates/', 'countries/README.md').href, `${REPO}/tree/main/templates/`)],
  ['링크: 국가 목록은 홈', () => eq(rewriteHref('countries/README.md', 'general.md').href, './')],
  ['링크: 외부 주소는 그대로', () => eq(rewriteHref('https://www.dayuse.com/', 'general.md'), { href: 'https://www.dayuse.com/', external: true })],
  ['장소 좌표 키는 쿼리를 뗀다', () => eq(placeKey('https://maps.app.goo.gl/abc?g_st=ic'), 'https://maps.app.goo.gl/abc')],
  ['검색: 악센트·대소문자·공백 무시', () => eq(norm('Bangalô  Restaurante'), 'bangalorestaurante')],
  ['검색: 입력 중인 글자(칻·ㅋ)도 맞는다', () => { yes(jamo('교통카드').includes(jamo('교통칻'))); yes(jamo('교통카드').includes(jamo('교통ㅋ'))); }],
  ['검색: 겹자모 분해', () => eq([jamo('ㅘ'), jamo('왜'), jamo('닭')], ['ㅗㅏ', 'ㅇㅗㅐ', 'ㄷㅏㄹㄱ'])],
];

function runTests() {
  return tests.map(([name, fn]) => {
    try { fn(); return { name, ok: true }; } catch (e) { return { name, ok: false, msg: e.message }; }
  });
}

async function read(path) {
  try {
    const res = await fetch(new URL(path, ROOT), { cache: 'no-store' });
    return res.ok ? { text: await res.text() } : { status: res.status };
  } catch { return null; }
}

// 콘텐츠 형식 검사. 문서 안 경고(doc.warnings) + 문서 사이의 규칙.
function contentProblems(site) {
  const probs = [];
  const add = (doc, line, msg) => probs.push({ doc, line, msg });
  for (const c of site.countries) {
    if (!c.doc || c.doc.missing) add(null, 0, `${c.entry.name}: 국가 README를 불러오지 못했습니다.`);
    else if (!c.cities.length) add(c.doc, 0, '## 6. 도시 목록에 도시가 없습니다.');
    for (const ct of c.cities) if (!ct.doc || ct.doc.missing) add(c.doc, ct.entry.line, `${ct.entry.name}: 도시 문서를 불러오지 못했습니다.`);
  }
  for (const d of [site.index, ...site.docs]) {
    if (d.error && !d.missing) add(d, 0, `해석 실패: ${d.error}`);
    for (const w of d.warnings) add(d, w.line, w.msg);
    if (d.kind === 'city' && !d.missing) {
      for (const p of d.places) if (p.kind === 'site') add(d, p.line, `장소 제목 링크가 구글맵이 아닙니다: ${p.href}`);
      const q = d.sections.find((s) => s.num === 0 && !s.archive);
      if (q && !d.tables.some((t) => t.checklist)) add(d, q.line, '퀵 체크리스트 표의 열이 항목 / 상태 / 최근 확인이 아닙니다.');
    }
  }
  return [...probs, ...geoProblems(site)];
}

function stats(site) {
  const places = site.docs.flatMap((d) => d.places);
  const s = site.stats;
  return `국가 ${s.countries} · 도시 ${s.cities} · 학회 ${s.editions}/${s.series} · 꼬리표 ${s.tags} · 장소 ${places.filter((p) => p.kind !== 'site').length} · 항공사 ${places.filter((p) => p.kind === 'site').length}`;
}

const where = (p) => (p.doc ? html`<a href="${REPO}/blob/main/${p.doc.path}${p.line ? `#L${p.line}` : ''}" target="_blank" rel="noopener">${p.doc.path}${p.line ? `:${p.line}` : ''}</a> ` : '');

async function main() {
  const results = runTests();
  const failed = results.filter((r) => !r.ok);
  let site = null, probs = [], loadError = '';
  try { site = await loadSite(read); probs = contentProblems(site); } catch (e) { loadError = e.message; }
  const n = failed.length + probs.length + (loadError ? 1 : 0);
  document.title = n ? `CHECK FAIL (${n})` : 'CHECK PASS';
  out.innerHTML = str(html`
    <h1 class="${n ? 'fail' : 'pass'}">${n ? `CHECK FAIL (${n})` : 'CHECK PASS'}</h1>
    ${site ? html`<p class="stats">${stats(site)}</p>` : ''}
    <h2>해석기 시험 ${results.length - failed.length}/${results.length} 통과</h2>
    <ul>${results.map((r) => html`<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : html` — ${r.msg}`}</li>`)}</ul>
    <h2>콘텐츠 형식 ${loadError ? '불러오기 실패' : probs.length ? `문제 ${probs.length}건` : '문제 없음'}</h2>
    ${loadError ? html`<p class="bad">${loadError}</p>` : ''}
    <ul>${probs.map((p) => html`<li class="bad">${where(p)}${p.msg}</li>`)}</ul>
    <p><a href="../">사이트로</a></p>`);
}

main();
