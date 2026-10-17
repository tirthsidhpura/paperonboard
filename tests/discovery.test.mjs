import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root } from '../scripts/validate.mjs';
import { resolvePaperURL } from '../paper-urls.js';

const read = (file) => fs.readFileSync(path.join(root, 'dist', file), 'utf8');
const site = JSON.parse(read('data/site.json'));
const source = JSON.parse(read('data/gtu-source.json'));

test('subject overview and labelled top placement precede accessible paper navigation', () => {
  const html = read('subject-bachelors--3161613.html');
  assert.ok(html.includes('<section id="subject-stage" class="subject-stage">'));
  assert.ok(html.includes('<aside id="subject-ad" class="subject-top-ad" aria-label="Advertisements">'));
  assert.match(html, /3161613/);
  assert.match(html, /id="skip-to-papers" class="skip-link" href="#subject-resources"/);
  assert.match(html, /href="#subject-resources">Browse papers/);
  assert.ok(html.indexOf('id="subject-ad"') < html.indexOf('id="subject-resources"'));
  assert.match(read('index.html'), /id="subject-stage" class="subject-stage" hidden/);
  assert.match(read('catalog-bachelors.html'), /id="subject-stage" class="subject-stage" hidden/);
  assert.match(read('catalog.css'), /prefers-reduced-motion: reduce/);
});

test('homepage summary counts match the full catalogs without embedding their resources', () => {
  let subjects = 0;
  for (const stream of site.streams) {
    const catalog = JSON.parse(read(stream.file));
    subjects += new Set(catalog.branches.flatMap((branch) => branch.semesters.flatMap((semester) => semester.subjects.map((subject) => subject.code)))).size;
    assert.deepEqual(site.catalogSummary.streams[stream.id], { branches: catalog.branches.length, imported: Boolean(catalog.imported) });
  }
  assert.equal(site.catalogSummary.subjects, subjects);
  assert.ok(Buffer.byteLength(read('data/site.json')) < 25000);
  assert.match(read('index.html'), new RegExp(subjects.toLocaleString('en-US')));
});

test('all official course codes have catalogs and reachable rendered pages', () => {
  assert.equal(new Set(source.courses.map((course) => course.code)).size, 58);
  const names = JSON.parse(read('data/gtu-program-names.json')).names;
  for (const course of source.courses) {
    const registered = site.streams.find((stream) => stream.id === course.id);
    assert.ok(registered, `Course ${course.code} is not registered`);
    const catalog = JSON.parse(read(registered.file));
    assert.equal(catalog.gtuCourseCode, course.code);
    if (catalog.imported && names[course.code]) assert.equal(catalog.name, names[course.code]);
    const html = read(`catalog-${course.id}.html`);
    assert.match(html, /GTU .*Question Paper/);
    assert.ok(!html.includes('<div id="content"><p class="catalog-message" role="status">Loading question papers'));
    if (!catalog.branches.length) assert.match(html, /noindex,follow/);
    for (const branch of catalog.branches) {
      const branchHTML = read(catalog.directSemesters ? `catalog-${course.id}.html` : `catalog-${course.id}--${branch.id}.html`);
      for (const semester of branch.semesters) {
        for (const subject of semester.subjects) assert.ok(branchHTML.includes(subject.code.replaceAll('&', '&amp;')), `Missing rendered subject ${subject.code}`);
      }
    }
  }
});

test('sitemap URLs have matching canonical HTML, unique metadata and parsed structured data', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.length > 50);
  const titles = new Set();
  for (const url of urls) {
    const pathname = new URL(url).pathname;
    const html = read(pathname === '/' ? 'index.html' : pathname.slice(1));
    assert.ok(html.includes(`rel="canonical" href="${url}"`));
    assert.ok(!html.includes('content="noindex'));
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    assert.ok(!titles.has(title), `Duplicate title: ${title}`);
    titles.add(title);
    const schema = JSON.parse(html.match(/<script id="page-schema" type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.ok(schema['@graph'].some((item) => item.url === url));
  }
  assert.match(read('robots.txt'), /Sitemap: https:\/\/paperonboard.in\/sitemap.xml/);
  assert.match(read('index.html'), /Your next exam/);
  assert.match(read('courses.html'), /catalog-gtu-mb.html/);
  assert.match(read('llms.txt'), /Not affiliated/);
});

test('rendered internal route links resolve to files included in the build', () => {
  const files = fs.readdirSync(path.join(root, 'dist')).filter((file) => /^(subject-|catalog-|index\.|courses\.|contributors\.)/.test(file) && file.endsWith('.html'));
  for (const file of files) {
    for (const match of read(file).matchAll(/<a\b[^>]*\bhref="([^"#]+)"[^>]*data-route/g)) {
      const target = new URL(match[1].replaceAll('&amp;', '&'), 'https://paperonboard.in/' + file);
      assert.ok(fs.existsSync(path.join(root, 'dist', target.pathname.slice(1))), `Broken route ${match[1]} in ${file}`);
    }
  }
});

test('imported programs use verified semester navigation and named subjects', () => {
  const metadata = JSON.parse(read('data/gtu-subjects.json')).subjects;
  for (const stream of site.streams) {
    const catalog = JSON.parse(read(stream.file));
    for (const branch of catalog.branches) {
      assert.notEqual(branch.id, 'official-papers');
      for (const semester of branch.semesters) {
        assert.notEqual(semester.id, 'unclassified');
        for (const subject of semester.subjects) {
          if (!subject.verificationSource) continue;
          const verified = metadata[`${catalog.gtuCourseCode}/${subject.code}`];
          assert.ok(verified, `Unverified subject ${subject.code}`);
          assert.equal(subject.name, verified.name);
          assert.equal(semester.id, verified.periodType === 'semester' ? String(verified.period) : `year-${verified.period}`);
          assert.equal(subject.verificationSource, verified.source);
        }
      }
    }
    if (catalog.imported && catalog.branches.length) {
      assert.ok(!catalog.directSemesters);
      assert.ok(catalog.branches.every((branch) => branch.name && branch.id !== 'additional-papers'));
    }
  }
  const mca = read('catalog-gtu-mc.html');
  assert.match(mca, /Select your course/);
  const catalog = JSON.parse(read('data/gtu-mc.json'));
  const course = read(`catalog-gtu-mc--${catalog.branches[0].id}.html`);
  assert.match(course, /Select The Semester/);
  assert.match(course, /Semester 3/);
  assert.match(course, /Database Management Systems/);
  assert.match(course, /subject-gtu-mc--4639303\.html/);
  assert.ok(!mca.includes('Subjects by official code'));
  assert.match(read('catalog-gtu-mc--official-papers.html'), /url=catalog-gtu-mc.html/);
  assert.match(read('courses.html'), /Select your stream/);
  assert.match(read('catalog-diploma.html'), /catalog-diploma--electricalengineeriing.html/);
  const electrical = read('catalog-diploma--electricalengineeriing.html');
  assert.match(electrical, /Select The Semester/);
  assert.match(electrical, /class="sub"/);
  assert.ok(!electrical.includes('class="bigcard"'), 'Paper cards should open after choosing a subject');
});

test('historical papers remain in subject records behind subject-page navigation', () => {
  for (const stream of site.streams) {
    const catalog = JSON.parse(read(stream.file));
    assert.equal(catalog.archivePolicy, 'listed-only');
    for (const branch of catalog.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) {
      assert.equal(subject.useExamTemplates, false);
    }
  }
  const catalog = JSON.parse(read('data/gtu-mc.json'));
  const branch = catalog.branches.find((b) => b.semesters.some((s) => s.subjects.some((subject) => subject.code === '4639303')));
  const subject = branch.semesters.flatMap((s) => s.subjects).find((s) => s.code === '4639303');
  assert.ok(subject.papers.some((p) => p.label === 'Winter 2018' && p.path === 'W2018/MC/4639303.pdf'));
  const html = read(`catalog-gtu-mc--${branch.id}.html`);
  assert.match(html, /subject-gtu-mc--4639303\.html/);
  assert.ok(!html.includes('W2018/MC/4639303.pdf'));
});

test('subject pages expose real downloads without JavaScript and consolidate shared subjects', () => {
  const expected = new Map();
  const branches = new Map();
  const sources = JSON.parse(read('data/urls.json'));
  for (const stream of site.streams) {
    const catalog = JSON.parse(read(stream.file));
    for (const branch of catalog.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) {
      const file = `subject-${encodeURIComponent(catalog.id)}--${encodeURIComponent(subject.code)}.html`;
      if (!expected.has(file)) expected.set(file, { code: subject.code, papers: [] });
      expected.get(file).papers.push(...subject.papers);
      const branchFile = `catalog-${catalog.id}--${branch.id}.html`;
      if (!branches.has(branchFile)) branches.set(branchFile, read(branchFile));
      assert.ok(branches.get(branchFile).includes(`href="${file}"`));
    }
  }
  const files = fs.readdirSync(path.join(root, 'dist')).filter((file) => file.startsWith('subject-'));
  assert.equal(files.length, expected.size);
  for (const [file, { code, papers }] of expected) {
    const html = read(file);
    assert.ok(html.includes(code.replaceAll('&', '&amp;')));
    assert.ok(!html.includes('<div id="content"><p class="catalog-message" role="status">Loading question papers'));
    assert.ok(html.includes(`rel="canonical" href="https://paperonboard.in/${file}"`));
    if (papers.length) assert.match(html, /aria-label="Download /);
    const urls = new Set(papers.map((paper) => resolvePaperURL(paper, sources, code)));
    assert.equal([...html.matchAll(/aria-label="Download /g)].length, urls.size, `Missing or duplicate downloads in ${file}`);
    const schema = JSON.parse(html.match(/<script id="page-schema" type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    const crumbs = schema['@graph'].find((item) => item['@type'] === 'BreadcrumbList').itemListElement;
    for (const crumb of crumbs) assert.ok(fs.existsSync(path.join(root, 'dist', new URL(crumb.item).pathname.slice(1) || 'index.html')));
  }
  assert.match(read('subject-gtu-mc--4639303.html'), /W2018\/MC\/4639303.pdf/);
});
