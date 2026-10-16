'use strict';

import { resolvePaperURL, validateURLSources } from './paper-urls.js';

const $ = (id) => document.getElementById(id);
const state = { stream: '', branch: '', semester: '', subject: '', resource: '', q: '', view: '' };
let config;
let urlSources;
let catalogs = [];
let entries = [];
let contributorsData = { repository: null, updatedAt: null, contributors: [] };
let renderedRoute = '';
let scrollFrame = null;

function cancelScrollAnimation() {
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  scrollFrame = null;
}

function scrollToSection(hash, animate = true, updateHistory = false) {
  let target;
  try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return false; }
  if (!hash || !target) return false;
  cancelScrollAnimation();
  const start = window.scrollY;
  const end = target.getBoundingClientRect().top + start;
  const finish = () => {
    scrollFrame = null;
    if (updateHistory && location.hash !== hash) history.pushState(null, '', hash);
  };
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, end);
    finish();
    return true;
  }
  const started = performance.now();
  const step = (now) => {
    const progress = Math.min((now - started) / 800, 1);
    // Match the original jQuery 800 ms animation and its default "swing" easing.
    const eased = (1 - Math.cos(Math.PI * progress)) / 2;
    window.scrollTo(0, start + (end - start) * eased);
    if (progress < 1) scrollFrame = requestAnimationFrame(step);
    else finish();
  };
  scrollFrame = requestAnimationFrame(step);
  return true;
}

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
  const resources = (subject.papers || []).map((paper) => ({ ...paper, url: resolvePaperURL(paper, urlSources, subject.code) }));
  if (subject.useExamTemplates) for (const exam of catalog.examTemplates || []) {
    resources.push({ label: exam.label, url: resolvePaperURL(exam, urlSources, subject.code), type: 'paper', archive: true });
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
  const page = element('div', 'landing');
  page.id = 'container1';
  const hero = element('section', 'landing-hero premium-wrap');
  const copy = element('div', 'hero-copy');
  copy.append(element('p', 'premium-eyebrow', 'FOR THE NEXT CHAPTER'));
  const title = element('h1');
  title.append(element('span', '', 'Less searching.'), element('span', 'hero-accent', 'More prepared.'));
  copy.append(title, element('p', 'hero-lead', 'Your next exam deserves a better starting point. Find GTU question papers, revisit the essentials, and make your study time count.'));
  const actions = element('div', 'premium-actions');
  const browse = element('a', 'premium-button', 'Find my papers ↗');
  browse.href = '#choose-course';
  const search = element('button', 'premium-button secondary', 'Search a subject');
  search.type = 'button';
  search.addEventListener('click', () => setSearchOpen(true));
  actions.append(browse, search);
  copy.append(actions, element('p', 'hero-footnote', 'Free to access. No account needed.'));
  const art = element('div', 'study-art');
  art.setAttribute('aria-hidden', 'true');
  // Decorative paper composition; all catalog data is rendered separately as text.
  art.innerHTML = '<div class="art-grid"></div><span class="art-caption">A LITTLE PREPARATION GOES A LONG WAY</span><div class="study-sheet back-sheet"></div><div class="study-sheet front-sheet"><div class="sheet-masthead"><span>PAPERONBOARD</span><span>STUDY / 01</span></div><div class="sheet-divider"></div><p>YOUR NEXT CHAPTER</p><strong>Start here.<br>Go further.</strong><div class="sheet-line"></div><div class="sheet-line short"></div><div class="sheet-question"><span>01</span><i></i></div><div class="sheet-question"><span>02</span><i></i></div><div class="sheet-question"><span>03</span><i></i></div><div class="sheet-footer">PAST PAPERS. NEW POSSIBILITIES. <b>↗</b></div></div><div class="study-note-chip"><span>✓</span> One step closer.</div><span class="art-spark">✳</span>';
  hero.append(copy, art);
  page.append(hero);
  const stats = element('div', 'premium-stats premium-wrap');
  const uniqueSubjects = new Set(entries.map((e) => `${e.catalog.id}/${e.subject.code}`)).size;
  for (const [value, label] of [[String(catalogs.length).padStart(2, '0'), 'streams to explore'], [uniqueSubjects.toLocaleString(), 'subjects in the library'], ['100%', 'free to access']]) {
    const item = element('div');
    item.append(element('strong', '', value), element('span', '', label));
    stats.append(item);
  }
  page.append(stats);
  const courses = element('section', 'premium-section premium-wrap');
  courses.id = 'choose-course';
  courses.append(sectionIntro('THE PAPER LIBRARY', 'Your course. Your next step.', 'Choose your stream, then find your branch and semester.'));
  const grid = element('div', 'premium-course-grid');
  for (const stream of config.streams.filter((s) => catalogs.some((c) => c.id === s.id))) {
    const catalog = catalogs.find((c) => c.id === stream.id);
    const link = routeLink('', { stream: stream.id });
    link.className = 'premium-course';
    const top = element('div', 'course-top');
    top.append(element('span', 'course-mark', stream.shortName), element('span', 'course-arrow', '↗'));
    link.append(top, element('h3', '', stream.name), element('p', '', stream.description), element('span', 'course-count', `${catalog.branches.length} ${catalog.branches.length === 1 ? 'branch' : 'branches'} · Explore papers`));
    grid.append(link);
  }
  courses.append(grid);
  page.append(courses);
  const how = element('section', 'how-section');
  const inner = element('div', 'premium-wrap how-layout');
  inner.append(sectionIntro('LESS FRICTION, MORE FOCUS', 'From finding to studying.\nIn three simple steps.', 'Spend your time on what matters: understanding the subject.'));
  const steps = element('ol', 'premium-steps');
  for (const [title, description] of [['Find your subject', 'Choose your course and semester, or search by subject name or code.'], ['Pick a paper', 'Open a subject to browse its available exam sessions and resources.'], ['Make it a practice run', 'Set a timer, work through the questions, and revisit what needs attention.']]) {
    const item = element('li');
    item.append(element('h3', '', title), element('p', '', description));
    steps.append(item);
  }
  inner.append(steps);
  how.append(inner);
  page.append(how, communityCTA());
  return page;
}

function sectionIntro(eyebrow, title, description) {
  const intro = element('div', 'premium-intro');
  intro.append(element('p', 'premium-eyebrow', eyebrow), element('h2', '', title), element('p', '', description));
  return intro;
}

function communityCTA() {
  const section = element('section', 'community-cta premium-wrap');
  const copy = element('div');
  copy.append(element('p', 'premium-eyebrow', 'BUILT TOGETHER'), element('h2', '', 'The next student\nstarts with you.'), element('p', '', 'A missing paper. A corrected link. A better experience. Every contribution helps someone move forward.'));
  const link = routeLink('Meet the community ↗', { view: 'contributors' });
  link.className = 'premium-button light-button';
  section.append(copy, link);
  return section;
}

function contributorsPage() {
  const page = element('div', 'contributors-page premium-wrap');
  const hero = element('section', 'contributors-hero');
  hero.append(element('p', 'premium-eyebrow', 'THE PEOPLE BEHIND THE PAPERS'), element('h1', '', 'A shared effort.\nA better starting point.'), element('p', 'hero-lead', 'For every student who finds the right paper, someone helped put it here. This is where we celebrate those contributions.'));
  const guide = element('a', 'premium-button', 'Make your first contribution ↗');
  guide.href = '#how-to-contribute';
  hero.append(guide);
  page.append(hero);
  const list = element('section', 'contributors-list');
  list.append(sectionIntro('OUR CONTRIBUTORS', 'Small contributions. Lasting impact.', 'Authors of merged pull requests are added here automatically when the site deploys.'));
  if (contributorsData.contributors.length) {
    const grid = element('div', 'contributors-grid');
    for (const person of contributorsData.contributors) {
      const card = element('article', 'contributor-card');
      const avatar = element('span', 'contributor-avatar', person.login.slice(0, 2).toUpperCase());
      card.append(avatar, element('h3', '', person.login), element('p', '', `${person.mergedPRs} merged ${person.mergedPRs === 1 ? 'pull request' : 'pull requests'}`));
      const profile = element('a', '', 'GitHub profile ↗');
      profile.href = `https://github.com/${encodeURIComponent(person.login)}`;
      profile.target = '_blank'; profile.rel = 'noopener noreferrer';
      card.append(profile);
      grid.append(card);
    }
    list.append(grid);
  } else {
    const empty = element('div', 'community-empty');
    empty.append(element('span', 'empty-contribution-mark', '+'), element('h3', '', contributorsData.unavailable ? 'The contributor list is taking a moment.' : 'There’s a place here for you.'), element('p', '', contributorsData.unavailable ? 'Please reload to try again. You can still follow the contribution guide below.' : 'Our community is just getting started. Merged contributions will appear here as the project grows.'));
    list.append(empty);
  }
  if (contributorsData.repository) {
    const repo = element('a', 'repository-link', 'Explore the project on GitHub ↗');
    repo.href = `https://github.com/${contributorsData.repository}`;
    repo.target = '_blank'; repo.rel = 'noopener noreferrer';
    list.append(repo);
  }
  page.append(list);
  const how = element('section', 'contribute-how');
  how.id = 'how-to-contribute';
  how.append(sectionIntro('YOUR FIRST CONTRIBUTION', 'You don’t have to be a developer.', 'A useful paper or a working link is a great place to start.'));
  const steps = element('ol', 'premium-steps');
  for (const [title, text] of [['Find something worth sharing', 'Check the subject code, semester, and exam session. Use a public link to a paper you have permission to share.'], ['Add it to the catalog', 'Follow the examples in our contribution guide to add the paper to the JSON file for your stream.'], ['Open a pull request', 'Once your change is reviewed and merged, the site updates and your GitHub profile joins this page.']]) {
    const li = element('li'); li.append(element('h3', '', title), element('p', '', text)); steps.append(li);
  }
  const docs = element('a', 'premium-button', 'Read the contribution guide ↗');
  docs.href = 'CONTRIBUTING.md';
  how.append(steps, docs);
  page.append(how);
  return page;
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
  select.addEventListener('change', () => navigate(routeURL({ ...entryRoute(entry), resource: select.value }), { preserveScroll: true }));
  content.append(controls([routeLink('← Back to subjects', { stream: entry.catalog.id, branch: entry.branch.id }), select]));
  const cards = element('div', 'bigcard');
  const resources = matchingResources(entry);
  for (const paper of resources) {
    const card = element('article', 'card');
    card.append(element('h2', 'card-header', entry.subject.name));
    const body = element('div', 'card-body');
    for (const [label, value] of [
      ['Subject Code: ', entry.subject.code],
      [(paper.type || 'paper') === 'material' ? 'Study Material: ' : 'Examination: ', paper.label],
    ]) {
      const detail = element('p');
      detail.append(element('strong', '', label), element('span', '', value));
      body.append(detail);
    }
    const download = resourceLink(paper, 'Download');
    download.className = 'btn';
    body.append(download);
    card.append(body);
    cards.append(card);
  }
  content.append(cards);
  if (!resources.length) content.append(element('p', 'catalog-message', 'No resources have been added yet.'));
  if (resources.some((p) => p.archive)) content.append(element('p', 'catalog-message', 'Some GTU archive sessions may not have a paper for this subject.'));
}
function render() {
  const content = $('content');
  content.replaceChildren();
  const catalog = catalogs.find((c) => c.id === state.stream);
  const branch = catalog?.branches.find((b) => b.id === state.branch);
  const entry = entries.find((e) => e.catalog.id === state.stream && e.branch.id === state.branch && e.semester.id === state.semester && e.subject.code === state.subject);
  const isContributors = !state.q && !catalog && state.view === 'contributors';
  const isHome = !state.q && !catalog && !['courses', 'contributors'].includes(state.view);
  document.body.classList.toggle('modern-page', isHome || isContributors);
  $('oldpaper').hidden = isHome || isContributors;
  $('announcement').hidden = true;
  document.querySelector('.about').hidden = true;
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
  } else if (isContributors) {
    document.title = `Contributors | ${config.name}`;
    content.append(contributorsPage());
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
  renderedRoute = `${location.pathname}${location.search}`;
}
function navigate(url, { preserveScroll = false } = {}) {
  cancelScrollAnimation();
  const previousY = window.scrollY;
  history.pushState(null, '', url);
  restoreURL();
  setMenuOpen(false);
  if (!scrollToSection(location.hash, false)) window.scrollTo(0, preserveScroll ? previousY : 0);
}
function setMenuOpen(open) {
  $('nav-list').classList.toggle('menu-open', open);
  $('open-nav').setAttribute('aria-expanded', String(open));
}
function setSearchOpen(open) {
  $('search-panel').hidden = !open;
  $('search-toggle').setAttribute('aria-expanded', String(open));
  (open ? $('search') : $('search-toggle')).focus({ preventScroll: true });
}
async function initialize() {
  try {
    [config, urlSources, contributorsData] = await Promise.all([readJSON('data/site.json'), readJSON('data/urls.json'), readJSON('data/contributors.json').catch(() => ({ repository: null, contributors: [], unavailable: true }))]);
    validateURLSources(urlSources);
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
    // Catalogs load asynchronously, so fragment targets only exist after render.
    if (location.hash) requestAnimationFrame(() => scrollToSection(location.hash, false));
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (link.hasAttribute('data-route')) {
        event.preventDefault();
        navigate(link.href);
      } else {
        const destination = new URL(link.href, document.baseURI);
        if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search && destination.hash && scrollToSection(destination.hash, true, true)) {
          event.preventDefault();
        }
      }
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
      $('library').focus({ preventScroll: true });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { setMenuOpen(false); if (!$('search-panel').hidden) setSearchOpen(false); }
      if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); setSearchOpen(true); }
    });
    window.addEventListener('popstate', () => {
      cancelScrollAnimation();
      // Let native history restore scroll; hash-only history must not rebuild the page.
      if (renderedRoute !== `${location.pathname}${location.search}`) restoreURL();
    });
    window.addEventListener('wheel', cancelScrollAnimation, { passive: true });
    window.addEventListener('touchstart', cancelScrollAnimation, { passive: true });
  } catch (error) {
    console.error('Library loading failed:', error);
    $('load-error').hidden = false;
    $('load-error').textContent = 'The paper catalog could not load. Use a static HTTP server (see README), check the data files, and reload.';
    $('content').replaceChildren(element('p', 'catalog-message', 'Question papers are temporarily unavailable.'));
  }
}
initialize();
