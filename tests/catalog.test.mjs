import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { root, validate } from '../scripts/validate.mjs';
import { resolvePaperURL, validateURLSources } from '../paper-urls.js';
import { collectContributors } from '../scripts/contributors.mjs';

test('all registered catalogs, resource types and local file references are valid', () => {
  assert.equal(validate().streams.length >= 4, true);
});

const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8').replace(/^import .* from '\.\/paper-urls\.js';\s*$/m, '').replace(/initialize\(\);\s*$/, '');
const context = vm.createContext({ URL, URLSearchParams, resolvePaperURL, validateURLSources, document: { baseURI: 'https://example.test/project/index.html' } });
vm.runInContext(script, context);

test('resources reject executable URLs and duplicate links, and preserve local subpaths', () => {
  context.catalog = { examTemplates: [{ label: 'Winter 2025', url: 'https://example.test/{code}.pdf' }] };
  context.subject = { code: 'BP101TP', useExamTemplates: true, papers: [
    { label: 'Bad link', url: 'javascript:alert(1)' },
    { label: 'Bad data', url: 'data:text/html,hello' },
    { label: 'Local paper', url: 'uploads/paper.pdf' },
    { label: 'Repeated paper', url: 'uploads/paper.pdf' },
  ] };
  const papers = vm.runInContext('resourcesFor(catalog, subject)', context);
  assert.equal(papers.length, 2);
  assert.equal(papers[1].url, 'https://example.test/BP101TP.pdf');
  assert.equal(vm.runInContext("safeURL('uploads/paper.pdf')", context), 'https://example.test/project/uploads/paper.pdf');
});

test('search matches every token regardless of case and can match exam sessions', () => {
  context.entry = { searchText: 'mathematics i 3110014 bachelor of engineering winter 2020' };
  vm.runInContext("state.q = 'MATHEMATICS Winter 2020'", context);
  assert.equal(vm.runInContext('matchesQuery(entry)', context), true);
  vm.runInContext("state.q = 'mathematics summer'", context);
  assert.equal(vm.runInContext('matchesQuery(entry)', context), false);
});

test('study material filtering excludes question papers', () => {
  context.entry = { resources: [{ type: 'paper' }, { type: 'material' }] };
  vm.runInContext("state.resource = 'material'", context);
  assert.equal(vm.runInContext('matchingResources(entry).length', context), 1);
  assert.equal(vm.runInContext('matchingResources(entry)[0].type', context), 'material');
});

test('paper cards sort oldest to newest with summer before winter and undated resources last', () => {
  const labels = ['Winter 2025', 'Notes', 'WINTER 201 8asic Electrical Engineering', 'Summer 2025', 'SUMMMER 2019 Chemistry', 'Winter 2019', 'Other notes'];
  context.entry = { resources: labels.map((label) => ({ label, type: 'paper' })) };
  vm.runInContext("state.resource = ''", context);
  const sorted = vm.runInContext('matchingResources(entry)', context);
  assert.deepEqual(Array.from(sorted, (r) => r.label), [labels[2], labels[4], labels[5], labels[3], labels[0], labels[1], labels[6]]);
  assert.deepEqual(context.entry.resources.map((r) => r.label), labels);
});

test('migration retains catalog scope and the recovered architecture paper', () => {
  const architecture = JSON.parse(fs.readFileSync(path.join(root, 'data/architecture.json'), 'utf8'));
  const subjects = architecture.branches.flatMap((b) => b.semesters.flatMap((s) => s.subjects));
  const recovered = subjects.find((s) => s.code === '2X35002');
  assert.equal(recovered.name, 'Building Construction-III');
  assert.equal(recovered.papers.length, 2);
});

test('published build excludes backend, private source, original uploads and secrets', () => {
  const directory = path.join(root, 'dist');
  assert.ok(fs.existsSync(path.join(directory, 'index.html')), 'Run the build before tests');
  const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.relative(directory, path.join(folder, entry.name))]);
  const files = walk(directory);
  assert.ok(!files.some((file) => /legacy-private|connect\.php|\.env|\.php$|migration-report|migrate\.py/.test(file)));
  assert.ok(files.includes(path.join('data', 'diploma.json')));
  assert.equal(fs.readFileSync(path.join(directory, 'ads.txt'), 'utf8').trim(), 'google.com, pub-2553242957639447, DIRECT, f08c47fec0942fa0');
  assert.match(fs.readFileSync(path.join(directory, 'index.html'), 'utf8'), /adsbygoogle\.js\?client=ca-pub-2553242957639447/);
  assert.ok(files.includes(path.join('coarse', 'bachelors', 'computerengineer.html')));
  for (const file of ['inside.css', 'catalog.css', 'landing.css', 'img/imgbg.gif', 'img/headimg1.gif', 'img/oldpaper.png', 'paper-urls.js', 'data/urls.json', 'data/contributors.json']) {
    assert.ok(fs.existsSync(path.join(directory, file)), `Missing original design asset: ${file}`);
  }
});

test('single-page routes preserve the original course, semester, dropdown and download views', () => {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener() {}
  }
  const nodes = new Map(['content', 'announcement', 'search', 'about', 'oldpaper'].map((id) => [id, new Node('div')]));
  let modern = false;
  const doc = {
    body: { classList: { toggle: (_name, enabled) => { modern = enabled; } } },
    baseURI: 'https://example.test/project/index.html',
    createElement: (tag) => new Node(tag),
    getElementById: (id) => nodes.get(id),
    querySelector: () => nodes.get('about'),
  };
  const runtime = vm.createContext({ URL, URLSearchParams, resolvePaperURL, validateURLSources, document: doc, location: { search: '' } });
  vm.runInContext(script, runtime);
  runtime.fixture = JSON.parse(fs.readFileSync(path.join(root, 'data/diploma.json'), 'utf8'));
  runtime.sources = JSON.parse(fs.readFileSync(path.join(root, 'data/urls.json'), 'utf8'));
  vm.runInContext(`
    config = { name: 'PAPERONBOARD', streams: [{ id: 'diploma', name: 'Diploma' }] };
    urlSources = sources;
    catalogs = [fixture];
    for (const branch of fixture.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) {
      entries.push({ catalog: fixture, branch, semester, subject, resources: resourcesFor(fixture, subject) });
    }
    restoreURL();
  `, runtime);
  const walk = (node) => [node, ...node.children.flatMap(walk)];
  const all = () => walk(nodes.get('content'));
  assert.ok(all().some((node) => node.id === 'container1'));
  assert.ok(all().some((node) => node.className === 'premium-course'));
  assert.equal(modern, true);
  runtime.location.search = '?view=contributors';
  vm.runInContext('restoreURL()', runtime);
  assert.ok(all().some((node) => node.className === 'community-empty'));
  runtime.people = { repository: 'example/papers', contributors: [{ login: 'student', mergedPRs: 2 }] };
  vm.runInContext('contributorsData = people; restoreURL()', runtime);
  assert.ok(all().some((node) => node.className === 'contributor-card'));
  assert.ok(all().some((node) => node.href === 'https://github.com/student'));
  runtime.location.search = '?stream=diploma&branch=computer';
  vm.runInContext('restoreURL()', runtime);
  assert.equal(modern, false);
  assert.ok(all().some((node) => node.id === 'selectsemester'));
  assert.ok(all().some((node) => node.id === 'sem-1'));
  assert.ok(all().some((node) => node.className === 'sub' && node.textContent.includes('4300001')));
  runtime.location.search = '?stream=diploma&branch=computer&semester=1&subject=4300001';
  vm.runInContext('restoreURL()', runtime);
  assert.ok(all().some((node) => node.className === 'bigcard'));
  assert.ok(all().some((node) => node.tagName === 'article' && node.className === 'card'));
  assert.ok(all().some((node) => node.tagName === 'a' && node.textContent === 'Download' && node.href.startsWith('https://')));
});

test('contributors count merged PR authors, excluding closed unmerged PRs and bots', () => {
  const pulls = [
    { merged_at: '2026-01-01', user: { login: 'student', type: 'User' } },
    { merged_at: '2026-01-02', user: { login: 'student', type: 'User' } },
    { merged_at: null, user: { login: 'not-merged', type: 'User' } },
    { merged_at: '2026-01-03', user: { login: 'dependabot[bot]', type: 'Bot' } },
    { merged_at: '2026-01-04', user: null },
    { merged_at: '2026-01-05', user: { login: 'helper', type: 'User' } },
  ];
  assert.deepEqual(collectContributors(pulls), [{ login: 'student', mergedPRs: 2 }, { login: 'helper', mergedPRs: 1 }]);
});

test('URL versions change the shared host while preserving archive paths and older versions', () => {
  const sources = validateURLSources({ versions: {
    v1: 'https://old26.gtu.ac.in/uploads/',
    v2: 'https://example.edu/new-archive/',
  } });
  const exam = { urlVersion: 'v1', path: 'W2024/BE/{code}.pdf' };
  assert.equal(resolvePaperURL(exam, sources, '3110014'), 'https://old26.gtu.ac.in/uploads/W2024/BE/3110014.pdf');
  assert.equal(resolvePaperURL({ ...exam, urlVersion: 'v2' }, sources, '3110014'), 'https://example.edu/new-archive/W2024/BE/3110014.pdf');
  sources.versions.v1 = 'https://example.edu/moved/';
  assert.equal(resolvePaperURL(exam, sources, '3110014'), 'https://example.edu/moved/W2024/BE/3110014.pdf');
  assert.equal(resolvePaperURL({ url: 'uploads/paper.pdf' }, sources), 'uploads/paper.pdf');
  assert.throws(() => resolvePaperURL({ ...exam, urlVersion: 'v3' }, sources, '3110014'), /Unknown URL version/);
  assert.throws(() => resolvePaperURL({ ...exam, path: '//unrelated.test/paper.pdf' }, sources), /relative/);
  assert.throws(() => validateURLSources({ versions: { v1: 'javascript:alert(1)' } }), /HTTPS/);
});

test('semester scrolling restores the original 800 ms animation without a header offset', () => {
  let frame;
  let reducedMotion = false;
  const positions = [];
  const hashes = [];
  const runtime = vm.createContext({
    URL, URLSearchParams, resolvePaperURL, validateURLSources,
    document: { getElementById: (id) => id === 'sem-3' ? { getBoundingClientRect: () => ({ top: 900 }) } : null },
    window: {
      scrollY: 100,
      scrollTo: (_x, y) => positions.push(y),
      matchMedia: () => ({ matches: reducedMotion }),
    },
    location: { hash: '' },
    history: { pushState: (_state, _title, hash) => hashes.push(hash) },
    performance: { now: () => 0 },
    requestAnimationFrame: (callback) => { frame = callback; return 1; },
    cancelAnimationFrame: () => { frame = null; },
  });
  vm.runInContext(script, runtime);
  assert.equal(vm.runInContext("scrollToSection('#sem-3', true, true)", runtime), true);
  frame(400);
  assert.ok(Math.abs(positions.at(-1) - 550) < 0.001);
  assert.equal(hashes.length, 0);
  frame(800);
  assert.equal(positions.at(-1), 1000);
  assert.deepEqual(hashes, ['#sem-3']);
  assert.equal(vm.runInContext("scrollToSection('#missing')", runtime), false);
  reducedMotion = true;
  frame = null;
  vm.runInContext("scrollToSection('#sem-3')", runtime);
  assert.equal(positions.at(-1), 1000);
  assert.equal(frame, null);
});
