import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePaperURL, validateURLSources } from '../paper-urls.js';

const script = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  .replace(/^import .* from '\.\/paper-urls\.js';\s*$/m, '').replace(/initialize\(\);\s*$/, '');
const streams = ['diploma', 'bachelors', 'pharma'].map((id) => ({ id, name: id, file: `data/${id}.json` }));
const catalog = (id) => ({ id, name: id, branches: [{ id: 'common', name: 'Common', semesters: [{ id: '1', name: 'Semester 1', subjects: [{ name: 'Maths', code: '101', papers: [{ type: 'paper', label: 'Winter 2025', url: 'https://example.test/paper.pdf' }] }] }] }] });
function runtime(fetch) {
  const context = vm.createContext({ URL, URLSearchParams, resolvePaperURL, validateURLSources, fetch, console,
    document: { baseURI: 'https://paperonboard.in/' },
  });
  vm.runInContext(script, context);
  context.settings = { name: 'PaperOnBoard', streams };
  vm.runInContext('config = settings; urlSources = { versions: {} }', context);
  return context;
}

test('home and course menus need no catalogs; course routes load only their catalog and cache it', async () => {
  const requests = [];
  const context = runtime(async (file) => {
    requests.push(file);
    return { ok: true, json: async () => catalog(file.slice(5, -5)) };
  });
  await vm.runInContext("loadRouteCatalogs('index.html')", context);
  await vm.runInContext("loadRouteCatalogs('courses.html')", context);
  await vm.runInContext("loadRouteCatalogs('contributors.html')", context);
  assert.deepEqual(requests, []);
  await vm.runInContext("loadRouteCatalogs('subject-diploma--101.html')", context);
  await vm.runInContext("loadRouteCatalogs('catalog-diploma--common.html')", context);
  await vm.runInContext("loadRouteCatalogs('index.html?stream=diploma&branch=common')", context);
  assert.deepEqual(requests, ['data/diploma.json']);
  await vm.runInContext("loadRouteCatalogs('catalog-bachelors.html')", context);
  assert.deepEqual(requests, ['data/diploma.json', 'data/bachelors.json']);
  await vm.runInContext("loadRouteCatalogs('index.html?q=Maths')", context);
  assert.deepEqual(requests, ['data/diploma.json', 'data/bachelors.json', 'data/pharma.json']);
  assert.equal(vm.runInContext('entries.length', context), 3);
  assert.equal(vm.runInContext("entries.filter((entry) => { state.q = 'winter 2025'; return matchesQuery(entry); }).length", context), 3);
});

test('concurrent navigation shares requests, and failed catalog loads can be retried', async () => {
  let finish;
  let requests = 0;
  const context = runtime(() => { requests++; return new Promise((resolve) => { finish = resolve; }); });
  const first = vm.runInContext("loadRouteCatalogs('catalog-diploma.html')", context);
  const second = vm.runInContext("loadRouteCatalogs('subject-diploma--101.html')", context);
  assert.equal(requests, 1);
  finish({ ok: false, status: 503 });
  await assert.rejects(first, /Could not load/);
  await assert.rejects(second, /Could not load/);
  const retry = vm.runInContext("loadRouteCatalogs('catalog-diploma.html')", context);
  assert.equal(requests, 2);
  finish({ ok: true, json: async () => catalog('diploma') });
  await retry;
  assert.equal(vm.runInContext('entries.length', context), 1);
});

test('a slower earlier navigation cannot replace a newer route', async () => {
  let finish;
  const context = runtime(async (file) => {
    if (file === 'data/diploma.json') await new Promise((resolve) => { finish = resolve; });
    return { ok: true, json: async () => catalog(file.slice(5, -5)) };
  });
  const visits = [];
  context.history = { pushState: (_state, _title, url) => visits.push(url) };
  context.location = { hash: '' };
  context.window = { scrollY: 0, scrollTo() {} };
  context.document.getElementById = () => ({ hidden: true });
  vm.runInContext('restoreURL = () => {}; setMenuOpen = () => {}; scrollToSection = () => false', context);
  const first = vm.runInContext("navigate('catalog-diploma.html')", context);
  await vm.runInContext("navigate('catalog-bachelors.html')", context);
  finish();
  await first;
  assert.deepEqual(visits, ['catalog-bachelors.html']);
});

test('a failed initial load keeps pre-rendered download content', async () => {
  const content = { textContent: 'Existing download links', replaceChildren() { throw new Error('Static content must remain'); } };
  const error = { hidden: true, textContent: '' };
  const context = runtime(async () => { throw new Error('offline'); });
  context.console = { error() {} };
  context.document.getElementById = (id) => id === 'content' ? content : error;
  vm.runInContext('initializeOpenSourceNotice = () => {}', context);
  await vm.runInContext('initialize()', context);
  assert.equal(content.textContent, 'Existing download links');
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /still use the page links/);
});

test('initial course loading registers controls before its catalog resolves', async () => {
  let finish;
  let started;
  const pending = new Promise((resolve) => { started = resolve; });
  const requests = [];
  const context = runtime(async (file) => {
    requests.push(file);
    if (file === 'data/site.json') return { ok: true, json: async () => ({ name: 'PaperOnBoard', streams }) };
    if (file === 'data/urls.json') return { ok: true, json: async () => ({ versions: {} }) };
    if (file === 'data/contributors.json') return { ok: true, json: async () => ({ contributors: [] }) };
    started();
    await new Promise((resolve) => { finish = resolve; });
    return { ok: true, json: async () => catalog('diploma') };
  });
  const controls = new Map();
  const node = (id) => {
    if (!controls.has(id)) controls.set(id, { listeners: new Map(), addEventListener(event, handler) { this.listeners.set(event, handler); } });
    return controls.get(id);
  };
  context.document.getElementById = node;
  context.document.addEventListener = () => {};
  context.location = { href: 'https://paperonboard.in/subject-diploma--101.html', hash: '' };
  context.window = { addEventListener() {} };
  vm.runInContext('initializeOpenSourceNotice = () => {}; initializeDisplayAd = () => {}; restoreURL = () => {}', context);
  const initialization = vm.runInContext('initialize()', context);
  await pending;
  assert.ok(node('open-nav').listeners.has('click'));
  assert.ok(node('search-toggle').listeners.has('click'));
  assert.ok(node('search-form').listeners.has('submit'));
  assert.deepEqual(requests.filter((file) => streams.some((stream) => stream.file === file)), ['data/diploma.json']);
  finish();
  await initialization;
});
