import assert from 'node:assert/strict';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');
const pkg = JSON.parse(await read('package.json'));
assert.equal(pkg.name, '@simonwicre/dsh-session-view');
assert.equal(pkg.version, '1.0.0');
assert.equal(pkg.engines.dsh, '0.2.2-rc.2');
assert.equal(pkg.private, undefined);
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
assert.equal(pkg.dsh.client.platform, 'web');
assert.equal(pkg.dsh.client.immediately, true);
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) assert.equal(pkg.scripts?.[hook], undefined, `No installation/build hook: ${hook}`);
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'LICENSE', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
  const location = path.join(root, file);
  assert.equal((await stat(location)).isFile(), true, `${file} exists`);
  assert.equal((await realpath(location)).startsWith(root + path.sep), true, 'Distribution assets stay inside the package');
}
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'LICENSE', 'icon.svg']) assert(pkg.files.includes(file), `${file} packed`);
assert(pkg.files.includes('locale/*.json'));
assert.equal(pkg.exports['.'], './index.js');
assert.equal(pkg.exports['./client'], './client.js');
assert.equal(pkg.exports['./icon'], './icon.svg');
assert.equal(pkg.exports['./locale/*.json'], './locale/*.json');
const patch = await read('cordis.patch.yml');
assert.match(patch, /id: simonwicre-session-view/);
assert.match(patch, /name: '@simonwicre\/dsh-session-view'/);
assert.match(patch, /config: \{\}/);
const locales = await Promise.all(['en', 'zh'].map(async locale => JSON.parse(await read(`locale/${locale}.json`))));
assert.deepEqual(Object.keys(locales[0].ui).sort(), Object.keys(locales[1].ui).sort(), 'Locale key parity');
for (const locale of locales) {
  assert(locale.meta.title.length > 0 && locale.meta.description.length > 0);
  assert.equal(locale.meta.detail, undefined, 'README fallback; no unverified preview');
  for (const [key, value] of Object.entries(locale.ui)) assert(typeof value === 'string' && value.length > 0, `Localized label ${key}`);
}
for (const key of Object.keys(locales[0].ui)) {
  const variables = value => [...value.matchAll(/\{([a-z]+)\}/gi)].map(match => match[1]).sort();
  assert.deepEqual(variables(locales[0].ui[key]), variables(locales[1].ui[key]), `Placeholder parity for ${key}`);
}
const code = await read('client.js');
new Script(code, { filename: 'client.js' }); // Parse only. Never emulate React or execute browser code.
assert(code.includes(`id: "${pkg.name}"`));
assert.deepEqual([...code.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1]), ['react']);
for (const prohibited of ['document.body', 'querySelector', 'addEventListener', 'setInterval(', 'XMLHttpRequest', 'WebSocket(', 'dangerouslySetInnerHTML', 'eval(', 'new Function(']) assert(!code.includes(prohibited), `No ${prohibited}`);
assert(code.includes("name: 'main', key: PANEL"));
assert(code.includes("name: 'sidebar.panellist', id: PANEL"));
assert(code.includes("controller.abort()"));
assert(!code.includes('.retain('));
assert(!code.includes('.fork('));
assert(!code.includes('.archiveSession('));
const css = await read('src/style.css');
const tokens = new Set([
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary', '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
]);
for (const match of css.matchAll(/--dsw-[a-z0-9-]+/g)) assert(tokens.has(match[0]), `Inspected theme token ${match[0]}`);
assert(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'UI colors come from theme tokens');
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /pointer: coarse/);
assert.match(css, /focus-visible/);
assert.match(css, /max-width: 540px/);
const icon = await read('icon.svg');
assert(Buffer.byteLength(icon) < 256 * 1024);
assert.match(icon, /viewBox="0 0 36 36"/);
assert(!/<(?:script|style|image|text|foreignObject)\b|\bon[a-z]+\s*=|(?:href|src)\s*=/i.test(icon));
console.log('Manifest, bundle patch, locale resources, JavaScript syntax, theme tokens and read-only boundaries: passed');
