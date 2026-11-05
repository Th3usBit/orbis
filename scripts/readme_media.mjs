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
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';

const ROOT = path.resolve(process.argv[2] ?? '.');
const OUT = path.resolve(process.argv[3] ?? path.join(ROOT, 'assets', 'readme'));
const PORT = Number(process.env.ORBIS_PORT ?? 8352);
const SITE = process.env.ORBIS_SITE ?? `http://127.0.0.1:${PORT}/`;
const ONLY = (process.env.ORBIS_CLIPS ?? '').split(',').filter(Boolean);

/* Largura final no README. A coluna de conteúdo do GitHub tem 880 px úteis
   no desktop; 960 dá nitidez em tela retina sem dobrar o peso do arquivo. */
const OUT_WIDTH = 960;
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
function film(page, dir = null) {
  let n = 0;
  let cursor = { x: -200, y: -200 };

  async function shot() {
    if (!dir) return;  // aquecimento: a página anda, ninguém fotografa
    const file = path.join(dir, `${String(n).padStart(5, '0')}.jpg`);
    n += 1;
    await page.screenshot({ path: file, type: 'jpeg', quality: 90, animations: 'allow', timeout: 120000 });
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
async function encode(name, dir, width) {
  const out = path.join(OUT, `${name}.webp`);
  const run = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'),
    '-vf', `scale=${width}:-2:flags=lanczos`,
    '-c:v', 'libwebp_anim', '-quality', '60', '-compression_level', '6',
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

async function open({ width = 1280, height = 720, query = '', mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
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
  await page.addScriptTag({ content: CURSOR });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  return { page, context };
}

/** Abre a página, deixa a câmera pousar fora do filme, roda o roteiro. */
async function shoot(name, options, script, width = OUT_WIDTH) {
  const { page, context } = await open(options);
  const dir = await mkdtemp(path.join(os.tmpdir(), `orbis-${name}-`));
  try {
    const f = film(page, dir);
    // O voo de abertura da câmera fica fora do filme: o clipe abre com o
    // globo já pousado.
    await film(page).hold(options.warmup ?? 6000);
    await script(f, page);
    await encode(name, dir, width);
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

const clips = {
  /* Uma mão girando o globo: das Américas à Europa e à Ásia, e de volta
     até o Atlântico.
     O orbis não gira sozinho de propósito (ver o comentário em globe.js);
     o que se move aqui é o que um visitante move. */
  globo: () => shoot('globo', {}, async (f) => {
    // Arrastar para a esquerda traz o leste para a frente.
    await f.hold(500);
    await f.drag(740, 360, 520, 380, 1800);
    await f.hold(1200);
    await f.drag(740, 320, 540, 330, 1800);
    await f.hold(1200);
    await f.drag(500, 400, 800, 390, 2000);
    await f.leave();
    await f.hold(1400);
  }),

  /* O cartão "próximo de alto impacto" leva a câmera até o país. */
  voo: () => shoot('voo', {}, async (f) => {
    await f.hold(500);
    await f.click('#next-event');
    await f.hold(2600);
    await f.click('#event-list button.event', 0);
    await f.hold(2400);
  }),

  /* A linha do tempo: dia a dia, os pilares sobem e descem com a agenda. */
  linha: () => shoot('linha', {}, async (f) => {
    await f.hold(400);
    for (let i = 0; i < 4; i += 1) {
      await f.click('#tl-next');
      await f.hold(600);
    }
    await f.click('#tl-today');
    await f.hold(1400);
  }),

  /* Filtros: só alto impacto, depois uma região, depois limpar. */
  filtros: () => shoot('filtros', {}, async (f) => {
    await f.hold(400);
    // A ordem das linhas é a da escala: alto, médio, baixo, feriado.
    for (const i of [1, 2, 3]) {
      await f.click('#filter-impact > *', i);
      await f.hold(350);
    }
    await f.hold(1200);
    await f.click('#filter-region > *', 1);
    await f.hold(1600);
    await f.click('#panel-reset');
    await f.hold(1200);
  }),

  /* Três idiomas, inclusive o nome de cada indicador e de cada país. */
  idiomas: () => shoot('idiomas', { query: '?c=US' }, async (f) => {
    await f.hold(600);
    for (const lang of ['en', 'es', 'pt']) {
      await f.click(`.lang button[data-lang="${lang}"]`);
      await f.hold(1300);
    }
  }),

  /* No celular: o globo e os filtros que voltam por um botão. */
  celular: () => shoot('celular', { width: 390, height: 780, mobile: true }, async (f) => {
    await f.hold(1200);
    await f.click('#filters-toggle');
    await f.hold(1400);
    await f.click('#filter-impact > *', 2);
    await f.hold(1000);
    await f.click('#filters-toggle');
    await f.leave();
    await f.hold(1800);
  }, 360),
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
