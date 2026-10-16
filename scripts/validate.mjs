import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const list = (value, label) => assert(Array.isArray(value), `${label} must be an array`);
const text = (value, label) => assert(typeof value === 'string' && value.trim(), `${label} must be nonempty text`);
const unique = (items, label) => assert(new Set(items).size === items.length, `${label} contains duplicate IDs`);

function validateURL(value, template = false) {
  text(value, 'URL');
  assert(!/[\u0000-\u001f]/.test(value), 'URL contains control characters');
  if (template) assert(value.includes('{code}'), `Missing {code} in template: ${value}`);
  if (/^https?:\/\//.test(value)) {
    const url = new URL(value.replaceAll('{code}', '1234567'));
    assert(!url.username && !url.password, 'Do not publish credentials in URLs');
  } else {
    assert(!value.startsWith('/') && !value.includes('..') && !value.includes(':') && value.startsWith('uploads/'), `Use HTTPS or a relative uploads/ path: ${value}`);
    assert(fs.existsSync(path.join(root, decodeURIComponent(value))), `Missing local resource: ${value}`);
  }
}

export function validate() {
  const site = read('data/site.json');
  text(site.name, 'Site name');
  text(site.tagline, 'Tagline');
  list(site.streams, 'Streams');
  assert(site.streams.length, 'At least one stream is required');
  unique(site.streams.map((s) => s.id), 'Streams');
  let subjects = 0, links = 0;
  for (const stream of site.streams) {
    for (const key of ['id', 'name', 'shortName', 'description', 'file']) text(stream[key], `Stream ${key}`);
    assert(/^data\/[a-z0-9-]+\.json$/.test(stream.file), 'Catalog must be a JSON file directly inside data/');
    const catalog = read(stream.file);
    assert(catalog.id === stream.id, `ID mismatch in ${stream.file}`);
    list(catalog.branches, 'Branches');
    list(catalog.examTemplates, 'Exam templates');
    for (const exam of catalog.examTemplates) { text(exam.label, 'Exam label'); validateURL(exam.url, true); }
    unique(catalog.branches.map((b) => b.id), `${stream.id} branches`);
    for (const branch of catalog.branches) {
      text(branch.id, 'Branch ID'); text(branch.name, 'Branch name'); list(branch.semesters, 'Semesters');
      unique(branch.semesters.map((s) => s.id), `${branch.id} semesters`);
      for (const semester of branch.semesters) {
        text(semester.id, 'Semester ID'); text(semester.name, 'Semester name'); list(semester.subjects, 'Subjects');
        unique(semester.subjects.map((s) => s.code), `${branch.id}/${semester.id} subjects`);
        for (const subject of semester.subjects) {
          subjects++;
          text(subject.code, 'Subject code'); text(subject.name, 'Subject name'); list(subject.papers, 'Papers');
          assert(typeof subject.useExamTemplates === 'boolean', 'useExamTemplates must be true or false');
          for (const paper of subject.papers) {
            text(paper.label, 'Paper label'); validateURL(paper.url);
            assert(['paper', 'material'].includes(paper.type), `Unknown resource type: ${paper.type}`);
            links++;
          }
        }
      }
    }
  }
  console.log(`Validated ${site.streams.length} streams, ${subjects} subject listings and ${links} direct resource links.`);
  return site;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validate();
