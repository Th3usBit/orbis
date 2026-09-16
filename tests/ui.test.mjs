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
/* Which engine to drive. Chromium by default, so a bare run behaves as it
   always has; ORBIS_BROWSER picks another. The questions this suite asks are
   about CSS, the DOM and WebGL, and those are exactly where engines diverge:
   a globe that renders in Blink can come up blank in WebKit, and only running
   all three catches it. */
const ENGINE = process.env.ORBIS_BROWSER ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(ENGINE)) {
  console.error(`Unknown ORBIS_BROWSER "${ENGINE}" - use chromium, firefox or webkit.`);
  process.exit(2);
}

let launcher;
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
      ({ [ENGINE]: launcher } = await import(name));
      if (launcher) break;
    } catch { /* try the next one */ }
  }

  if (!launcher) {
    console.log('\n  SKIP  Playwright not found. To run this suite:');
    console.log(`        npx playwright@1 install ${ENGINE}`);
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

const browser = await launcher.launch();
console.log(`
  engine: ${ENGINE}`);

/* The whole suite is about a page whose shell only appears once the globe has
   a WebGL context, so a machine without one fails every check with the same
   30s timeout and a stack trace that says nothing about the cause.
   Headless Linux is exactly that machine for Firefox and WebKit: Chromium
   ships SwiftShader and falls back to it, the other two do not, so on a CI
   runner with no GPU they have no WebGL at all.
   That is a fact about the runner, not about the site -- the same WebKit on a
   real Mac runs all 98 checks -- so it prints and skips rather than failing,
   the way a missing Playwright already does. */
{
  const page = await browser.newPage();
  const temGl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  }).catch(() => false);
  await page.close();

  if (!temGl) {
    console.log(`
  SKIP  ${ENGINE} has no WebGL context on this machine, and every check here
        needs the globe to boot. On headless Linux only Chromium falls back to
        software rendering; Firefox and WebKit need a real GPU or an X server.
`);
    await browser.close();
    shutdown();
    process.exit(0);
  }
}

let fails = 0, passes = 0;

const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  ok ? passes++ : fails++;
};

const open = async (w = 1440, h = 900, tz = 'America/Sao_Paulo', reducedMotion = 'no-preference') => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, timezoneId: tz, reducedMotion });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 });
  /* The rail is laid out in a webfont that arrives after first paint, and the
     cards are sized by their text, so every height measured before the swap is
     a measurement of the fallback font. That is a real 7px of rail overflow
     appearing and disappearing between runs of the same build, on a layout
     that is genuinely within its budget once the font lands. Waiting for the
     fonts rather than for a duration removes the guess: a fixed timeout is a
     bet on how fast the machine is, and a loaded CI runner loses it. */
  await page.evaluate(() => document.fonts.ready).catch(() => {});
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

  /* The blue border says "this day" to anyone looking at it; a screen reader
     was handed twenty-nine identical buttons and no way to tell which one the
     list below belongs to. */
  const dia = await page.evaluate(() => {
    const marcados = document.querySelectorAll('.tl-day[aria-current]');
    return { n: marcados.length, valor: marcados[0]?.getAttribute('aria-current'),
      eOSelecionado: marcados[0]?.classList.contains('is-selected') };
  });
  check('o dia selecionado se anuncia com aria-current="date"',
    dia.n === 1 && dia.valor === 'date' && dia.eOSelecionado, JSON.stringify(dia));

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
      let fg = s.color.match(/\d+/g).slice(0, 3).map(Number);
      /* Partial opacity was the blind spot: `opacity: 0.7` on a span leaves
         getComputedStyle().color reporting the full-strength colour, so a
         3.42:1 value was being measured as 5.88:1 and passing. Opacity applies
         to the element as a whole, ancestors included, so walk up and
         composite every factor over the background actually behind it. */
      let alpha = 1;
      for (let q = el; q && q !== document.documentElement; q = q.parentElement) {
        const o = parseFloat(getComputedStyle(q).opacity);
        if (o < 1) alpha *= o;
      }
      if (alpha < 1) fg = over(`rgba(${fg.join(',')},${alpha})`, bg);
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

/* ========================================================= 4. TECLADO == */
console.log('\n=== UX: o teclado ===');
{
  const { page } = await open();

  /* ← → are a shortcut for the view, not a binding for whatever has focus.
     Listening on document meant arrowing off the language buttons changed the
     day, and Escape on a chip threw away the country panel being read. */
  const naoSequestra = async (seletor, tecla) => {
    await page.locator(seletor).first().focus();
    const antes = await page.evaluate(() => document.querySelector('#panel-title')?.textContent);
    await page.keyboard.press(tecla);
    await page.waitForTimeout(400);
    const depois = await page.evaluate(() => document.querySelector('#panel-title')?.textContent);
    return { ok: antes === depois, antes, depois };
  };

  for (const [nome, seletor] of [
    ['botao de idioma', '.lang button'],
    ['chip de categoria', '#filter-category button'],
    ['filtro de impacto', '#filter-impact button'],
  ]) {
    const r = await naoSequestra(seletor, 'ArrowRight');
    check(`seta num ${nome} nao muda o dia`, r.ok, `${r.antes} -> ${r.depois}`);
  }

  /* ...and still works where the day IS the subject. */
  await page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
  const diaAntes = await page.evaluate(() => document.querySelector('#panel-title')?.textContent);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  check('seta ainda muda o dia sem foco em controle',
    diaAntes !== await page.evaluate(() => document.querySelector('#panel-title')?.textContent));

  /* Escape unwinds the innermost thing that is open, from where the view has
     focus -- not the country selection from anywhere. */
  await page.locator('#next-event').click();
  await page.waitForTimeout(1200);
  const paisAntes = await page.evaluate(() => document.querySelector('#panel-title')?.textContent);
  await page.locator('#filter-category button').first().focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Escape num chip nao descarta o pais selecionado',
    paisAntes === await page.evaluate(() => document.querySelector('#panel-title')?.textContent));

  await page.locator('#event-list button.event').first().click();
  await page.waitForTimeout(500);
  const abertas = await page.evaluate(() => document.querySelectorAll('.event.is-open').length);
  await page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const depoisDeFechar = await page.evaluate(() => ({
    abertas: document.querySelectorAll('.event.is-open').length,
    titulo: document.querySelector('#panel-title')?.textContent,
  }));
  check('Escape fecha a linha aberta antes de largar o pais',
    abertas === 1 && depoisDeFechar.abertas === 0 && depoisDeFechar.titulo === paisAntes,
    JSON.stringify(depoisDeFechar));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('o Escape seguinte limpa a selecao',
    depoisDeFechar.titulo !== await page.evaluate(() => document.querySelector('#panel-title')?.textContent));

  /* The timeline is a date picker: one tab stop, arrows to walk it. The cells
     are rebuilt on every change, so focus has to be put back deliberately. */
  const roving = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.tl-day')];
    return { total: cells.length, naOrdem: cells.filter((c) => c.tabIndex === 0).length,
      eOSelecionado: cells.find((c) => c.tabIndex === 0)?.classList.contains('is-selected') };
  });
  check('a timeline custa um unico tab stop', roving.naOrdem === 1, `${roving.naOrdem} de ${roving.total}`);
  check('o tab stop e o dia selecionado', roving.eOSelecionado === true);

  await page.locator('.tl-day[tabindex="0"]').focus();
  const tlAntes = await page.evaluate(() => document.activeElement?.dataset.day);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  const tlDepois = await page.evaluate(() => ({
    dia: document.activeElement?.dataset.day,
    naTimeline: !!document.activeElement?.closest('#tl-track'),
    selecionado: document.activeElement?.classList.contains('is-selected'),
  }));
  check('a seta anda na timeline e o foco fica nela',
    tlDepois.naTimeline && tlDepois.selecionado && tlDepois.dia !== tlAntes, JSON.stringify(tlDepois));

  /* Exactly one day per press: the page-level shortcut must not fire too. */
  const dias = await page.evaluate(() => [...document.querySelectorAll('.tl-day')].map((c) => c.dataset.day));
  check('anda exatamente um dia por tecla',
    dias.indexOf(tlDepois.dia) - dias.indexOf(tlAntes) === 1,
    `${tlAntes} -> ${tlDepois.dia}`);

  await page.close();
}

/* ================================================ 3b. A LISTA =========== */
console.log('\n=== UX: a lista de eventos ===');
{
  const { page, errors } = await open();

  /* Go to the busiest day in the window: a one-event list asserts nothing
     about navigating a list, and which day is busy changes with the data. */
  const total = await page.evaluate(async () => {
    const cells = [...document.querySelectorAll('.tl-day')];
    let melhor = null;
    let maior = -1;
    for (const c of cells) {
      c.click();
      await new Promise((r) => { setTimeout(r, 70); });
      const n = parseInt(document.getElementById('panel-sub').textContent, 10) || 0;
      if (n > maior) { maior = n; melhor = c; }
    }
    melhor.click();
    await new Promise((r) => { setTimeout(r, 250); });
    return maior;
  });

  /* The whole day was being built on every render -- 226 rows on the busiest
     day to show the twelve that fit -- which is most of what a day change
     used to cost. The rows all still arrive; only *when* changed. */
  const inicial = await page.evaluate(() => document.querySelectorAll('#event-list .event').length);
  check('nao desenha o dia inteiro de uma vez', inicial < total || total <= 24,
    `${inicial} de ${total} linhas`);
  check('o subtitulo continua contando o dia inteiro', total > inicial || total <= 24,
    `${total} eventos`);

  /* ...and everything is reachable by scrolling, so Ctrl+F and the scrollbar
     still mean what they did. */
  await page.evaluate(async () => {
    const el = document.getElementById('event-list');
    for (let i = 0; i < 60; i += 1) {
      el.scrollTop = el.scrollHeight;
      await new Promise((r) => { setTimeout(r, 50); });
    }
  });
  const aposRolar = await page.evaluate(() => document.querySelectorAll('#event-list .event').length);
  check('rolando ate o fim chegam todas as linhas', aposRolar === total,
    `${aposRolar} de ${total}`);

  await page.close();
}

{
  const { page, errors } = await open();
  const total = await page.evaluate(async () => {
    const cells = [...document.querySelectorAll('.tl-day')];
    let melhor = null;
    let maior = -1;
    for (const c of cells) {
      c.click();
      await new Promise((r) => { setTimeout(r, 70); });
      const n = parseInt(document.getElementById('panel-sub').textContent, 10) || 0;
      if (n > maior) { maior = n; melhor = c; }
    }
    melhor.click();
    await new Promise((r) => { setTimeout(r, 250); });
    return maior;
  });

  /* The roving tabindex, at the scale that made it necessary: a busy day was
     one tab stop per event, so Tab could not get past the panel at all. */
  const stops = await page.evaluate(() => ({
    naLista: [...document.querySelectorAll('#event-list .event')].filter((e) => e.tabIndex === 0).length,
    container: document.getElementById('event-list').tabIndex,
  }));
  check('a lista inteira e um unico ponto de tabulacao', stops.naLista === 1, `${stops.naLista} stops`);
  /* The container carried tabindex="0" for the skip link; with a roving stop
     on the rows it would be a second stop in front of them. */
  check('o container da lista nao e um ponto de tabulacao a mais',
    stops.container === -1, `tabIndex=${stops.container}`);

  await page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
  let dentro = false;
  let tabs = 0;
  let saiu = false;
  for (let i = 0; i < 45; i += 1) {
    await page.keyboard.press('Tab');
    const na = await page.evaluate(() => !!document.activeElement.closest?.('#event-list'));
    if (na && !dentro) { dentro = true; tabs = 0; continue; }
    if (dentro) { tabs += 1; if (!na) { saiu = true; break; } }
  }
  check('um Tab basta para sair da lista', saiu && tabs === 1, `${tabs} tabs`);

  /* Arrows walk the rows; moving must not open anything, or reading down a
     list of 226 would expand 226 detail panels on the way past. */
  await page.evaluate(() => {
    const r = document.querySelector('#event-list .event');
    r.tabIndex = 0;
    r.focus();
  });
  const primeiro = await page.evaluate(() => document.activeElement.dataset.eventId);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const segundo = await page.evaluate(() => ({
    id: document.activeElement.dataset.eventId,
    naLista: !!document.activeElement.closest('#event-list'),
    abertas: document.querySelectorAll('.event-detail').length,
  }));
  check('a seta anda na lista e o foco fica nela',
    segundo.naLista && (total <= 1 || segundo.id !== primeiro), JSON.stringify(segundo));
  check('andar na lista nao abre o detalhe', segundo.abertas === 0, `${segundo.abertas} abertas`);

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  check('a seta contraria volta',
    await page.evaluate(() => document.activeElement.dataset.eventId) === primeiro);

  /* Enter is the button's own key and still opens -- and the row keeps focus,
     because the list is rebuilt underneath it when the detail appears. */
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const aberto = await page.evaluate(() => ({
    detalhes: document.querySelectorAll('.event-detail').length,
    expandido: document.activeElement.getAttribute('aria-expanded'),
    aindaNaLista: !!document.activeElement.closest('#event-list'),
  }));
  check('Enter abre o detalhe da linha', aberto.detalhes === 1, `${aberto.detalhes}`);
  check('aria-expanded acompanha a linha aberta', aberto.expandido === 'true', String(aberto.expandido));
  check('a linha mantem o foco depois de abrir', aberto.aindaNaLista);

  /* End means the end of the day, not the end of what happens to be drawn. */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('End');
  await page.waitForTimeout(600);
  const fim = await page.evaluate(() => {
    const linhas = [...document.querySelectorAll('#event-list .event')];
    return { desenhadas: linhas.length, naUltima: document.activeElement === linhas.at(-1) };
  });
  check('End desenha o resto do dia e vai para a ultima linha',
    fim.desenhadas === total && fim.naUltima, `${fim.desenhadas} de ${total}, naUltima=${fim.naUltima}`);

  /* ← → stay the day shortcut even from inside the list: a row is not a day. */
  await page.evaluate(() => { document.querySelector('#event-list .event').focus(); });
  const diaAntes = await page.evaluate(() => document.querySelector('#panel-title')?.textContent);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  check('a seta horizontal ainda muda o dia a partir da lista',
    diaAntes !== await page.evaluate(() => document.querySelector('#panel-title')?.textContent));

  check('sem erro de JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

{
  /* An empty list is not a listbox, and the arrows must not throw on one. */
  const { page, errors } = await open();
  /* Empty the list by crossing the two dimensions, because no single one can
     be emptied on its own: toggleFilter refuses to let a dimension go blank
     and switches the last row back on, deliberately -- an empty globe helps
     nobody. So narrowing impact to one value and region to one value leaves
     an intersection with nothing in it, which is the state this block is
     about, and reaches it the way a reader would.
     Clicking three `.filter-row` by index used to "work" only by accident:
     that selector also matches the region rows, impact has a fourth value
     (Feriado, impact 0) that no click could ever clear, and the list stayed
     non-empty the moment a holiday fell inside the window. Each toggle also
     calls replaceChildren() on its group, so the buttons are rebuilt between
     clicks and an index stops meaning what it meant -- hence clicking
     whatever is still pressed rather than a fixed position. */
  const linhasAgora = () =>
    page.locator('#event-list .event').count();

  /* Switch rows off one at a time and stop the moment the list is empty,
     rather than assuming some particular pair ends up empty. Which one does
     depends on the day's data -- regionOf() falls back to 'mea' for any
     unmapped country, so the region that happens to be left last can be empty
     this morning and hold a holiday tomorrow. Stopping on the measured state
     keeps the block about the empty list itself. */
  const esvaziar = async (grupo) => {
    for (let guarda = 0; guarda < 12; guarda += 1) {
      if (await linhasAgora() === 0) return true;
      const ligados = page.locator(`${grupo} > [aria-pressed="true"]`);
      if (await ligados.count() <= 1) return false;
      await ligados.first().click();
      await page.waitForTimeout(160);
    }
    return await linhasAgora() === 0;
  };
  await esvaziar('#filter-impact');
  const ficouVazia = await esvaziar('#filter-region');
  check('as duas dimensoes juntas conseguem esvaziar a lista', ficouVazia,
    `${await linhasAgora()} linhas restantes`);
  const vazio = await page.evaluate(() => {
    const h = document.getElementById('event-list');
    return { estadoVazio: !!h.querySelector('.panel-empty'), role: h.getAttribute('role') };
  });
  check('a lista vazia mostra o estado vazio', vazio.estadoVazio);
  check('a lista vazia deixa de ser um listbox', vazio.role === null, String(vazio.role));

  await page.evaluate(() => document.getElementById('event-list').focus());
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.waitForTimeout(250);

  await page.locator('#panel-reset').click();
  await page.waitForTimeout(600);
  const voltou = await page.evaluate(() => {
    const h = document.getElementById('event-list');
    return {
      role: h.getAttribute('role'),
      linhas: h.querySelectorAll('.event').length,
      stops: [...h.querySelectorAll('.event')].filter((e) => e.tabIndex === 0).length,
    };
  });
  check('limpar devolve a lista, o listbox e um unico stop',
    voltou.role === 'listbox' && voltou.linhas > 0 && voltou.stops === 1, JSON.stringify(voltou));
  check('sem erro de JS na lista vazia', errors.length === 0, errors.join(' | '));
  await page.close();
}

/* =============================================== 3c. REGIOES =========== */
console.log('\n=== A11Y: as regioes da pagina ===');
{
  /* A screen reader listing the regions was reading "complementary,
     complementary" -- nothing said which one held the filters and which one
     held the events the page exists to show. */
  const { page } = await open();
  const R = await page.evaluate(() => ({
    temMain: !!document.querySelector('main'),
    nomeDoMain: document.querySelector('main')?.getAttribute('aria-label') || null,
    navs: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label')),
    semNome: [...document.querySelectorAll('main, nav')].filter((e) => !e.getAttribute('aria-label')).length,
    listaRole: document.getElementById('event-list').getAttribute('role'),
    listaNome: document.getElementById('event-list').getAttribute('aria-label'),
  }));
  check('a lista de eventos e o <main> da pagina', R.temMain);
  check('o <main> tem nome', Boolean(R.nomeDoMain), String(R.nomeDoMain));
  check('os filtros e a timeline sao navegacoes nomeadas',
    R.navs.length === 2 && R.navs.every(Boolean), JSON.stringify(R.navs));
  /* Counting the unnamed only means something once the regions exist: with no
     <main> and no <nav> at all, "none unnamed" was trivially true. */
  check('nenhuma regiao fica sem nome', R.semNome === 0 && R.navs.length === 2,
    `${R.semNome} sem nome de ${R.navs.length + (R.temMain ? 1 : 0)} regioes`);
  check('a lista se anuncia como lista', R.listaRole === 'listbox', String(R.listaRole));
  check('a lista diz como percorre-la', Boolean(R.listaNome), String(R.listaNome).slice(0, 44));

  /* The skip link exists to reach the list; it now lands on a row, which is
     both a place to start reading and what the arrows then move. */
  await page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check('o atalho de pular cai numa linha da lista',
    await page.evaluate(() => !!document.activeElement.closest?.('#event-list')));
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

  /* Where the rail is a sheet over the globe it behaves like a dialog, and a
     dialog that opens without taking the keyboard leaves it on the button
     underneath. The sheet animates, and `visibility` animates with it, so the
     focus lands a few frames after the click rather than on it. */
  if (!m.railNaTela && m.botaoVisivel) {
    await page.locator('#filters-toggle').click();
    await page.waitForTimeout(900);
    const dentro = await page.evaluate(() => {
      const rail = document.querySelector('#rail-left');
      return { foco: rail.contains(document.activeElement), aberto: rail.classList.contains('is-open') };
    });
    check(`${nome} ${w}x${h}: abrir os filtros leva o foco para dentro`,
      dentro.aberto && dentro.foco, JSON.stringify(dentro));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check(`${nome} ${w}x${h}: Escape fecha e devolve o foco ao botao`,
      await page.evaluate(() => document.activeElement?.id === 'filters-toggle'
        && document.querySelector('#filters-toggle').getAttribute('aria-expanded') === 'false'));
  }

  await page.close();
}

/* ============================================== 5. SEM ANIMACAO ======== */
console.log('\n=== UX: com prefers-reduced-motion ===');
{
  /* The sheet still has to hand over the keyboard when nothing animates. The
     transition is 1ms here and the rail fires unrelated transitionend events
     of its own, so waiting on those missed the real one and the focus never
     moved -- a bug that only existed in this mode. */
  const { page, errors } = await open(900, 800, 'America/Sao_Paulo', 'reduce');
  await page.locator('#filters-toggle').click();
  await page.waitForTimeout(900);
  check('o foco entra no painel de filtros sem transicao',
    await page.evaluate(() => document.querySelector('#rail-left').contains(document.activeElement)),
    await page.evaluate(() => document.activeElement?.id || String(document.activeElement?.className).slice(0, 24)));
  check('sem erro de JS', errors.length === 0, errors[0]?.slice(0, 60));
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

/* ================================================= 9. BANDEIRAS ======== */
console.log('\n=== UI: as bandeiras dos paises ===');
{
  /* `flagOf` emits two regional indicators and leaves the font to join them
     into one flag. Windows never does: Segoe UI Emoji has carried no country
     flags since Windows 8, so Chrome and Edge there draw "JP Japão" and
     "CN" on the countdown card. Reproduced on Chrome 151 and Edge 153;
     Firefox is unaffected anywhere because it ships its own Twemoji.

     A composed flag is one glyph -- as wide as a single indicator, ratio 1.0.
     An uncomposed pair is two glyphs, ratio 1.94. Measured identical at 13px
     and 40px in both browsers, so 1.5 sits far from either case. */
  const { page, errors } = await open();

  const medir = () => page.evaluate(() => {
    const pilha = getComputedStyle(document.body).fontFamily;
    const c = document.createElement('canvas').getContext('2d');
    const w = (t) => { c.font = `40px ${pilha}`; return c.measureText(t).width; };
    const par = w('\u{1F1E7}\u{1F1F7}');
    const um = w('\u{1F1E7}');
    return {
      razao: um ? +(par / um).toFixed(3) : null,
      marcador: document.documentElement.dataset.flagFont || null,
      pilha: pilha.slice(0, 40),
    };
  });

  const m = await medir();
  /* The assertion is the same on every platform, which is the point: either
     the system composed the flags or the font was fetched and did it. */
  check('as bandeiras aparecem como um glifo, nao duas letras',
    m.razao !== null && m.razao < 1.5, `razao ${m.razao}, fonte ${m.marcador ?? 'nativa'}`);

  /* The font is 205KB and most visitors already have flags, so it must not be
     fetched where it changes nothing. Whichever branch this runner takes, the
     other half of the rule still holds. */
  const pedidos = [];
  page.on('request', (r) => {
    if (r.url().includes('noto-color-emoji')) pedidos.push(r.url());
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#shell:not([hidden])');
  await page.waitForTimeout(2500);
  const depois = await medir();

  if (depois.marcador === 'loaded') {
    check('a fonte so e pedida quando a plataforma precisa dela',
      pedidos.length === 1, `${pedidos.length} pedidos com a fonte carregada`);
    check('a fonte entra na frente da pilha, sem substitui-la',
      depois.pilha.includes('orbis flags') && depois.pilha.includes('Inter'), depois.pilha);
  } else {
    check('nenhum byte de fonte onde as bandeiras ja funcionam',
      pedidos.length === 0, `${pedidos.length} pedidos sem precisar`);
    check('a pilha de fontes fica intacta',
      !depois.pilha.includes('orbis flags'), depois.pilha);
  }

  check('sem erro de JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

{
  /* The detection measures text on a 2D canvas. Where that is unavailable --
     a hardened browser, a privacy extension that poisons canvas -- the page
     must carry on with whatever the platform draws, not fail to boot. */
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      if (tipo === '2d') throw new Error('canvas 2d indisponivel');
      return original.call(this, tipo, ...resto);
    };
  });
  await page.goto(URL, { waitUntil: 'load' });
  const subiu = await page.waitForSelector('#shell:not([hidden])', { timeout: 40000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(1500);
  const linhas = await page.evaluate(() => document.querySelectorAll('#event-list .event').length);
  check('a pagina sobe sem canvas 2d', subiu && linhas > 0, `subiu=${subiu}, ${linhas} linhas`);
  check('e sem erro de JS', erros.length === 0, erros.join(' | '));
  await page.close();
}

/* ================================ 9. ORCAMENTO DE PERFORMANCE ========= */

/* "Alta performance" so vale como promessa se alguma coisa falhar quando ela
   for quebrada. Tudo aqui e medido contando chamadas de desenho reais na GL:
   e o unico numero que nao depende da velocidade da maquina que roda o teste,
   ao contrario de fps ou de tempo de quadro, que variam demais num runner
   compartilhado para servirem de limite.

   O relogio e fixado antes de abrir a pagina, e isso nao e detalhe: os aneis
   pulsam nos eventos de impacto >= 2 que caem na proxima hora, e um pulso vivo
   mantem o loop acordado de propósito. Medir repouso na hora corrente torna o
   resultado uma funcao de que horas sao -- a mesma build leu 63 draw calls de
   manha e 540 a tarde, as duas corretas. A ancora e calculada a partir do
   proprio calendario, e nao escrita a mao, porque o CI recoleta os dados a
   cada run e uma data fixa envelheceria na primeira semana. */
{
  /* Uma hora dentro da janela publicada em que nada de impacto >= 2 acontece
     na hora seguinte -- o unico estado em que "repouso" quer dizer repouso. */
  const quieto = await (async () => {
    const dados = await fetch(`${URL}data/calendar.json`).then((r) => r.json());
    const horas = dados.events
      .filter((e) => (e.impact ?? 0) >= 2)
      .map((e) => Date.parse(e.ts))
      .sort((a, b) => a - b);
    const inicio = Date.parse(dados.window.from);
    const UMA_HORA = 3600_000;
    /* Antes do primeiro evento de impacto ja e uma janela silenciosa, e e a
       que existe em qualquer dataset. Senao, o primeiro vao maior que 2h. */
    if (horas.length === 0 || horas[0] - inicio > 2 * UMA_HORA) return inicio + UMA_HORA;
    for (let i = 0; i < horas.length - 1; i++) {
      if (horas[i + 1] - horas[i] > 3 * UMA_HORA) return horas[i] + UMA_HORA;
    }
    return inicio + UMA_HORA;
  })();

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.setSystemTime(new Date(quieto));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 });

  /* A entrada do globo dura ~1.9s e o damping continua depois dela; so vale
     medir repouso quando tudo isso acabou. */
  await page.waitForTimeout(9000);

  await page.evaluate(() => {
    const canvas = document.getElementById('stage');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    window.__draws = 0;
    for (const metodo of ['drawElements', 'drawArrays', 'drawElementsInstanced']) {
      if (!gl[metodo]) continue;
      const original = gl[metodo].bind(gl);
      gl[metodo] = (...args) => { window.__draws++; return original(...args); };
    }
  });

  const medir = async (ms) => {
    await page.evaluate(() => { window.__draws = 0; });
    await page.waitForTimeout(ms);
    return page.evaluate(() => window.__draws);
  };

  /* Em repouso o globo desenha um quadro identico ao anterior. A 60fps por 3s
     seriam ~1260 chamadas (7 por quadro); o teto abaixo e varias vezes o que o
     render sob demanda produz e ainda bem abaixo de um loop que nunca dorme,
     entao pega a regressao sem depender da maquina. */
  const repouso = await medir(3000);
  check('em repouso o globo nao redesenha a 60fps', repouso < 300,
    `${repouso} draw calls em 3s`);

  /* O outro lado do mesmo contrato: dormir e facil, acordar e o que importa.
     Um globo que nao responde ao arrasto tambem passaria no teste acima.

     O piso mede se o loop acordou, nao quanto trabalho ele fez. A cena gasta
     ~7 draw calls por quadro, entao qualquer coisa acima de 20 ja e mais de um
     punhado de quadros desenhados durante o arrasto, e um globo que ficou
     dormindo le zero -- que e a regressao que este check existe para pegar.
     Um piso alto demais mede a GPU do runner e nao o codigo: com GL por
     software o WebKit do CI fez 72 onde uma maquina com placa faz 540, e as
     duas estao igualmente corretas. */
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.evaluate(() => { window.__draws = 0; });
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(700 + i * 6, 400);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const arrasto = await page.evaluate(() => window.__draws);
  check('arrastar o globo acorda o loop', arrasto > 20, `${arrasto} draw calls`);

  /* Trocar de dia move o sol de verdade, e o terminador precisa animar ate a
     nova posicao -- exatamente o caso que um setDate com limiar mal escolhido
     mataria em silencio. */
  await page.waitForTimeout(3500);
  await page.locator('.tl-day').nth(6).click();
  await page.evaluate(() => { window.__draws = 0; });
  await page.waitForTimeout(1500);
  const scrub = await page.evaluate(() => window.__draws);
  check('trocar de dia redesenha o terminador', scrub > 20, `${scrub} draw calls`);

  /* E volta a dormir depois. */
  await page.waitForTimeout(3500);
  const voltou = await medir(3000);
  check('e volta ao repouso depois', voltou < 300, `${voltou} draw calls em 3s`);

  await page.close();
}

/* ================================ 10. CONTEXTO WEBGL PERDIDO ========== */

/* Um contexto WebGL nao dura necessariamente o que dura a pagina: um reset de
   GPU (rotina no Windows, onde o watchdog do driver reinicia um adaptador
   travado), um notebook voltando do sleep, ou o navegador recuperando memoria
   de uma aba em segundo plano levam o contexto embora. Sem tratamento o canvas
   congela no ultimo quadro e todo desenho posterior nao faz nada -- em
   silencio. WEBGL_lose_context simula exatamente isso. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(3000);

  const suportado = await page.evaluate(() => {
    const canvas = document.getElementById('stage');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    window.__ext = gl.getExtension('WEBGL_lose_context');
    window.__perdeu = false;
    window.__voltou = false;
    canvas.addEventListener('webglcontextlost', () => { window.__perdeu = true; });
    canvas.addEventListener('webglcontextrestored', () => { window.__voltou = true; });
    return !!window.__ext;
  });

  if (!suportado) {
    /* Sem a extensao nao da para provocar a perda; nao e uma falha do site. */
    check('perda de contexto: extensao disponivel para testar', true, 'SKIP');
  } else {
    /* preventDefault no evento e o que faz o navegador prometer a restauracao.
       Sem ele webglcontextrestored nunca dispara e o congelamento e definitivo,
       entao este check separa "tratado" de "tratado pela metade". Medido antes
       de perder o contexto de verdade, com um evento sintetico. */
    const cancelado = await page.evaluate(() => {
      const canvas = document.getElementById('stage');
      const teste = new Event('webglcontextlost', { cancelable: true });
      return !canvas.dispatchEvent(teste);
    });
    check('a perda e cancelada, para o navegador restaurar', cancelado);

    await page.evaluate(() => window.__ext.loseContext());
    await page.waitForTimeout(800);
    check('a perda de contexto WebGL e percebida',
      await page.evaluate(() => window.__perdeu));

    /* Contar os desenhos ao longo da propria restauracao, e nao depois dela.
       O render sob demanda faz o globo voltar a dormir assim que a cena esta
       correta, entao medir 1.5s mais tarde -- com um pointermove que nao move
       camera nenhuma -- le zero num globo perfeitamente saudavel. A janela que
       importa e a da retomada: se o loop nao voltou, ela e que fica em zero.
       O hook tem de ser posto antes de perder o contexto, porque os metodos
       instrumentados precisam sobreviver ao ciclo. */
    const desenhando = await page.evaluate(async () => {
      window.__n = 0;
      const canvas = document.getElementById('stage');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      for (const metodo of ['drawElements', 'drawArrays', 'drawElementsInstanced']) {
        if (!gl[metodo]) continue;
        const original = gl[metodo].bind(gl);
        gl[metodo] = (...args) => { window.__n++; return original(...args); };
      }
      window.__ext.restoreContext();
      await new Promise((r) => setTimeout(r, 3000));
      return window.__n;
    });
    check('o contexto e restaurado', await page.evaluate(() => window.__voltou));
    check('o globo volta a desenhar depois da restauracao', desenhando > 0,
      `${desenhando} draw calls durante a retomada`);
    check('e sem erro de JS', erros.length === 0, erros.join(' | '));
  }
  await page.close();
}

/* ================================ 11. TIMERS EM SEGUNDO PLANO ========= */

/* Um relogio que ninguem pode ver nao precisa bater. O navegador limita os
   timers de uma aba escondida, mas limitar nao e parar: antes disso o timer de
   um segundo continuava escrevendo no DOM e empurrando um vetor de sol novo no
   globo, para sempre, atras do que a pessoa estava realmente olhando. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(2500);

  /* O que o codigo le e document.hidden, e nenhuma API do Playwright esconde
     a aba de verdade -- sobrepor a propriedade e disparar o evento e o que
     reproduz o estado que o navegador criaria. */
  const esconder = (valor) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => valor });
    Object.defineProperty(document, 'visibilityState',
      { configurable: true, get: () => (valor ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  /* A leitura de referencia vem DEPOIS de esconder, nao antes. Lida antes, ela
     abre uma janela de ate um segundo em que o tick ja agendado ainda dispara
     -- legitimamente, porque ele foi marcado enquanto a aba estava visivel --
     e o relogio avanca uma vez antes de parar. O teste lia isso como "nao
     parou" e falhava num comportamento correto, dependendo de onde o segundo
     caia: verde no PR, vermelho na main vinte minutos depois. O que importa e
     que nao avance mais depois de escondido, entao a medida e essa. */
  await page.evaluate(esconder, true);
  await page.waitForTimeout(1200);
  const escondido = await page.evaluate(() => document.getElementById('clock').textContent);
  await page.waitForTimeout(3000);
  const aindaEscondido = await page.evaluate(() => document.getElementById('clock').textContent);
  check('com a aba escondida o relogio para', escondido === aindaEscondido,
    `${escondido} -> ${aindaEscondido}`);

  /* E o ponto todo: voltar tem de alcancar o tempo perdido na hora, nao um
     minuto depois. A aba ficou escondida uns 4s, entao o relogio tem de dar um
     salto de varios segundos de uma vez -- e nao apenas ser diferente, que um
     unico tick normal tambem satisfaria. Comparar com o relogio de verdade e o
     que separa "voltou a andar" de "voltou a andar do lugar certo". */
  await page.evaluate(esconder, false);
  await page.waitForTimeout(500);
  const voltando = await page.evaluate(() => document.getElementById('clock').textContent);
  const emSegundos = (hms) => {
    const [h, m, sec] = hms.split(':').map(Number);
    return h * 3600 + m * 60 + sec;
  };
  /* +24h antes do resto para o caso de a medida cair sobre a meia-noite UTC,
     onde a subtracao crua daria -86397 e reprovaria uma passagem correta. */
  const DIA = 86400;
  const salto = (emSegundos(voltando) - emSegundos(aindaEscondido) + DIA) % DIA;
  check('e volta a bater assim que a aba reaparece', salto >= 3,
    `${aindaEscondido} -> ${voltando} (${salto}s)`);
  await page.close();
}

/* ============================================ 10. O PAINEL QUE ROLA ===== */
console.log('\n=== UI: o painel diz quando ha mais abaixo ===');
{
  /* The left rail is 139px taller than its box at 1366x768 -- the commonest
     laptop screen there is -- and the scrollbar cannot be what says so. Where
     the OS draws overlay scrollbars the bar takes no layout width at all and
     ::-webkit-scrollbar is ignored outright (measured: a probe div with an
     explicit 9px rule still reported 0px), and it fades out a second after the
     wheel stops. The fade at the fold is drawn by the panel itself. */
  const { page, errors } = await open(1366, 768);

  const estado = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    const cs = getComputedStyle(el);
    return {
      corta: el.scrollHeight - el.clientHeight,
      gradiente: /linear-gradient/.test(cs.backgroundImage),
      // `local` is the whole mechanism: the layer scrolls with the content, so
      // it sits off-screen until there is something below the fold and slides
      // away again at the end. No scroll listener, no class to keep in sync.
      ancoragem: cs.backgroundAttachment,
    };
  }, sel);

  const rail = await estado('#rail-left');
  check('o rail transborda nesta altura', rail.corta > 0, `${rail.corta}px abaixo da dobra`);
  check('o rail marca a dobra', rail.gradiente && rail.ancoragem.includes('local'),
    `gradiente ${rail.gradiente}, ancoragem ${rail.ancoragem}`);

  const lista = await estado('#event-list');
  check('a lista de eventos marca a dobra', lista.gradiente && lista.ancoragem.includes('local'),
    `gradiente ${lista.gradiente}, ancoragem ${lista.ancoragem}`);

  /* The categories group shrinks to give the column a few pixels back, and
     min-height:0 let it shrink past its own content: at 1366x768 it was handed
     66px for 135px of chips and, since the overflow is visible, four of the
     fourteen carried on drawing 57px down over the sources list. Measured in
     all five engines. */
  const chips = await page.evaluate(() => {
    const grupo = document.querySelector('.card-scroll');
    const cards = [...document.querySelectorAll('.rail-left .card')];
    const proximo = cards[cards.indexOf(grupo) + 1];
    const todas = [...grupo.querySelectorAll('.chip')];
    const gb = grupo.getBoundingClientRect();
    const pb = proximo?.getBoundingClientRect();
    const ultima = todas.at(-1)?.getBoundingClientRect();
    return {
      total: todas.length,
      dentro: todas.filter((c) => c.getBoundingClientRect().bottom <= gb.bottom + 1).length,
      invade: ultima && pb ? Math.max(0, Math.round(ultima.bottom - pb.top)) : 0,
    };
  });
  check('nenhuma chip escapa do proprio grupo', chips.dentro === chips.total,
    `${chips.dentro} de ${chips.total} dentro`);
  check('as chips nao desenham sobre o grupo seguinte', chips.invade === 0, `${chips.invade}px por cima`);

  check('sem erro de JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

/* ============================================= 11. OS FILTROS FICAM ==== */
console.log('\n=== UX: os filtros sobrevivem a um reload ===');
{
  /* The address bar carries the day and the country and deliberately not the
     filters: a link is a place in the calendar, and one arriving with somebody
     else's switched-off categories opens on a screen the sender never saw.
     That argument is about sharing, and it was also costing you your own
     filters on an ordinary F5. Local storage keeps both: the state survives a
     reload and still cannot travel in a link. */
  const { page, errors } = await open();

  await page.locator('#filter-impact button').first().click();
  await page.waitForTimeout(500);
  const antes = await page.evaluate(() => ({
    pressionados: [...document.querySelectorAll('#filter-impact [aria-pressed]')]
      .map((b) => b.getAttribute('aria-pressed')).join(','),
    badge: document.getElementById('filters-badge').textContent,
    url: location.search,
  }));
  check('o filtro nao entra na URL',
    !/impact|region|category/.test(antes.url), antes.url);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#shell:not([hidden])');
  await page.waitForTimeout(2500);
  const depois = await page.evaluate(() => ({
    pressionados: [...document.querySelectorAll('#filter-impact [aria-pressed]')]
      .map((b) => b.getAttribute('aria-pressed')).join(','),
    badge: document.getElementById('filters-badge').textContent,
    escondido: document.getElementById('filters-badge').hidden,
  }));
  check('o filtro continua la depois do reload',
    depois.pressionados === antes.pressionados, `${antes.pressionados} -> ${depois.pressionados}`);
  check('e o contador no botao concorda',
    depois.badge === antes.badge && !depois.escondido, `badge ${depois.badge}`);

  /* Clearing is a state too: it has to survive, or the next reload brings back
     what the reader just dismissed. */
  await page.locator('#panel-reset').click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#shell:not([hidden])');
  await page.waitForTimeout(2500);
  const limpo = await page.evaluate(() => ({
    escondido: document.getElementById('filters-badge').hidden,
    todos: [...document.querySelectorAll('#filter-impact [aria-pressed]')]
      .every((b) => b.getAttribute('aria-pressed') === 'true'),
  }));
  check('limpar tambem sobrevive', limpo.escondido && limpo.todos, JSON.stringify(limpo));

  check('sem erro de JS', errors.length === 0, errors.join(' | '));
  await page.close();
}

{
  /* localStorage is user-writable and outlives the code that wrote it: it can
     hold a set from a build with different impact levels, a hand-edited
     string, or garbage. Every one of these must land on the default view
     rather than on an empty or broken screen. */
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 });

  for (const lixo of [
    '{"impact":[]}',                              // um set vazio e uma tela vazia
    '{"impact":"nao-e-um-array"}',
    'isto nao e json',
    '{"impact":[99,"x"],"region":["inexistente"]}',
    '{}',
  ]) {
    await page.evaluate((v) => localStorage.setItem('orbis.filters', v), lixo);
    await page.reload({ waitUntil: 'load' });
    const subiu = await page.waitForSelector('#shell:not([hidden])', { timeout: 30000 })
      .then(() => true).catch(() => false);
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => ({
      linhas: document.querySelectorAll('#event-list .event').length,
      impactosLigados: document.querySelectorAll('#filter-impact [aria-pressed="true"]').length,
    }));
    check(`sobrevive a ${lixo.slice(0, 30)}`,
      subiu && r.linhas > 0 && r.impactosLigados > 0, JSON.stringify(r));
  }

  await page.evaluate(() => localStorage.removeItem('orbis.filters'));
  check('sem erro de JS com o storage corrompido', erros.length === 0, erros.join(' | '));
  await page.close();
}

/* ============================================ 9. O globo cabe na tela ===== */
console.log('\n=== UI: o planeta inteiro cabe, em qualquer tela ===');
{
  /* A distancia da camera era um numero fixo, e numero fixo nao existe que
     sirva a um laptop de 768px e a um monitor de 1440p ao mesmo tempo: o que
     estava ali cortava os polos em todo tamanho de desktop que medimos. Agora
     ela e calculada, entao o que este teste protege e a conta -- em varias
     telas, porque o proximo a mexer aqui vai ter apenas uma. */
  const telas = [
    ['1919x1079', 1919, 1079],   // a tela que reportou o corte
    ['1366x768', 1366, 768],     // o laptop mais apertado que vale suportar
    ['2560x1440', 2560, 1440],
    ['1280x720', 1280, 720],
  ];

  for (const [nome, w, h] of telas) {
    const { page, errors } = await open(w, h);
    /* Esperar o voo de entrada pousar: ele leva 1.9s e so depois a camera esta
       na distancia final. */
    await page.waitForTimeout(2600);

    /* Le a distancia em que a camera de fato parou -- nao a formula recalculada
       aqui, que so provaria que ela e igual a si mesma. */
    const m = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      const caixa = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        if (b.left > r.width || b.right < 0) return null;   // gaveta fechada
        return { esq: b.left, dir: b.right, topo: b.top, base: b.bottom, w: b.width, h: b.height };
      };
      return {
        canvas: { w: r.width, h: r.height },
        railL: caixa('.rail-left'), railR: caixa('.rail-right'),
        top: caixa('.topbar'), time: caixa('.timeline'),
        distancia: window.__orbisGlobe?.cameraDistance ?? null,
      };
    });

    check(`${nome}: a distancia da camera e legivel`, typeof m.distancia === 'number', String(m.distancia));

    /* Uma esfera de raio 1 a distancia d ocupa, em pixels de altura de canvas,
       (h/2) / (d * tan(fov/2)). O fov de 36 e do modulo e nao muda com a tela. */
    const FOV = 36;
    const meioFov = Math.tan((FOV * Math.PI / 180) / 2);
    const utilW = Math.max(240, m.canvas.w - (m.railL?.w ?? 0) - (m.railR?.w ?? 0));
    const utilH = Math.max(240, m.canvas.h - (m.top?.h ?? 0) - (m.time?.h ?? 0));
    const d = m.distancia ?? 0;

    const raioPx = (m.canvas.h / 2) / (d * meioFov);
    const cx = m.canvas.w / 2, cy = m.canvas.h / 2;
    const folga = {
      topo: (cy - raioPx) - (m.top?.base ?? 0),
      base: (m.time?.topo ?? m.canvas.h) - (cy + raioPx),
      esq: (cx - raioPx) - (m.railL?.dir ?? 0),
      dir: (m.railR?.esq ?? m.canvas.w) - (cx + raioPx),
    };

    /* Exigir uma folga real, nao apenas ausencia de sobreposicao: encostar na
       timeline por 0px passa num teste de "v < 0" e ainda assim le como
       cortado, e basta a barra crescer um pixel para passar a cortar mesmo. */
    const MIN_FOLGA = 12;
    const invade = Object.entries(folga).filter(([, v]) => v < MIN_FOLGA);
    check(`${nome}: o globo mantem folga de ${MIN_FOLGA}px das bordas e rails`,
      invade.length === 0,
      invade.map(([k, v]) => `${k} ${Math.round(v)}px`).join(', '));
    /* E o contrario tambem importa: um globo minusculo tecnicamente "cabe". */
    check(`${nome}: e ainda ocupa a area livre`,
      raioPx * 2 > Math.min(utilW, utilH) * 0.72,
      `diametro ${Math.round(raioPx * 2)}px em area util ${Math.round(utilW)}x${Math.round(utilH)}`);
    check(`${nome}: sem erro de JS`, errors.length === 0, errors.join(' | '));
    await page.close();
  }

  /* Telas estreitas nao tentam encaixar o planeta: ali a rail empilha embaixo e
     a faixa que sobra tem poucas centenas de pixels, entao caber inteiro pediria
     uma distancia de ~10 e o globo viraria uma bolinha no topo. O que este teste
     protege e que a distancia continue numa faixa em que se ve a curvatura --
     nem colado, nem longe demais. */
  for (const [nome, w, h] of [['telefone 390x844', 390, 844], ['tablet 820x1180', 820, 1180]]) {
    const { page, errors } = await open(w, h);
    await page.waitForTimeout(2600);
    const d = await page.evaluate(() => window.__orbisGlobe?.cameraDistance ?? 0);
    check(`${nome}: o globo fica a uma distancia legivel`, d >= 4.0 && d <= 5.2, `d=${d.toFixed(2)}`);
    check(`${nome}: sem erro de JS`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
}

console.log(`\n${passes} passaram, ${fails} falharam\n`);
await browser.close();
shutdown();
process.exit(fails ? 1 : 0);
