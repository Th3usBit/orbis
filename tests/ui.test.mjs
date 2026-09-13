/**
 * Full UI/UX validation against the running app.
 *
 * Everything here is measured in a real browser at several sizes, because the
 * questions that matter -- is this readable, is this reachable, does this
 * respond -- cannot be answered from the stylesheet.
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/* Playwright is not a dependency of orbis and never will be -- the site runs
   without a package manager. This test is opt-in: it uses whatever Playwright
   the machine already has, and skips cleanly when there is none. */
let chromium;
{
  /* Try, in order: a Playwright next to this project, one installed globally,
     and one left behind by `npx playwright`. Any of them is fine; none of them
     is a failure, because the site itself needs no package manager. */
  const candidates = ['playwright'];
  if (process.env.PLAYWRIGHT_PATH) {
    const given = process.env.PLAYWRIGHT_PATH;
    /* A filesystem path has to become a file:// URL before import() will take
       it -- on Windows a bare C:\... is read as a protocol and silently fails
       the lookup, which showed up as a SKIP that looked like a pass. Try the
       URL form first, then the raw value for a bare package name. */
    if (!given.startsWith('file:') && /[\\/]/.test(given)) {
      candidates.unshift(pathToFileURL(given).href);
    }
    candidates.unshift(given);
  }

  for (const name of candidates) {
    try {
      ({ chromium } = await import(name));
      if (chromium) break;
    } catch { /* try the next one */ }
  }

  if (!chromium) {
    console.log('\n  SKIP  Playwright not found. To run this suite:');
    console.log('        npx playwright@1 install chromium');
    console.log('        PLAYWRIGHT_PATH=<path to playwright> node tests/ui.test.mjs .\n');
    process.exit(0);
  }
}

const PORT = Number(process.env.ORBIS_PORT ?? 8321);
const URL = `http://127.0.0.1:${PORT}/`;

/* Start the project's own dev server unless one is already listening. */
let server = null;
const up = async () => fetch(URL).then((r) => r.ok).catch(() => false);
if (!(await up())) {
  server = spawn(process.platform === 'win32' ? 'python' : 'python3',
    ['scripts/serve.py', '--no-browser', '--port', String(PORT)],
    { cwd: process.argv[2] ?? '.', stdio: 'ignore', detached: false });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));
}
const shutdown = () => { try { server?.kill(); } catch {} };
process.on('exit', shutdown);

const browser = await chromium.launch();
let fails = 0, passes = 0;

const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? passes++ : fails++;
};

const open = async (w = 1440, h = 900, tz = 'America/Sao_Paulo') => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, timezoneId: tz });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(2400);
  return { page, errors };
};

/* ============================================================ 1. UI ===== */
console.log('\n=== UI: o que o usuario ve ===');
{
  const { page, errors } = await open();

  check('a pagina carrega sem erro de JS', errors.length === 0, errors[0]?.slice(0, 60));
  check('o globo tem contexto WebGL', await page.evaluate(() => {
    const c = document.querySelector('#stage');
    return !!(c?.getContext('webgl2') || c?.getContext('webgl'));
  }));

  const type = await page.evaluate(() => {
    const fams = new Set(), weights = new Set();
    for (const el of document.querySelectorAll('#shell *')) {
      if (!el.textContent?.trim() || el.children.length) continue;
      const s = getComputedStyle(el);
      fams.add(s.fontFamily.split(',')[0].replace(/"/g, ''));
      weights.add(s.fontWeight);
    }
    return { fams: [...fams], weights: [...weights].length };
  });
  check('duas familias tipograficas, nao mais', type.fams.length <= 2, type.fams.join(', '));
  check('escala de pesos contida (<= 4)', type.weights <= 4, `${type.weights} pesos`);

  const h1 = await page.evaluate(() => ({ n: document.querySelectorAll('h1').length, txt: document.querySelector('h1')?.textContent.trim() }));
  check('a pagina tem exatamente um h1', h1.n === 1, `${h1.n} ("${h1.txt}")`);

  const named = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).length);
  check('todo botao tem nome acessivel', named === 0, `${named} sem nome`);

  const focus = await page.evaluate(() => {
    const el = document.querySelector('.filter-row');
    el.focus();
    const s = getComputedStyle(el);
    return s.outlineWidth !== '0px' || s.boxShadow !== 'none';
  });
  check('o foco do teclado e visivel', focus);

  await page.close();
}

/* ========================================================= 2. CONTRASTE = */
console.log('\n=== UI: contraste medido em pixels ===');
{
  const { page } = await open();
  const low = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return null; const f = m.slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const ratio = (a, b) => { const [hi, lo] = [a, b].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
    /* Composite the translucent panel over the page background by hand: the
       glass is rgba, so the declared colour is not what a reader sees. */
    const over = (fg, bg) => {
      const f = fg.match(/[\d.]+/g).map(Number);
      const b = Array.isArray(bg) ? bg : bg.match(/[\d.]+/g).map(Number);
      const a = f.length > 3 ? f[3] : 1;
      return [0, 1, 2].map((i) => Math.round(f[i] * a + b[i] * (1 - a)));
    };
    const page_bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    const out = [];
    for (const el of document.querySelectorAll('#shell *')) {
      if (el.children.length || !el.textContent?.trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.opacity === '0') continue;
      if (/\p{Extended_Pictographic}/u.test(el.textContent)) continue;   // emoji tem cor propria
      let bg = page_bg, p = el;
      while (p) {
        const c = getComputedStyle(p).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)') { bg = over(c, bg); break; }
        p = p.parentElement;
      }
      const fg = s.color.match(/\d+/g).slice(0, 3).map(Number);
      const px = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
      const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
      const got = ratio(lum(`rgb(${fg})`), lum(`rgb(${bg})`));
      if (got < need) out.push({ txt: el.textContent.trim().slice(0, 20), cls: (el.className || el.tagName).toString().slice(0, 18), px, razao: +got.toFixed(2), need });
    }
    return out;
  });
  check('todo texto passa no WCAG AA', low.length === 0, low.slice(0, 4).map((l) => `${l.razao}:1 "${l.txt}" .${l.cls}`).join(' | '));
  await page.close();
}

/* ============================================================ 3. UX ===== */
console.log('\n=== UX: o usuario consegue concluir tarefas ===');
{
  const { page } = await open();

  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const skip = await page.evaluate(() => {
    const a = document.querySelector('.skip-link');
    return { focado: document.activeElement === a, top: Math.round(a.getBoundingClientRect().top) };
  });
  check('o skip link aparece no primeiro Tab', skip.focado && skip.top >= 0, `top=${skip.top}`);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check('o skip link leva a lista de eventos',
    await page.evaluate(() => document.activeElement?.id === 'event-list' || !!document.activeElement?.closest('.rail-right')));

  await page.locator('.tl-day').nth(3).click();
  await page.waitForTimeout(800);
  const dia = await page.locator('.event-title').count();
  check('clicar num dia da timeline muda a lista', dia > 5, `${dia} eventos`);

  const antes = await page.evaluate(() => document.querySelector('#panel-sub')?.textContent);
  await page.locator('.chip').first().click();
  await page.waitForTimeout(700);
  const depois = await page.evaluate(() => document.querySelector('#panel-sub')?.textContent);
  check('a contagem e anunciada a leitores de tela', antes !== depois && await page.evaluate(() => !!document.querySelector('#panel-sub[aria-live]')), `${antes} -> ${depois}`);

  check('o botao limpar aparece quando ha filtro', await page.evaluate(() => !document.querySelector('#panel-reset')?.hidden));
  await page.locator('#panel-reset').click();
  await page.waitForTimeout(700);
  check('limpar zera filtros e selecao', await page.evaluate(() =>
    document.querySelectorAll('.chip.is-on').length === document.querySelectorAll('.chip').length
    && document.querySelectorAll('.filter-row.is-off').length === 0));

  // Empty state must offer a way out rather than a dead end.
  for (const i of [0, 1, 2, 3]) { await page.locator('#filter-impact > *').nth(i).click(); await page.waitForTimeout(180); }
  await page.waitForTimeout(600);
  const vazio = await page.evaluate(() => ({
    eventos: document.querySelectorAll('.event-title').length,
    temMensagem: !!document.querySelector('.rail-right')?.textContent.match(/nenhum|no events|ning/i),
    temSaida: !document.querySelector('#panel-reset')?.hidden,
  }));
  check('o estado vazio explica e oferece saida', vazio.temMensagem && vazio.temSaida, JSON.stringify(vazio));

  check('a dica de uso menciona o teclado',
    await page.evaluate(() => /←|→|arrow|seta/i.test(document.querySelector('.hint')?.textContent ?? '')));

  await page.close();
}

/* ================================================ 4. FUNDAMENTOS ======= */
console.log('\n=== UI: os fundamentos sobrevivem a densidade ===');
{
  /* The rail was compacted to fit five cards on a 900px screen. Density is
     cheap to add and expensive to notice going wrong, so the thresholds that
     make it liveable are asserted rather than eyeballed. */
  const { page } = await open();
  const F = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const alvos = [...document.querySelectorAll('.rail-left button')].map((b) => Math.min(r(b).width, r(b).height));
    const linha = r(document.querySelector('.filter-row')).height;
    const texto = parseFloat(getComputedStyle(document.querySelector('.filter-label')).fontSize);
    return {
      menorAlvo: Math.round(Math.min(...alvos)),
      /* Groups are separated by a rule and by padding now, not by a gap, so
         measure the real distance: the space from the last row of one group to
         the first row of the next. */
      separacaoEntreGrupos: (() => {
        const cards = [...document.querySelectorAll('.rail-left .card')];
        if (cards.length < 2) return 0;
        const a = cards[1].getBoundingClientRect().top;
        const ultimaLinhaAcima = [...cards[0].children].at(-1)?.getBoundingClientRect().bottom ?? a;
        const primeiraLinhaAbaixo = cards[1].querySelector('.card-title')?.getBoundingClientRect().top ?? a;
        return Math.round(primeiraLinhaAbaixo - ultimaLinhaAcima);
      })(),
      gapEntreLinhas: parseFloat(getComputedStyle(document.querySelector('.filter-rows')).gap || '0'),
      temDivisoria: (() => {
        const segundo = document.querySelectorAll('.rail-left .card')[1];
        return segundo ? parseFloat(getComputedStyle(segundo).borderTopWidth) > 0 : false;
      })(),
      ritmo: +(linha / texto).toFixed(2),
      tituloPx: getComputedStyle(document.querySelector('.card-title')).fontSize,
      corpoPx: getComputedStyle(document.querySelector('.filter-label')).fontSize,
    };
  });

  // WCAG 2.5.8 puts the floor for any pointer target at 24x24 CSS pixels.
  check('todo alvo clicavel tem ao menos 24px', F.menorAlvo >= 24, `menor = ${F.menorAlvo}px`);

  // Gestalt proximity: the space between groups must beat the space within
  // them, or the groups stop reading as separate things. The rail carries that
  // separation as a hairline rule plus padding rather than as a gap.
  check('grupos se separam mais entre si do que suas linhas internas',
    F.separacaoEntreGrupos > F.gapEntreLinhas,
    `${F.separacaoEntreGrupos}px entre grupos vs ${F.gapEntreLinhas}px entre linhas`);
  check('os grupos tem uma divisoria visivel', F.temDivisoria);

  check('a linha respira ao menos 1.6x a altura do texto', F.ritmo >= 1.6, `razao ${F.ritmo}`);
  check('titulo e corpo mantem tamanhos distintos', F.tituloPx !== F.corpoPx);

  /* The point of the whole exercise: every card on screen at 1440x900, with
     nothing dropped to get there. */
  const { page: wide } = await open(1440, 900);
  const fits = await wide.evaluate(() => {
    const rail = document.querySelector('.rail-left');
    return { transborda: rail.scrollHeight - rail.clientHeight, cards: rail.querySelectorAll('.card').length };
  });
  check('os cinco cards cabem em 1440x900 sem rolagem',
    fits.transborda <= 0 && fits.cards === 5, `transborda ${fits.transborda}px, ${fits.cards} cards`);
  await wide.close();
  await page.close();
}

/* ==================================================== 4. RESPONSIVO ===== */
console.log('\n=== UI/UX: responsividade ===');
for (const [nome, w, h] of [['desktop', 1920, 1080], ['laptop', 1440, 900], ['tablet', 1024, 768], ['celular', 390, 844]]) {
  const { page, errors } = await open(w, h);
  const m = await page.evaluate(() => {
    const rail = document.querySelector('#rail-left');
    const btn = document.querySelector('#filters-toggle');
    return {
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      filtros: document.querySelectorAll('#filter-impact > *').length,
      botaoVisivel: (btn?.getBoundingClientRect().width ?? 0) > 0,
      railNaTela: (rail?.getBoundingClientRect().x ?? -999) > -50,
      eventos: document.querySelectorAll('.event-title').length,
    };
  });
  const filtrosAlcancaveis = m.railNaTela || m.botaoVisivel;
  check(`${nome} ${w}x${h}: sem overflow horizontal`, !m.overflowX);
  check(`${nome} ${w}x${h}: filtros alcancaveis`, filtrosAlcancaveis && m.filtros === 4);
  check(`${nome} ${w}x${h}: sem erro de JS`, errors.length === 0, errors[0]?.slice(0, 50));
  await page.close();
}

/* ===================================================== 5. IDIOMAS ======= */
console.log('\n=== UI: os tres idiomas ===');
{
  const { page } = await open();
  for (const lang of ['en', 'pt', 'es']) {
    await page.locator(`button[data-lang="${lang}"]`).click();
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => ({
      html: document.documentElement.lang,
      vazios: [...document.querySelectorAll('[data-i18n]')].filter((e) => !e.textContent.trim()).length,
      // In English a key and its translation legitimately coincide ('clear',
      // 'today'), so only a non-English match is evidence of a missing string.
      chaveCrua: document.documentElement.lang === 'en' ? 0
        : [...document.querySelectorAll('[data-i18n]')].filter((e) => e.textContent.trim() === e.dataset.i18n).length,
      titulo: document.title.length > 10,
    }));
    check(`${lang}: nenhuma string vazia ou chave crua na tela`, t.vazios === 0 && t.chaveCrua === 0 && t.titulo, JSON.stringify(t));
  }
  await page.close();
}

console.log(`\n${passes} passaram, ${fails} falharam\n`);
await browser.close();
shutdown();
process.exit(fails ? 1 : 0);
