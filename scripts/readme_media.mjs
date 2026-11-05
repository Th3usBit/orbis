/**
 * Os clipes animados do README, gravados da página real.
 *
 * O README é o primeiro lugar onde alguém vê o orbis, e um produto cujo
 * argumento inteiro é a aparência não pode ser apresentado com prints feitos
 * à mão: eles envelhecem no dia em que o design muda e mostram um calendário
 * que já passou. Este script abre o site de verdade, com o calendar.json que
 * o deploy acabou de coletar, e grava cada interação como um WebP animado.
 * Nada é encenado -- o dia é hoje, os eventos são os de hoje, o lado aceso do
 * planeta é onde o sol está agora.
 *
 *     node scripts/readme_media.mjs <raiz do repo> [pasta de saída]
 *
 * Exige Playwright (Chromium) e ffmpeg, as duas coisas como ferramentas de CI
 * que nunca entram no repositório -- igual a tests/ui.test.mjs e
 * scripts/social_card.mjs. Sem elas, sai com 0 e um aviso: um README sem
 * vídeo não pode derrubar o deploy de um site que funciona sem ele.
 *
 * Nem recordVideo nem screencast: os dois gravam no relógio real, e sem GPU
 * o globo desenha a ~3 quadros por segundo. A filmagem é quadro a quadro em
 * relógio controlado -- ver film() abaixo.
 */

import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';

const ROOT = path.resolve(process.argv[2] ?? '.');
const OUT = path.resolve(process.argv[3] ?? path.join(ROOT, 'assets', 'readme'));
const PORT = Number(process.env.ORBIS_PORT ?? 8352);
const SITE = process.env.ORBIS_SITE ?? `http://127.0.0.1:${PORT}/`;
const ONLY = (process.env.ORBIS_CLIPS ?? '').split(',').filter(Boolean);

/* A coluna do README tem ~880 px no desktop. Cada clipe é filmado a 2x e
   recortado no recurso que mostra -- a primeira versão filmava a tela inteira
   e encolhia, e nenhum texto dava para ler. */
const FPS = 15;

// --- ferramentas -----------------------------------------------------------

let chromium;
{
  const candidates = [];
  if (process.env.PLAYWRIGHT_PATH) {
    const given = process.env.PLAYWRIGHT_PATH;
    if (!given.startsWith('file:') && /[\\/]/.test(given)) candidates.push(pathToFileURL(given).href);
    candidates.push(given);
  }
  candidates.push('playwright');
  for (const name of candidates) {
    try {
      ({ chromium } = await import(name));
      if (chromium) break;
    } catch { /* tenta o próximo */ }
  }
}
if (!chromium) {
  console.log('  SKIP  Playwright não encontrado; os clipes do README ficam como estão.');
  process.exit(0);
}
if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.log('  SKIP  ffmpeg não encontrado; os clipes do README ficam como estão.');
  process.exit(0);
}

// --- servidor --------------------------------------------------------------

const up = async () => fetch(SITE).then((r) => r.ok).catch(() => false);
let server = null;
if (!(await up())) {
  server = spawn(process.platform === 'win32' ? 'python' : 'python3',
    ['scripts/serve.py', '--no-browser', '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up()); i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 250); });
  }
}
const shutdown = () => { try { server?.kill(); } catch { /* já saiu */ } };
process.on('exit', shutdown);

// --- gravação --------------------------------------------------------------

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const STEP = 1000 / FPS;

/**
 * Um cursor que dá para ver. O Chromium headless não desenha o ponteiro, e
 * um clipe em que o painel muda sozinho não mostra que alguém clicou. É só
 * uma camada visual: o clique continua sendo o page.mouse do Playwright, no
 * mesmo ponto. Posicionado quadro a quadro pelo filme, nunca por transição
 * CSS, porque transições correm no relógio real e o filme não.
 */
const CURSOR = `
  (() => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:99999;' +
      'pointer-events:none;transform:translate(-200px,-200px)';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8-6 1.6L8 18z" ' +
      'fill="#f4f7fc" stroke="#05070c" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const r = document.createElement('div');
    r.id = '__ripple';
    r.style.cssText = 'position:fixed;left:0;top:0;width:46px;height:46px;border-radius:50%;' +
      'border:2px solid #4da3ff;pointer-events:none;z-index:99998;opacity:0';
    document.body.appendChild(r);
  })();
`;

/**
 * Filmagem quadro a quadro, em relógio controlado.
 *
 * O primeiro teste usou o screencast do DevTools e saiu a ~3 quadros por
 * segundo: sem GPU, o SwiftShader leva centenas de milissegundos para
 * desenhar o globo, e o vídeo herdava esse engasgo. Aqui o relógio da página
 * (Date, performance.now, requestAnimationFrame) é do Playwright: o filme
 * avança exatamente 1/FPS de segundo, espera a página desenhar e tira a foto.
 * O resultado tem o mesmo ritmo numa máquina lenta e numa rápida, e o
 * movimento é o que a página faria a 15 quadros por segundo.
 *
 * Nada muda nos dados: o relógio começa em "agora", então o dia, o
 * terminador e a contagem regressiva são os de verdade.
 */
function film(page, dir = null, clip = undefined) {
  let n = 0;
  let cursor = { x: -200, y: -200 };

  async function shot() {
    if (!dir) return;  // aquecimento: a página anda, ninguém fotografa
    const file = path.join(dir, `${String(n).padStart(5, '0')}.jpg`);
    n += 1;
    await page.screenshot({ path: file, type: 'jpeg', quality: 90, animations: 'allow', clip, timeout: 120000 });
  }

  async function tick() {
    // runFor dispara os rAF falsos; page.screenshot espera o compositor
    // pintar um quadro novo, então a foto já sai com o resultado. Esperar
    // aqui com setTimeout ou rAF da página travaria: os dois são do relógio
    // falso, e ele está parado.
    await page.clock.runFor(STEP);
    await shot();
  }

  async function place(x, y, ripple = null) {
    await page.evaluate(([px, py, rp]) => {
      document.getElementById('__cursor').style.transform = `translate(${px - 3}px,${py - 2}px)`;
      const r = document.getElementById('__ripple');
      if (rp === null) { r.style.opacity = '0'; return; }
      r.style.opacity = String(0.9 * (1 - rp));
      r.style.transform = `translate(${px - 23}px,${py - 23}px) scale(${0.2 + 0.8 * rp})`;
    }, [x, y, ripple]);
  }

  return {
    get frames() { return n; },

    async hold(ms) {
      for (let i = 0; i < Math.round(ms / STEP); i += 1) await tick();
    },

    async moveTo(x, y, ms = 650) {
      const from = { ...cursor };
      const steps = Math.max(1, Math.round(ms / STEP));
      for (let i = 1; i <= steps; i += 1) {
        const k = i / steps;
        const e = 1 - (1 - k) ** 3;
        const px = from.x < -100 ? x : from.x + (x - from.x) * e;
        const py = from.y < -100 ? y + 60 * (1 - e) : from.y + (y - from.y) * e;
        await place(px, py);
        await page.mouse.move(px, py);
        await tick();
      }
      cursor = { x, y };
    },

    async click(selector, nth = 0) {
      const box = await page.locator(selector).nth(nth).boundingBox();
      if (!box) throw new Error(`sem caixa para ${selector}`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await this.moveTo(x, y);
      await page.mouse.click(x, y);
      for (let i = 1; i <= 8; i += 1) {
        await place(x, y, i / 8);
        await tick();
      }
      await place(x, y, null);
    },

    /* Arrasta de um ponto a outro, como uma mão girando o globo. */
    async drag(x1, y1, x2, y2, ms = 1400) {
      await this.moveTo(x1, y1);
      await page.mouse.down();
      const steps = Math.max(1, Math.round(ms / STEP));
      for (let i = 1; i <= steps; i += 1) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const px = x1 + (x2 - x1) * e;
        const py = y1 + (y2 - y1) * e;
        await place(px, py);
        await page.mouse.move(px, py);
        await tick();
      }
      await page.mouse.up();
      cursor = { x: x2, y: y2 };
    },

    /* Tira o ponteiro de cima da página. */
    async leave() {
      await page.mouse.move(2, 2);
      await place(-200, -200);
      cursor = { x: -200, y: -200 };
    },
  };
}

/** Quadros em disco → WebP animado. */
async function encode(name, dir, width, quality = 60) {
  const out = path.join(OUT, `${name}.webp`);
  const run = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'),
    '-vf', `scale=${width}:-2:flags=lanczos`,
    '-c:v', 'libwebp_anim', '-quality', String(quality), '-compression_level', '6',
    '-loop', '0', '-an', out,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (run.status !== 0) throw new Error(`${name}: ffmpeg saiu com ${run.status}`);
  const { size } = await stat(out);
  console.log(`  wrote ${path.relative(ROOT, out)} (${(size / 1024).toFixed(0)} KB)`);
}

// --- a página --------------------------------------------------------------

const browser = await chromium.launch({
  // WebGL num runner sem GPU: o SwiftShader do próprio Chromium.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open({ width = 1280, height = 720, query = '', mobile = false, hide = '' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    // UTC é o relógio do próprio orbis; pt-BR é o idioma do README. A página
    // escolhe o idioma pelo navegador, então isto é o que um visitante
    // brasileiro veria -- sem forçar nada por dentro.
    timezoneId: 'UTC',
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  // O relógio falso começa em agora e corre normalmente durante o boot;
  // só para quando o filme começa a contar quadros.
  await page.clock.install({ time: new Date() });
  await page.goto(`${SITE}${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#shell:not([hidden])', { timeout: 90000 });
  await page.evaluate(() => document.getElementById('hint')?.remove());
  if (hide) {
    // Some com o que não é assunto do clipe. visibility, e não display: os
    // painéis continuam ocupando o espaço deles, então a câmera enquadra o
    // planeta exatamente como na página de verdade.
    await page.addStyleTag({ content: `${hide}{visibility:hidden!important}` });
  }
  await page.addScriptTag({ content: CURSOR });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  return { page, context };
}

/** Abre a página, deixa a câmera pousar fora do filme, roda o roteiro. */
async function shoot(name, options, script) {
  const { page, context } = await open(options);
  const dir = await mkdtemp(path.join(os.tmpdir(), `orbis-${name}-`));
  const { crop } = options;
  const width = options.out ?? 1320;
  try {
    const f = film(page, dir, crop && { x: crop[0], y: crop[1], width: crop[2], height: crop[3] });
    // O voo de abertura da câmera fica fora do filme: o clipe abre com o
    // globo já pousado.
    await film(page).hold(options.warmup ?? 6000);
    if (options.before) {
      await options.before(page);
      await film(page).hold(1600);
    }
    await script(f, page);
    await encode(name, dir, width, options.quality);
    if (process.env.ORBIS_KEEP_FRAMES) {
      // Depuração: três quadros soltos para conferir o enquadramento.
      const keep = path.join(OUT, '_quadros');
      await mkdir(keep, { recursive: true });
      for (const k of [0, Math.floor(f.frames / 2), f.frames - 1]) {
        const src = path.join(dir, `${String(k).padStart(5, '0')}.jpg`);
        await copyFile(src, path.join(keep, `${name}-${k}.jpg`));
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await context.close();
  }
}

/**
 * Para onde olhar para ver o dia e a noite ao mesmo tempo.
 *
 * O terminador fica a 90 graus do ponto subsolar, que anda 15 graus por hora.
 * Dos dois lados possíveis, escolhe o que tem mais eventos por perto, para o
 * clipe abrir com pilares e com a linha entre o dia e a noite no meio da tela.
 * Calculado na hora da filmagem: cada deploy olha para um lugar diferente,
 * porque o sol também está num lugar diferente.
 */
async function terminatorView() {
  const read = async (file) => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
  const calendar = await read('data/calendar.json');
  const { countries } = await read('data/countries.json');
  const now = new Date();
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sub = ((((12 - hours) * 15) + 540) % 360) - 180;
  const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
  const near = (lon) => calendar.events.filter((e) => {
    const c = countries[e.country];
    if (!c) return false;
    const d = Math.abs(wrap(c.lon - lon));
    return d < 55;
  }).length;
  // A 90 graus: a linha entre o dia e a noite passa pelo meio do globo,
  // com o lado aceso de um lado e a noite do outro.
  const options = [wrap(sub + 90), wrap(sub - 90)];
  const lon = near(options[0]) >= near(options[1]) ? options[0] : options[1];
  return { lat: 28, lon };
}

const RAILS = '.topbar,.rail,.skip-link';

/* Todos os clipes de desktop em 2:1, recortes em pixels CSS de uma janela
   1280x720: [x, y, largura, altura]. A primeira versão misturava alturas de
   490 a 900 px e a página não tinha ritmo. */
const clips = {
  /* O herói: o globo com o terminador no meio e a lista do dia ao lado --
     um calendário, e não só um planeta. Uma mão gira devagar pela linha
     entre o dia e a noite. O orbis não gira sozinho de propósito. */
  globo: () => shoot('globo', {
    crop: [292, 50, 988, 494],
    out: 1100,
    quality: 64,
    before: async (page) => {
      const { lat, lon } = await terminatorView();
      await page.evaluate(([la, lo]) => {
        const g = window.__orbisGlobe;
        g.focus(la, lo, g.cameraDistance);
      }, [lat, lon]);
      // A lista abre no primeiro evento de alto impacto de um mercado que
      // todo mundo acompanha, e não às 00:00 -- a mesma lista de madrugada
      // aparecia em quatro clipes. Ela é montada aos poucos conforme rola,
      // então desce em etapas até a linha existir.
      for (let k = 0; k < 12; k += 1) {
        const found = await page.evaluate(() => {
          const list = document.getElementById('event-list');
          const highs = [...list.querySelectorAll('.event')]
            .filter((row) => [...row.querySelectorAll('*')].some((el) => el.style.color === 'rgb(255, 77, 109)'));
          const big = highs.find((row) => /Estados Unidos|Zona do Euro|Reino Unido/.test(row.textContent));
          if (!big) {
            list.scrollTop += 900;
            return false;
          }
          // 48 px de folga: o rótulo de horário gruda no topo da lista.
          list.scrollTop += big.getBoundingClientRect().top - list.getBoundingClientRect().top - 48;
          return true;
        });
        await page.clock.runFor(300);
        if (found) break;
      }
    },
  }, async (f) => {
    await f.hold(500);
    await f.drag(700, 330, 560, 340, 2200);
    await f.hold(800);
    await f.drag(540, 300, 700, 310, 2200);
    await f.leave();
    await f.hold(1200);
  }),

  /* O próximo evento de alto impacto: a câmera voa até o país e o evento
     abre com efetivo, projeção e anterior. */
  evento: () => shoot('evento', {
    crop: [360, 46, 920, 460],
    out: 1320,
    // O voo acontece fora do filme: o clipe abre já no país, e não na mesma
    // lista do dia que o herói mostra.
    before: (page) => page.click('#next-event'),
  }, async (f) => {
    await f.hold(500);
    await f.click('#event-list button.event', 0);
    await f.hold(2200);
    await f.click('#event-list button.event', 1);
    await f.hold(2200);
  }),

  /* A faixa de quatro semanas e o globo respondendo a ela. Sem os painéis,
     para a faixa ser o assunto. */
  linha: () => shoot('linha', {
    hide: `${RAILS},.rail-right`,
    // Do meio do globo para baixo, com a faixa em quase um terço da altura:
    // com o quadro inteiro, os rótulos dos dias ficavam com 6 px.
    crop: [160, 260, 920, 460],
    out: 1320,
    // A câmera desce para o Atlântico Norte, para os pilares dos EUA e da
    // Europa caírem dentro do recorte.
    before: (page) => page.evaluate(() => {
      const g = window.__orbisGlobe;
      g.focus(52, -35, g.cameraDistance);
    }),
  }, async (f, page) => {
    // Os próximos quatro dias úteis: um fim de semana sem agenda deixaria o
    // globo vazio no meio do clipe.
    const dias = await page.evaluate(() => {
      const hoje = document.querySelector('.tl-day[aria-current], .tl-day.is-today')?.dataset.day ?? '';
      return [...document.querySelectorAll('.tl-day')]
        .map((el, i) => ({ i, d: el.dataset.day }))
        .filter(({ d }) => d > hoje && ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
        .slice(0, 4)
        .map(({ i }) => i);
    });
    await f.hold(300);
    for (const i of dias) {
      await f.click('.tl-day', i);
      await f.hold(700);
    }
    await f.click('#tl-today');
    await f.hold(1200);
  }),

  /* Filtros: só alto impacto e o globo obedece. */
  filtros: () => shoot('filtros', { crop: [0, 46, 940, 470], out: 1320 }, async (f) => {
    await f.hold(300);
    // A ordem das linhas é a da escala: alto, médio, baixo, feriado.
    for (const i of [1, 2, 3]) {
      await f.click('#filter-impact > *', i);
      await f.hold(300);
    }
    await f.hold(1400);
    await f.click('#panel-reset');
    await f.hold(1000);
  }),

  /* Três idiomas, no celular: o mesmo formato do clipe ao lado. */
  idiomas: () => shoot('idiomas', {
    width: 390, height: 780, mobile: true, out: 700,
    // Abre em inglês, para o primeiro quadro já ser diferente do clipe ao lado.
    before: (page) => page.click('.lang button[data-lang="en"]'),
  }, async (f) => {
    await f.hold(900);
    for (const lang of ['es', 'pt']) {
      await f.click(`.lang button[data-lang="${lang}"]`);
      await f.hold(1300);
    }
  }),

  /* No celular: os filtros que voltam por um botão. */
  celular: () => shoot('celular', {
    width: 390, height: 780, mobile: true, out: 700,
    before: (page) => page.click('#filters-toggle'),
  }, async (f) => {
    await f.hold(900);
    await f.click('#filter-impact > *', 2);
    await f.hold(700);
    await f.click('#filter-impact > *', 1);
    await f.hold(900);
    await f.click('#filters-toggle');
    await f.leave();
    await f.hold(1500);
  }),
};

await mkdir(OUT, { recursive: true });
let failed = 0;
for (const [name, run] of Object.entries(clips)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const t0 = Date.now();
  try {
    await run();
    console.log(`        ${name} em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
}

await browser.close();
shutdown();
process.exit(failed ? 1 : 0);
