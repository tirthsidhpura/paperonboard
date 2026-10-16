// A strict allowlist keeps the original PHP site and private files out of hosting.
import fs from 'node:fs';
import path from 'node:path';
import { root, validate } from './validate.mjs';

const site = validate();
const destination = path.join(root, 'dist');
if (path.dirname(destination) !== root || path.basename(destination) !== 'dist') throw new Error('Invalid build destination');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
const copy = (file) => {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
};
for (const file of ['index.html', 'index.js', 'style.css', 'assets/mark.svg', 'CONTRIBUTING.md', 'data/site.json', ...site.streams.map((s) => s.file)]) copy(file);
for (const stream of site.streams) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, stream.file), 'utf8'));
  for (const branch of catalog.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) for (const paper of subject.papers) {
    if (paper.url.startsWith('uploads/')) copy(decodeURIComponent(paper.url));
  }
}
// Old shared branch URLs continue to work on static hosting, including subpaths.
const reportPath = path.join(root, 'data/migration-report.json');
if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  for (const file of report.sourcePages) {
    const streamId = file.split('/')[1];
    const branchId = path.basename(file, '.html').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const target = `../../index.html?stream=${encodeURIComponent(streamId)}&branch=${encodeURIComponent(branchId)}`;
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target.replaceAll('&', '&amp;')}"><title>PaperOnBoard</title><a href="${target.replaceAll('&', '&amp;')}">Open the paper library</a></html>`;
    const output = path.join(destination, file);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html);
  }
}
for (const [file, id] of [['diploma.html', 'diploma'], ['bachelor.html', 'bachelors']]) {
  fs.writeFileSync(path.join(destination, file), `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=index.html?stream=${id}"><title>PaperOnBoard</title><a href="index.html?stream=${id}">Open the paper library</a></html>`);
}
console.log('Static site ready in dist/. Publish only this folder.');
