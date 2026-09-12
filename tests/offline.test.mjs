/**
 * Assert that the page depends on nothing outside this repository.
 *
 *     node tests/offline.test.mjs .
 *
 * orbis claims to work with no network at all. That claim is one careless
 * `<script src="https://…">` away from being false, and nothing else in the
 * suite would notice: the globe keeps rendering for everyone who happens to
 * have a CDN reachable. So this walks the markup and the module graph and
 * fails on the first reference that leaves the origin.
 */

import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('usage: node tests/offline.test.mjs <repo root>');
  process.exit(2);
}

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');
const exists = (rel) => access(path.join(ROOT, rel)).then(() => true, () => false);

/* The SVG namespace is an identifier, not a request: xmlns never resolves. */
const ALLOWED = [/^https?:\/\/www\.w3\.org\/2000\/svg$/];

function externalUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)]
    .map((m) => m[0])
    .filter((url) => !ALLOWED.some((re) => re.test(url)));
}

console.log('\n=== markup and styles ===');

const html = await read('index.html');
const htmlUrls = externalUrls(html);
check('index.html references no external URL', htmlUrls.length === 0, htmlUrls.join(', '));

const css = await read('css/orbis.css');
const cssUrls = externalUrls(css);
check('css/orbis.css references no external URL', cssUrls.length === 0, cssUrls.join(', '));

const fontCss = await read('vendor/fonts.css');
const fontUrls = externalUrls(fontCss);
check('vendor/fonts.css references no external URL', fontUrls.length === 0, fontUrls.join(', '));

console.log('\n=== import map ===');

const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
check('index.html declares an import map', Boolean(mapMatch));

let imports = {};
if (mapMatch) {
  imports = JSON.parse(mapMatch[1]).imports ?? {};
  const remote = Object.entries(imports).filter(([, target]) => /^https?:/.test(target));
  check('every import map target is local', remote.length === 0,
    remote.map(([k, v]) => `${k} -> ${v}`).join(', '));

  for (const [specifier, target] of Object.entries(imports)) {
    const rel = target.replace(/^\.\//, '');
    check(`import map target exists: ${specifier}`, await exists(rel), rel);
  }
}

console.log('\n=== module graph ===');

/* Walk every module the page can reach, following relative imports and
   resolving bare specifiers through the import map, exactly as a browser
   would. A remote URL anywhere in that graph breaks offline use. */
const entry = 'js/main.js';
const seen = new Set();
const queue = [entry];
const offenders = [];
const missing = [];

while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);

  let source;
  try {
    source = await read(rel);
  } catch {
    missing.push(rel);
    continue;
  }

  const specifiers = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

  for (const spec of specifiers) {
    if (/^https?:/.test(spec)) { offenders.push(`${rel} -> ${spec}`); continue; }

    if (spec.startsWith('.')) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
      continue;
    }

    // Bare specifier: the import map has to resolve it, or the browser fails.
    const exact = imports[spec];
    const prefix = Object.keys(imports).find((k) => k.endsWith('/') && spec.startsWith(k));
    const target = exact ?? (prefix ? imports[prefix] + spec.slice(prefix.length) : null);

    if (!target) { offenders.push(`${rel} -> ${spec} (unmapped)`); continue; }
    if (/^https?:/.test(target)) { offenders.push(`${rel} -> ${target}`); continue; }
    queue.push(target.replace(/^\.\//, ''));
  }
}

check(`module graph reaches ${seen.size} local files`, seen.size > 1);
check('no module imports a remote URL', offenders.length === 0, offenders.join(', '));
check('every imported module exists on disk', missing.length === 0, missing.join(', '));

console.log('\n=== vendored assets ===');

for (const file of [
  'vendor/three/three.module.min.js',
  'vendor/three/three.core.min.js',
  'vendor/three/OrbitControls.js',
  'vendor/three/LICENSE',
  'vendor/fonts/LICENSE-Inter.txt',
  'vendor/fonts/LICENSE-JetBrainsMono.txt',
]) {
  check(`present: ${file}`, await exists(file));
}

/* Every font file the stylesheet promises has to be there, or the page falls
   back to system fonts without saying so. */
const fontFiles = [...fontCss.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]);
check('vendor/fonts.css declares at least one font', fontFiles.length > 0);
for (const file of fontFiles) {
  check(`font present: ${file}`, await exists(path.posix.join('vendor', file)));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
