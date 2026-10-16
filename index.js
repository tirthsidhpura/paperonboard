'use strict';

const $ = (id) => document.getElementById(id);
const state = { stream: '', branch: '', semester: '', subject: '', resource: '', q: '', view: '' };
let config;
let catalogs = [];
let entries = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function safeURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, document.baseURI);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
async function readJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}
function resourcesFor(catalog, subject) {
  const resources = [...(subject.papers || [])];
  if (subject.useExamTemplates) for (const exam of catalog.examTemplates || []) {
    resources.push({ label: exam.label, url: exam.url.replaceAll('{code}', encodeURIComponent(subject.code)), type: 'paper', archive: true });
  }
  const seen = new Set();
  return resources.filter((paper) => {
    const url = safeURL(paper.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}
function matchesQuery(entry) {
  return state.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every((token) => entry.searchText.includes(token));
}
function matchingResources(entry) {
  return entry.resources.filter((r) => !state.resource || (r.type || 'paper') === state.resource);
}
function routeURL(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `index.html${params.size ? `?${params}` : ''}`;
}
function routeLink(label, values) {
  const link = element('a', '', label);
  link.href = routeURL(values);
  link.dataset.route = '';
  return link;
}
function entryRoute(entry) {
  return { stream: entry.catalog.id, branch: entry.branch.id, semester: entry.semester.id, subject: entry.subject.code };
}
function banner(title, className = 'headerimg') {
  const header = element('div', className);
  header.append(element('h1', '', title));
  return header;
}
function resourceLink(paper, label = paper.label) {
  const link = element('a', '', label);
  link.href = safeURL(paper.url);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function dropdown(label, items, home = false) {
  const wrapper = element('div', 'subject');
  const button = element('button', home ? 'sub12' : 'sub', label);
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  const menu = element('div', 'paper');
  menu.append(...items);
  button.addEventListener('click', () => {
    const open = wrapper.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  });
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      wrapper.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.blur();
    }
  });
  wrapper.append(button, menu);
  return wrapper;
}
function subjectDropdown(entry, includeContext = false) {
  const links = [routeLink('click here for latest question paper', entryRoute(entry))];
  for (const paper of matchingResources(entry).filter((p) => !p.archive)) links.push(resourceLink(paper));
  const wrapper = dropdown(`${entry.subject.name} - ${entry.subject.code}`, links);
  if (includeContext) wrapper.prepend(element('p', 'catalog-meta', `${entry.catalog.name} · ${entry.branch.name} · ${entry.semester.name}`));
  return wrapper;
}
function courseBoxes() {
  const boxes = element('div', 'coarsename');
  for (const stream of config.streams.filter((s) => catalogs.some((c) => c.id === s.id))) {
    const heading = element('h1');
    heading.append(routeLink(stream.name, { stream: stream.id }));
    boxes.append(heading);
  }
  return boxes;
}
function home() {
  const hero = element('div', 'bg');
  hero.id = 'container1';
  const both = element('div', 'both');
  const heading = element('div', 'heading');
  for (const line of ['More than', '3000+', 'Papers']) heading.append(element('h1', '', line));
  const subjects = element('div', 'subjects');
  const links = config.streams.filter((s) => catalogs.some((c) => c.id === s.id)).map((s) => routeLink(s.name, { stream: s.id }));
  links.push(routeLink('VIEW MORE', { view: 'courses' }));
  subjects.append(dropdown('Select your course', links, true));
  both.append(heading, subjects);
  hero.append(both);
  return hero;
}
function controls(items) {
  const row = element('div', 'catalog-controls');
  row.append(...items);
  return row;
}
function renderBranch(catalog, branch, content) {
  content.append(banner(`${branch.name} Question Paper`, 'headerimg1'));
  content.append(controls([routeLink('← Select course', {}), routeLink('← Select branch', { stream: catalog.id })]));
  const chooser = element('section');
  chooser.id = 'selectsemester';
  const title = element('div', 'semhead');
  title.append(element('h1', '', 'Select The Semester'));
  const sequence = element('div', 'semseq');
  for (const semester of branch.semesters) {
    const heading = element('h1');
    const link = element('a', '', semester.name);
    link.href = `#sem-${semester.id}`;
    heading.append(link);
    sequence.append(heading);
  }
  chooser.append(title, sequence);
  content.append(chooser, element('hr'));
  // As in the original pages, all semesters remain available on the branch view.
  for (const semester of branch.semesters) {
    const section = element('section', 'sem');
    section.id = `sem-${semester.id}`;
    const title = element('div', 'semhead');
    title.append(element('h1', '', semester.name));
    section.append(title);
    const subjects = element('div', 'subjects');
    const found = entries.filter((e) => e.catalog.id === catalog.id && e.branch.id === branch.id && e.semester.id === semester.id);
    for (const entry of found) subjects.append(subjectDropdown(entry));
    if (!found.length) subjects.append(element('p', 'catalog-message', 'Nothing here yet. Papers will be added soon.'));
    section.append(subjects);
    content.append(section, element('hr'));
  }
}
function renderSubject(entry, content) {
  content.append(banner(`${entry.subject.name} - ${entry.subject.code}`, 'headerimg1'));
  const select = element('select');
  select.setAttribute('aria-label', 'Resource type');
  for (const [value, label] of [['', 'All resources'], ['paper', 'Question papers'], ['material', 'Study material']]) {
    const option = element('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = state.resource;
  select.addEventListener('change', () => navigate(routeURL({ ...entryRoute(entry), resource: select.value })));
  content.append(controls([routeLink('← Back to subjects', { stream: entry.catalog.id, branch: entry.branch.id }), select]));
  const wrapper = element('div', 'table-wrap');
  const table = element('table');
  table.id = 'qp';
  const head = element('thead');
  const row = element('tr');
  for (const label of ['Subject Name', 'Subject Code', 'Examination / Material', 'Download Link']) {
    const cell = element('th', '', label); cell.scope = 'col'; row.append(cell);
  }
  head.append(row);
  const body = element('tbody');
  const resources = matchingResources(entry);
  for (const paper of resources) {
    const row = element('tr');
    row.append(element('td', '', entry.subject.name), element('td', '', entry.subject.code), element('td', '', paper.label));
    const download = element('td');
    download.append(resourceLink(paper, 'Download'));
    row.append(download);
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  content.append(wrapper);
  if (!resources.length) content.append(element('p', 'catalog-message', 'No resources have been added yet.'));
  if (resources.some((p) => p.archive)) content.append(element('p', 'catalog-message', 'Some GTU archive sessions may not have a paper for this subject.'));
}
function render() {
  const content = $('content');
  content.replaceChildren();
  const catalog = catalogs.find((c) => c.id === state.stream);
  const branch = catalog?.branches.find((b) => b.id === state.branch);
  const entry = entries.find((e) => e.catalog.id === state.stream && e.branch.id === state.branch && e.semester.id === state.semester && e.subject.code === state.subject);
  const isHome = !state.q && !catalog && state.view !== 'courses';
  $('announcement').hidden = !isHome;
  document.querySelector('.about').hidden = !isHome;
  document.title = entry ? `${entry.subject.name} Question Paper | ${config.name}` : branch ? `${branch.name} Question Paper | ${config.name}` : config.name;
  if (state.q) {
    content.append(banner(`Search question papers: ${state.q}`));
    content.append(controls([routeLink('Clear search', {}), routeLink('Select course', { view: 'courses' })]));
    const found = entries.filter(matchesQuery);
    const status = element('p', 'catalog-message', `${found.length} subjects found`);
    status.setAttribute('role', 'status');
    content.append(status);
    const results = element('div', 'subjects');
    for (const entry of found) results.append(subjectDropdown(entry, true));
    content.append(results);
    if (!found.length) content.append(element('p', 'catalog-message', 'No papers found. Try a subject name or code.'));
  } else if (entry) renderSubject(entry, content);
  else if (branch) renderBranch(catalog, branch, content);
  else if (catalog) {
    content.append(banner(`GTU ${catalog.name} Question Paper`));
    const courses = element('section');
    courses.id = 'coarsenames';
    const label = element('div', 'coarsename');
    const heading = element('h1', '', 'UPDATED SYLLABUS!!');
    heading.style.backgroundColor = '#1D8471';
    label.append(heading);
    const boxes = element('div', 'coarsename');
    for (const branch of catalog.branches) {
      const heading = element('h1');
      heading.append(routeLink(branch.name, { stream: catalog.id, branch: branch.id }));
      boxes.append(heading);
    }
    courses.append(label, boxes);
    content.append(courses, controls([routeLink('← Select course', {})]));
  } else if (state.view === 'courses') content.append(banner('Select your course'), courseBoxes());
  else content.append(home());
}
function restoreURL() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state)) state[key] = params.get(key) || '';
  if (!['', 'paper', 'material'].includes(state.resource)) state.resource = '';
  $('search').value = state.q;
  render();
}
function navigate(url) {
  history.pushState(null, '', url);
  restoreURL();
  setMenuOpen(false);
  window.scrollTo(0, 0);
}
function setMenuOpen(open) {
  $('nav-list').classList.toggle('menu-open', open);
  $('open-nav').setAttribute('aria-expanded', String(open));
}
function setSearchOpen(open) {
  $('search-panel').hidden = !open;
  $('search-toggle').setAttribute('aria-expanded', String(open));
  (open ? $('search') : $('search-toggle')).focus();
}
async function initialize() {
  try {
    config = await readJSON('data/site.json');
    const loaded = await Promise.allSettled(config.streams.map(async (stream) => {
      const catalog = await readJSON(stream.file);
      if (catalog.id !== stream.id || !Array.isArray(catalog.branches)) throw new Error(`Invalid catalog ${stream.file}`);
      return catalog;
    }));
    catalogs = loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = loaded.map((r, i) => r.status === 'rejected' ? config.streams[i].name : null).filter(Boolean);
    if (failed.length) {
      $('load-error').hidden = false;
      $('load-error').textContent = `Could not load ${failed.join(', ')}. Reload to try again.`;
    }
    if (!catalogs.length) throw new Error('No catalogs available');
    for (const catalog of catalogs) for (const branch of catalog.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) {
      const resources = resourcesFor(catalog, subject);
      entries.push({ catalog, branch, semester, subject, resources, searchText: [catalog.name, branch.name, semester.name, subject.name, subject.code, ...resources.map((p) => p.label)].join(' ').toLocaleLowerCase() });
    }
    if (config.announcement) $('announcement-text').textContent = config.announcement;
    restoreURL();
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-route]');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.href);
    });
    $('open-nav').addEventListener('click', () => setMenuOpen(true));
    $('close-nav').addEventListener('click', () => setMenuOpen(false));
    $('search-toggle').addEventListener('click', () => setSearchOpen($('search-panel').hidden));
    $('close-search').addEventListener('click', () => setSearchOpen(false));
    $('search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = $('search').value.trim();
      if (!query) return;
      navigate(routeURL({ q: query }));
      setSearchOpen(false);
      $('library').focus();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { setMenuOpen(false); if (!$('search-panel').hidden) setSearchOpen(false); }
      if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); setSearchOpen(true); }
    });
    window.addEventListener('popstate', restoreURL);
  } catch (error) {
    console.error('Library loading failed:', error);
    $('load-error').hidden = false;
    $('load-error').textContent = 'The paper catalog could not load. Use a static HTTP server (see README), check the data files, and reload.';
    $('content').replaceChildren(element('p', 'catalog-message', 'Question papers are temporarily unavailable.'));
  }
}
initialize();
