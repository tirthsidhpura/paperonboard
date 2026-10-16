import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { root, validate } from '../scripts/validate.mjs';

test('all registered catalogs, resource types and local file references are valid', () => {
  assert.equal(validate().streams.length >= 4, true);
});

const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8').replace(/initialize\(\);\s*$/, '');
const context = vm.createContext({ URL, document: { baseURI: 'https://example.test/project/index.html' } });
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
  assert.ok(files.includes(path.join('coarse', 'bachelors', 'computerengineer.html')));
});
