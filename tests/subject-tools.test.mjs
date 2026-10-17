import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePaperURL, validateURLSources } from '../paper-urls.js';

const script = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  .replace(/^import .* from '\.\/paper-urls\.js';\s*$/m, '').replace(/initialize\(\);\s*$/, '');
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = new Map(); }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, handler) { this.listeners.set(event, handler); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}
function page(navigator = {}) {
  const content = new Node('div');
  const location = { pathname: '/subject-diploma--101.html', search: '' };
  const runtime = vm.createContext({ URL, URLSearchParams, resolvePaperURL, validateURLSources, navigator, location,
    document: { baseURI: 'https://paperonboard.in/', createElement: (tag) => new Node(tag), getElementById: () => undefined },
    history: { replaceState: (_state, _title, url) => {
      const target = new URL(url, 'https://paperonboard.in/');
      location.pathname = target.pathname;
      location.search = target.search;
    } },
  });
  vm.runInContext(script, runtime);
  runtime.content = content;
  vm.runInContext(`
    config = {};
    entries = [{ catalog: { id: 'diploma', name: 'Diploma', archivePolicy: 'listed-only' }, branch: { id: 'computer', name: 'Computer' }, semester: { id: '1', name: 'Semester 1' }, subject: { code: '101', name: 'Maths' }, resources: [
      { label: 'Summer 2025', type: 'paper', url: 'https://example.test/s25.pdf' },
      { label: 'Winter 2025', type: 'paper', url: 'https://example.test/w25.pdf' },
      { label: 'Winter 2024', type: 'paper', url: 'https://example.test/w24.pdf' },
      { label: 'Notes', type: 'material', url: 'https://example.test/notes.pdf' },
    ] }];
    entries.push({ ...entries[0], branch: { id: 'civil', name: 'Civil' }, resources: [entries[0].resources[0], { label: 'SUMMMER 2019', type: 'paper', url: 'https://example.test/s19.pdf' }] });
    renderSubject(entries[0], content);
  `, runtime);
  const walk = (node) => [node, ...node.children.flatMap(walk)];
  const all = () => walk(content);
  const button = (text) => all().find((node) => node.tagName === 'button' && node.textContent === text);
  const select = (label) => all().find((node) => node.tagName === 'select' && node.attributes['aria-label'] === label);
  return { runtime, location, all, button, select, visibleCards: () => all().filter((node) => node.className === 'card' && !node.hidden) };
}

test('session and year filters combine across shared branches, preserve focus nodes, and clear without fetching', () => {
  const ui = page();
  assert.equal(ui.visibleCards().length, 5);
  const winter = ui.button('Winter');
  winter.listeners.get('click')();
  assert.equal(ui.visibleCards().length, 2);
  assert.equal(winter.attributes['aria-pressed'], 'true');
  const year = ui.select('Exam year');
  assert.deepEqual(year.children.map((option) => option.value), ['', '2025', '2024', '2019']);
  year.value = '2025';
  year.listeners.get('change')();
  assert.equal(ui.visibleCards().length, 1);
  assert.equal(ui.button('Winter'), winter);
  assert.equal(ui.location.search, '?session=winter&year=2025');
  const whatsapp = ui.all().find((node) => node.textContent === 'WhatsApp');
  assert.match(new URL(whatsapp.href).searchParams.get('text'), /subject-diploma--101.html\?session=winter&year=2025/);
  const type = ui.select('Resource type');
  type.value = 'material';
  type.listeners.get('change')();
  assert.equal(ui.visibleCards().length, 0);
  assert.ok(ui.all().some((node) => !node.hidden && node.textContent?.startsWith('No resources match')));
  ui.button('Clear filters').listeners.get('click')();
  assert.equal(ui.visibleCards().length, 5);
  assert.equal(ui.location.search, '');
  assert.equal(type.value, '');
  assert.equal(year.value, '');
});

test('sharing uses the native share sheet and treats cancellation as cancellation', async () => {
  const shared = [];
  let copied = false;
  const ui = page({ share: async (payload) => { shared.push(payload); }, clipboard: { writeText: async () => { copied = true; } } });
  ui.button('Summer').listeners.get('click')();
  await ui.button('Share subject').listeners.get('click')();
  assert.equal(shared[0].url, 'https://paperonboard.in/subject-diploma--101.html?session=summer');
  assert.equal(shared[0].title, 'GTU Maths (101)');
  assert.equal(copied, false);
  ui.runtime.navigator.share = async () => { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; };
  await ui.button('Share subject').listeners.get('click')();
  assert.equal(copied, false);
  assert.equal(ui.button('Share subject').disabled, false);
});

test('sharing copies a link when native sharing is unavailable, with a manual fallback when clipboard access fails', async () => {
  let copied;
  const ui = page({ clipboard: { writeText: async (url) => { copied = url; } } });
  await ui.button('Share subject').listeners.get('click')();
  assert.equal(copied, 'https://paperonboard.in/subject-diploma--101.html');
  assert.ok(ui.all().some((node) => node.textContent?.startsWith('Link copied')));
  ui.runtime.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  await ui.button('Share subject').listeners.get('click')();
  const input = ui.all().find((node) => node.className === 'share-link');
  assert.equal(input.hidden, false);
  assert.equal(input.selected, true);
  assert.equal(input.focused, true);
  assert.equal(input.value, copied);
});

test('shared URLs restore session/year filters, reject invalid values, and retain the canonical base route', () => {
  const ui = page();
  const search = new Node('input');
  ui.runtime.document.getElementById = (id) => id === 'search' ? search : undefined;
  ui.location.search = '?session=winter&year=2025';
  vm.runInContext('render = () => {}; catalogs = [entries[0].catalog]; restoreURL()', ui.runtime);
  assert.equal(vm.runInContext('matchingResources(entries[0]).length', ui.runtime), 1);
  assert.equal(vm.runInContext('routeURL(entryRoute(entries[0]))', ui.runtime), 'subject-diploma--101.html');
  ui.location.search = '?session=anything&year=bad';
  vm.runInContext('restoreURL()', ui.runtime);
  assert.equal(vm.runInContext('state.session', ui.runtime), '');
  assert.equal(vm.runInContext('state.year', ui.runtime), '');
});
