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
  return entry.resources.filter((r) => !state.resource || (r.type || 'paper') === state.resource)
    .sort((a, b) => examOrder(a) - examOrder(b));
}
function examOrder(resource) {
  // Undated resources stay after dated papers, in their original order.
  const match = (resource.label || '').match(/\b(sum+er|winter)\s+((?:19|20)\d\s?\d)/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const year = Number(match[2].replace(/\s/g, ''));
  return year * 2 + (match[1].toLowerCase() === 'winter' ? 1 : 0);
}
function routeURL(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  if (values.stream && !values.subject && !values.q && !values.semester) {
    return `catalog-${encodeURIComponent(values.stream)}${values.branch ? '--' + encodeURIComponent(values.branch) : ''}.html`;
  }
  if (values.view === 'courses' && !values.q) return 'courses.html';
  if (values.view === 'contributors' && !values.q) return 'contributors.html';
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
  if (config.latestSession) header.append(element('p', 'session-banner', `${config.latestSession} archive links added · Availability varies by subject`));
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
  const hero = element('div', 'bg shared-hero');
  hero.id = 'container1';
  const both = element('div', 'both');
  const heading = element('div', 'heading');
  heading.append(element('p', 'hero-kicker', `${config.latestSession || 'Latest'} papers now available` ), element('h1', '', 'Your next exam.\nA better starting point.'), element('p', 'shared-hero-description', 'Find previous-year papers by course, branch and semester. Free to access. Built together by students.'));
  const subjects = element('div', 'subjects');
  const links = config.streams.filter((stream) => catalogs.some((catalog) => catalog.id === stream.id)).slice(0, 8)
    .map((stream) => routeLink(stream.name, { stream: stream.id }));
  links.push(routeLink('VIEW MORE', { view: 'courses' }));
  subjects.append(dropdown('Select your stream', links, true));
  both.append(heading, subjects);
  hero.append(both);
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
  for (const stream of config.streams.filter((s) => catalogs.some((c) => c.id === s.id)).slice(0, 8)) {
    const catalog = catalogs.find((c) => c.id === stream.id);
    const link = routeLink('', { stream: stream.id });
    link.className = 'premium-course';
    const top = element('div', 'course-top');
    top.append(element('span', 'course-mark', stream.shortName), element('span', 'course-arrow', '↗'));
    link.append(top, element('h3', '', stream.name), element('p', '', stream.description), element('span', 'course-count', catalog.imported ? 'Browse official subject codes' : `${catalog.branches.length} ${catalog.branches.length === 1 ? 'branch' : 'branches'} · Explore papers`));
    grid.append(link);
  }
  courses.append(grid, controls([routeLink('Browse all GTU courses →', { view: 'courses' })]));
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
  const github = element('a', 'premium-button light-button', 'Open source on GitHub ↗');
  github.href = 'https://github.com/tirthsidhpura/paperonboard';
  github.target = '_blank';
  github.rel = 'noopener noreferrer';
  const actions = element('div', 'community-actions');
  actions.append(link, github);
  section.append(copy, actions);
  return section;
}

function contributorsPage() {
  const page = element('div', 'contributors-page');
  const hero = element('section', 'bg shared-hero');
  const both = element('div', 'both');
  const heading = element('div', 'heading');
  heading.append(element('p', 'hero-kicker', 'THE PEOPLE BEHIND THE PAPERS'), element('h1', '', 'Built by students.\nFor every student.'), element('p', 'shared-hero-description', 'Meet the people adding papers, fixing links and making exam preparation easier for everyone.'));
  const guide = element('a', 'premium-button light-button', 'Start contributing ↗');
  guide.href = '#how-to-contribute';
  const actions = element('div', 'hero-actions');
  actions.append(guide);
  both.append(heading, actions);
  hero.append(both);
  page.append(hero);
  const list = element('section', 'contributors-list');
  list.append(sectionIntro('OUR CONTRIBUTORS', 'Small contributions. Lasting impact.', 'Authors of merged pull requests are added here automatically when the site deploys.'));
  if (contributorsData.contributors.length) {
    const grid = element('div', 'contributors-grid');
    for (const person of contributorsData.contributors) {
      const card = element('article', 'contributor-card');
      const avatar = element('span', 'contributor-avatar', person.login.slice(0, 2).toUpperCase());
      const top = element('div', 'course-top');
      top.append(avatar, element('h3', '', person.login));
      card.append(top, element('p', '', `${person.mergedPRs} merged ${person.mergedPRs === 1 ? 'pull request' : 'pull requests'}`));
      const profile = element('a', 'premium-button', 'GitHub profile ↗');
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
  content.append(controls([routeLink('← Select stream', { view: 'courses' }), routeLink('← Select course', { stream: catalog.id })]));
  const chooser = element('section');
  chooser.id = 'selectsemester';
  const title = element('div', 'semhead');
  title.append(element('h1', '', branch.semesters.every((semester) => semester.id.startsWith('year-')) ? 'Select The Year' : 'Select The Semester'));
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
  document.body.classList.toggle('extended-page', isHome || isContributors);
  $('oldpaper').hidden = isContributors;
  $('announcement').hidden = !isHome;
  document.querySelector('.about').hidden = !isHome;
  document.title = entry ? `${entry.subject.name} (${entry.subject.code}) Question Papers | ${config.name}` : branch ? `${catalog.name} ${branch.name} Question Papers | ${config.name}` : catalog ? `${catalog.name} Question Papers | ${config.name}` : `${config.name} | GTU Question Papers`;
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
    if (catalog.source) {
      const source = element('a', 'repository-link', 'Source: GTU official question-paper repository ↗');
      source.href = catalog.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
      content.append(controls([source]));
    }
    if (catalog.imported && !catalog.branches.length) content.append(element('p', 'catalog-message', catalog.pendingSubjects?.length ? 'Course and semester details are being verified against GTU records. Please check the official repository for additional papers.' : 'This stream is listed by GTU, but no papers could be retrieved from the checked sessions. Please check the official repository.'));
    const courses = element('section');
    courses.id = 'coarsenames';
    const label = element('div', 'coarsename');
    const heading = element('h1', '', 'Select your course');
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
  } else if (state.view === 'courses') {
    document.title = `All GTU Courses and Question Papers | ${config.name}`;
    content.append(banner('Select your stream'), courseBoxes());
  }
  else content.append(home());
  updatePageMetadata(catalog, branch, entry);
}
function updatePageMetadata(catalog, branch, entry) {
  const canonical = $('page-canonical');
  if (!canonical) return;
  const origin = 'https://paperonboard.in/';
  const values = entry ? entryRoute(entry) : branch ? { stream: catalog.id, branch: branch.id } : catalog ? { stream: catalog.id } : state.view ? { view: state.view } : {};
  const relative = routeURL(values);
  const url = relative === 'index.html' ? origin : new URL(relative, origin).href;
  const unavailable = (state.stream && !catalog) || (state.branch && !branch) || (state.subject && !entry) || (catalog && !catalog.branches.length);
  const description = entry ? `Find GTU ${entry.subject.name} (${entry.subject.code}) papers for ${catalog.name}. Browse available exam sessions and download from linked sources.` : branch ? `Browse GTU ${catalog.name} ${branch.name} question papers by subject code and exam session.` : catalog ? `Browse GTU ${catalog.name} previous-year question papers and available official archive links.` : 'Find GTU question papers by course, branch, semester and subject code. Independent, free, community-maintained paper directory.';
  canonical.href = url;
  $('page-description').setAttribute('content', description);
  $('page-robots').setAttribute('content', state.q || state.resource || unavailable ? 'noindex,follow' : 'index,follow,max-image-preview:large');
  $('page-og-title').setAttribute('content', document.title);
  $('page-og-description').setAttribute('content', description);
  $('page-og-url').setAttribute('content', url);
  $('page-schema').textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: document.title, description, url, isPartOf: { '@type': 'WebSite', name: config.name, url: origin } });
}
function restoreURL() {
  const params = new URLSearchParams(location.search);
  const file = (location.pathname || '').split('/').pop();
  if (file?.startsWith('catalog-') && file.endsWith('.html')) {
    const [stream, branch] = file.slice(8, -5).split('--').map(decodeURIComponent);
    params.set('stream', stream);
    if (branch) params.set('branch', branch);
  } else if (file === 'courses.html') params.set('view', 'courses');
  else if (file === 'contributors.html') params.set('view', 'contributors');
  for (const key of Object.keys(state)) state[key] = params.get(key) || '';
  const catalog = catalogs.find((catalog) => catalog.id === state.stream);
  if (['official-papers', 'additional-papers', 'course'].includes(state.branch) && catalog && !catalog.branches.some((branch) => branch.id === state.branch)) {
    const entry = state.subject ? entries.find((entry) => entry.catalog.id === state.stream && entry.subject.code === state.subject) : null;
    state.branch = entry?.branch.id || '';
    if (entry) state.semester = entry.semester.id;
  }
  if (state.semester === 'unclassified' && state.subject) {
    const entry = entries.find((entry) => entry.catalog.id === state.stream && entry.branch.id === state.branch && entry.subject.code === state.subject);
    if (entry) state.semester = entry.semester.id;
  }
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
function initializeOpenSourceNotice() {
  const notice = $('open-source-notice');
  const storageKey = 'paperonboard-open-source-dismissed-v1';
  try {
    notice.hidden = sessionStorage.getItem(storageKey) === 'true';
  } catch {
    notice.hidden = false;
  }
  $('show-open-source').addEventListener('click', () => {
    notice.hidden = false;
    $('dismiss-open-source').focus({ preventScroll: true });
  });
  $('dismiss-open-source').addEventListener('click', () => {
    notice.hidden = true;
    try { sessionStorage.setItem(storageKey, 'true'); } catch { /* Browsing works without storage. */ }
    $('library').focus({ preventScroll: true });
  });
}
function initializeDisplayAd() {
  const slot = config.ads?.displaySlot;
  // Only request real ads on the live site, once per document, never per route.
  if (!/^(www\.)?paperonboard\.in$/.test(location.hostname) || !/^\d+$/.test(slot || '')) return;
  const container = $('site-ad-unit');
  if (container.children.length) return;
  const ad = element('ins', 'adsbygoogle');
  ad.setAttribute('data-ad-client', 'ca-pub-2553242957639447');
  ad.setAttribute('data-ad-slot', slot);
  container.append(ad);
  $('site-ad').hidden = false;
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
  catch (error) { console.warn('Display ad unavailable:', error); }
}
async function initialize() {
  initializeOpenSourceNotice();
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
      entries.push({ catalog, branch, semester, subject, resources, searchText: [catalog.name, catalog.gtuCourseCode || '', branch.name, semester.name, subject.name, subject.code, ...resources.map((p) => p.label)].join(' ').toLocaleLowerCase() });
    }
    if (config.announcement) $('announcement-text').textContent = config.announcement;
    restoreURL();
    initializeDisplayAd();
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
