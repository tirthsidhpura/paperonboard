'use strict';

// Every option and paper comes from data/. No framework or backend is needed.
const $ = (id) => document.getElementById(id);
const state = { stream: '', branch: '', semester: '', resource: '', q: '' };
const PAGE_SIZE = 24;
let config;
let catalogs = [];
let entries = [];
let visibleCount = PAGE_SIZE;

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
  if (subject.useExamTemplates) {
    for (const exam of catalog.examTemplates || []) {
      resources.push({ label: exam.label, url: exam.url.replaceAll('{code}', encodeURIComponent(subject.code)), type: 'paper', archive: true });
    }
  }
  const seen = new Set();
  return resources.filter((paper) => {
    const url = safeURL(paper.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function updateURL() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value) params.set(key, value);
  const query = params.toString();
  const url = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.pushState(null, '', url);
}

function restoreURL() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state)) state[key] = params.get(key) || '';
  if (!catalogs.some((c) => c.id === state.stream)) state.stream = '';
  const catalog = catalogs.find((c) => c.id === state.stream);
  const branch = catalog?.branches.find((b) => b.id === state.branch);
  if (!branch) state.branch = '';
  if (!branch?.semesters.some((s) => s.id === state.semester)) state.semester = '';
  if (!['', 'paper', 'material'].includes(state.resource)) state.resource = '';
  $('search').value = state.q;
  $('resource').value = state.resource;
  if (state.q) setSearchOpen(true, false);
  visibleCount = PAGE_SIZE;
  render();
}

function fillSelect(select, placeholder, options, value, disabled) {
  select.replaceChildren();
  const first = element('option', '', placeholder);
  first.value = '';
  select.append(first);
  for (const option of options) {
    const node = element('option', '', option.name);
    node.value = option.id;
    select.append(node);
  }
  select.value = value;
  select.disabled = disabled;
}

function renderFilters() {
  for (const button of $('stream-tabs').children) button.setAttribute('aria-pressed', String(button.dataset.stream === state.stream));
  const catalog = catalogs.find((c) => c.id === state.stream);
  const branch = catalog?.branches.find((b) => b.id === state.branch);
  fillSelect($('branch'), catalog ? 'All branches' : 'Choose a stream first', catalog?.branches || [], state.branch, !catalog);
  fillSelect($('semester'), branch ? 'All semesters' : 'Choose a branch first', branch?.semesters || [], state.semester, !branch);
  $('resource').value = state.resource;
}

function matchesQuery(entry) {
  const tokens = state.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return tokens.every((token) => entry.searchText.includes(token));
}

function matchingResources(entry) {
  return entry.resources.filter((r) => !state.resource || (r.type || 'paper') === state.resource);
}

function subjectCard(entry) {
  const card = element('details', 'subject-card');
  const summary = element('summary');
  const top = element('div', 'subject-top');
  top.append(element('span', 'subject-code', entry.subject.code), element('span', '', entry.semester.name));
  summary.append(top, element('h4', '', entry.subject.name), element('p', 'subject-meta', `${entry.catalog.name} · ${entry.branch.name}`));
  const resources = matchingResources(entry);
  const bottom = element('div', 'subject-bottom');
  bottom.append(element('span', '', `${resources.length} resource${resources.length === 1 ? '' : 's'}`), element('span', 'expand-arrow', '↓'));
  summary.append(bottom);
  card.append(summary);
  // Build resource links only when expanded, keeping large catalogs responsive.
  card.addEventListener('toggle', () => {
    if (!card.open || card.childElementCount > 1) return;
    const list = element('div', 'paper-list');
    if (!resources.length) list.append(element('p', 'archive-note', 'No papers added yet. You can help by contributing a link.'));
    for (const paper of resources) {
      const link = element('a', 'paper-link');
      link.href = safeURL(paper.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const label = element('span', '', paper.label);
      label.append(element('small', '', (paper.type || 'paper') === 'material' ? 'Study material · Opens in a new tab' : 'Question paper · Opens in a new tab'));
      link.append(label, element('span', '', '↗'));
      list.append(link);
    }
    if (resources.some((r) => r.archive)) list.append(element('p', 'archive-note', 'GTU archive links are carried over from the original site. Availability depends on GTU; some sessions may not have a paper for this subject.'));
    card.append(list);
  });
  return card;
}

function empty(title, description) {
  const box = element('div', 'empty-state');
  box.append(element('span', 'empty-symbol', '⌑'), element('strong', '', title), element('p', '', description));
  return box;
}

function render() {
  renderFilters();
  const active = state.stream || state.q || state.resource;
  const filtered = active ? entries.filter((entry) =>
    (!state.stream || entry.catalog.id === state.stream) &&
    (!state.branch || entry.branch.id === state.branch) &&
    (!state.semester || entry.semester.id === state.semester) &&
    matchesQuery(entry) && (!state.resource || matchingResources(entry).length)
  ) : [];
  const catalog = catalogs.find((c) => c.id === state.stream);
  const branch = catalog?.branches.find((b) => b.id === state.branch);
  const semester = branch?.semesters.find((s) => s.id === state.semester);
  $('results-title').textContent = state.q ? `Results for “${state.q}”` : semester ? `${branch.name} · ${semester.name}` : branch?.name || catalog?.name || (active ? 'Your resources' : 'A whole semester of possibilities.');
  $('results-description').textContent = active ? `${filtered.length} subject${filtered.length === 1 ? '' : 's'} found · Select a subject to see its papers.` : 'Choose a stream above, or search for a subject in the navigation.';
  $('clear-search').hidden = !state.q;
  const container = $('results');
  container.replaceChildren();
  if (!active) container.append(empty('Your next step starts with a stream.', 'Diploma, engineering, architecture, or pharmacy — pick yours above.'));
  else if (!filtered.length) container.append(empty('No matching subjects yet.', 'Try a shorter search, a subject code, or reset your filters.'));
  else {
    const fragment = document.createDocumentFragment();
    for (const entry of filtered.slice(0, visibleCount)) fragment.append(subjectCard(entry));
    container.append(fragment);
  }
  $('load-more').hidden = filtered.length <= visibleCount;
  $('results-status').textContent = active ? `${filtered.length} matching subjects. Showing ${Math.min(filtered.length, visibleCount)}.` : 'Choose a stream to browse papers.';
}

function change(values) {
  Object.assign(state, values);
  visibleCount = PAGE_SIZE;
  updateURL();
  render();
}

function setSearchOpen(open, focus = true) {
  $('search-panel').hidden = !open;
  $('search-toggle').setAttribute('aria-expanded', String(open));
  if (focus) (open ? $('search') : $('search-toggle')).focus();
}

function search() {
  change({ q: $('search').value.trim(), stream: '', branch: '', semester: '' });
  $('library').scrollIntoView({ behavior: 'smooth' });
}

async function initialize() {
  try {
    config = await readJSON('data/site.json');
    if (!Array.isArray(config.streams) || !config.streams.length) throw new Error('The stream registry is empty.');
    document.title = `${config.name} · Your study head start`;
    document.querySelectorAll('[data-brand]').forEach((node) => { node.textContent = config.name; });
    document.querySelector('.brand').setAttribute('aria-label', `${config.name} home`);
    $('tagline').textContent = config.tagline;
    const loaded = await Promise.allSettled(config.streams.map(async (stream) => {
      const catalog = await readJSON(stream.file);
      if (catalog.id !== stream.id || !Array.isArray(catalog.branches)) throw new Error(`Invalid catalog: ${stream.file}`);
      return catalog;
    }));
    catalogs = loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failures = loaded.map((result, i) => result.status === 'rejected' ? config.streams[i].name : null).filter(Boolean);
    if (failures.length) {
      $('load-error').hidden = false;
      $('load-error').textContent = `Could not load: ${failures.join(', ')}. Other streams are available. Reload to try again.`;
    }
    if (!catalogs.length) throw new Error('No catalogs could be loaded.');
    for (const stream of config.streams) {
      const catalog = catalogs.find((c) => c.id === stream.id);
      if (!catalog) continue;
      const button = element('button', 'stream-card');
      button.type = 'button';
      button.dataset.stream = stream.id;
      button.setAttribute('aria-pressed', 'false');
      button.append(element('span', 'stream-short', stream.shortName), element('span', 'stream-arrow', '↗'), element('strong', '', stream.name), element('small', '', stream.description));
      button.addEventListener('click', () => change({ stream: stream.id, branch: '', semester: '' }));
      $('stream-tabs').append(button);
      for (const branch of catalog.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) {
        const resources = resourcesFor(catalog, subject);
        entries.push({ catalog, branch, semester, subject, resources, searchText: [catalog.name, branch.name, semester.name, subject.code, subject.name, ...resources.map((p) => `${p.label} ${p.type || 'paper'}`)].join(' ').toLocaleLowerCase() });
      }
    }
    $('subject-count').textContent = entries.length.toLocaleString();
    $('stream-count').textContent = catalogs.length;
    restoreURL();
    $('branch').addEventListener('change', (e) => change({ branch: e.target.value, semester: '' }));
    $('semester').addEventListener('change', (e) => change({ semester: e.target.value }));
    $('resource').addEventListener('change', (e) => change({ resource: e.target.value }));
    $('reset').addEventListener('click', () => { $('search').value = ''; change({ stream: '', branch: '', semester: '', resource: '', q: '' }); });
    $('clear-search').addEventListener('click', () => { $('search').value = ''; change({ q: '' }); });
    $('load-more').addEventListener('click', () => { const oldCount = visibleCount; visibleCount += PAGE_SIZE; render(); $('results').children[oldCount]?.querySelector('summary')?.focus(); });
    $('search-toggle').addEventListener('click', () => setSearchOpen($('search-panel').hidden));
    $('close-search').addEventListener('click', () => setSearchOpen(false));
    $('search-form').addEventListener('submit', (event) => { event.preventDefault(); search(); });
    $('search').addEventListener('input', () => { if (!$('search').value) change({ q: '' }); });
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); setSearchOpen(true); }
      if (event.key === 'Escape' && !$('search-panel').hidden) setSearchOpen(false);
    });
    window.addEventListener('popstate', restoreURL);
  } catch (error) {
    console.error('Library loading failed:', error);
    $('load-error').hidden = false;
    $('load-error').textContent = 'The library could not load. Serve this folder with a static HTTP server (see README), check the data files, then reload.';
    $('results-title').textContent = 'The library is temporarily unavailable.';
    $('results-description').textContent = 'Please reload to try again.';
  }
}

initialize();
