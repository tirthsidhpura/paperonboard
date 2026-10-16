// Build real HTML using the same renderer as the browser; no second page design.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { resolvePaperURL, validateURLSources } from '../paper-urls.js';

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.children = children; this.textContent = undefined; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener() {}
  toHTML() {
    const attributes = { ...this.attributes };
    for (const [property, attribute] of Object.entries({ className: 'class', id: 'id', href: 'href', type: 'type', target: 'target', rel: 'rel', value: 'value' })) {
      if (this[property] !== undefined) attributes[attribute] = this[property];
    }
    for (const [key, value] of Object.entries(this.dataset)) attributes[`data-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = value;
    const style = Object.entries(this.style).map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${value}`).join(';');
    if (style) attributes.style = style;
    if (this.hidden) attributes.hidden = '';
    const attrs = Object.entries(attributes).map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
    if (['hr', 'img', 'input', 'br'].includes(this.tagName)) return `<${this.tagName}${attrs}>`;
    return `<${this.tagName}${attrs}>${this.textContent === undefined ? '' : escape(this.textContent)}${this.children.map((child) => child instanceof Node ? child.toHTML() : escape(child)).join('')}</${this.tagName}>`;
  }
}

export function prerender(root, destination, site) {
  const origin = 'https://paperonboard.in/';
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const nodes = new Map(['content', 'announcement', 'search', 'about', 'oldpaper'].map((id) => [id, new Node('div')]));
  let extended = false;
  const document = {
    baseURI: origin,
    body: { classList: { toggle: (_name, enabled) => { extended = enabled; } } },
    createElement: (tag) => new Node(tag), getElementById: (id) => nodes.get(id),
    querySelector: () => nodes.get('about'),
  };
  const location = { pathname: '/index.html', search: '' };
  const runtime = vm.createContext({ URL, URLSearchParams, resolvePaperURL, validateURLSources, document, location });
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8').replace(/^import .* from '\.\/paper-urls\.js';\s*$/m, '').replace(/initialize\(\);\s*$/, '');
  vm.runInContext(script, runtime);
  runtime.site = site; runtime.sources = read('data/urls.json'); runtime.people = read('data/contributors.json');
  runtime.fixtures = site.streams.map((stream) => read(stream.file));
  vm.runInContext(`
    config = site; urlSources = sources; contributorsData = people; catalogs = fixtures;
    for (const catalog of catalogs) for (const branch of catalog.branches) for (const semester of branch.semesters) for (const subject of semester.subjects) {
      const resources = resourcesFor(catalog, subject);
      entries.push({ catalog, branch, semester, subject, resources, searchText: [catalog.name, catalog.gtuCourseCode || '', branch.name, semester.name, subject.name, subject.code, ...resources.map((p) => p.label)].join(' ').toLocaleLowerCase() });
    }
  `, runtime);
  const template = fs.readFileSync(path.join(destination, 'index.html'), 'utf8');
  const routes = [{ file: 'index.html', title: 'GTU Question Papers', description: 'Find GTU previous-year question papers by course, branch, semester and subject code. Free access, Summer 2026 sessions, and official GTU paper links.', breadcrumbs: [] },
    { file: 'courses.html', title: 'All GTU Courses and Question Papers', description: `Browse ${site.streams.length} course codes listed in the GTU official question-paper repository, including engineering, pharmacy, management and more.`, breadcrumbs: ['All courses'] },
    { file: 'contributors.html', title: 'Contributors', description: 'Meet the GitHub contributors helping students find GTU question papers. Learn how to add papers and correct links.', breadcrumbs: ['Contributors'] }];
  for (const catalog of runtime.fixtures) {
    const count = catalog.branches.flatMap((b) => b.semesters.flatMap((s) => s.subjects)).length;
    routes.push({ file: `catalog-${catalog.id}.html`, title: `${catalog.name} Question Papers`, description: `Browse GTU ${catalog.name} previous-year question papers by subject code. ${count ? `${count} subject listings, with links to available exam sessions.` : 'See the official GTU repository for currently available papers.'}`, breadcrumbs: [catalog.name], noindex: !count });
    for (const branch of catalog.branches) routes.push({ file: `catalog-${catalog.id}--${branch.id}.html`, title: `${catalog.name} ${branch.name} Question Papers`, description: `Find GTU ${catalog.name} ${branch.name} question papers. Browse available subject codes and exam sessions with direct resource links.`, breadcrumbs: [catalog.name, branch.name], courseFile: `catalog-${catalog.id}.html` });
  }
  for (const route of routes) {
    location.pathname = '/' + route.file;
    vm.runInContext('restoreURL()', runtime);
    let html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(route.title)} | PaperOnBoard</title>`)
      .replace(/<meta name="description"[^>]+>/, `<meta id="page-description" name="description" content="${escape(route.description)}">`)
      .replace(/<div id="content">.*?<\/div>\s*<\/main>/s, `<div id="content">${nodes.get('content').children.map((n) => n.toHTML()).join('')}</div>\n  </main>`)
      .replace('<body>', `<body${extended ? ' class="extended-page"' : ''}>`);
    for (const id of ['oldpaper', 'announcement']) if (nodes.get(id).hidden) html = html.replace(`<section id="${id}">`, `<section id="${id}" hidden>`);
    if (nodes.get('about').hidden) html = html.replace('<section class="about">', '<section class="about" hidden>');
    const url = origin + (route.file === 'index.html' ? '' : route.file);
    const schema = {
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebSite', '@id': origin + '#website', name: 'PaperOnBoard', url: origin, description: 'Independent, community-maintained GTU question-paper directory.', inLanguage: 'en' },
        { '@type': route.file === 'index.html' ? 'WebPage' : 'CollectionPage', '@id': url + '#page', url, name: route.title, description: route.description, isPartOf: { '@id': origin + '#website' }, inLanguage: 'en' },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: origin }, ...route.breadcrumbs.map((name, i) => ({ '@type': 'ListItem', position: i + 2, name, item: i === route.breadcrumbs.length - 1 ? url : origin + route.courseFile }))] },
      ],
    };
    const metadata = `<link id="page-canonical" rel="canonical" href="${escape(url)}">
  <meta id="page-robots" name="robots" content="${route.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
  <meta id="page-og-title" property="og:title" content="${escape(route.title)} | PaperOnBoard">
  <meta id="page-og-description" property="og:description" content="${escape(route.description)}">
  <meta id="page-og-url" property="og:url" content="${escape(url)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${origin}img/pob_logo.png">
  <meta name="twitter:card" content="summary">
  <script id="page-schema" type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
    html = html.replace('</head>', `  ${metadata}\n</head>`);
    // Native navigation also reaches the stable, rendered course pages.
    html = html.replace(/href="\?stream=([a-z0-9-]+)"/g, 'href="catalog-$1.html"').replaceAll('href="?view=courses"', 'href="courses.html"').replaceAll('href="?view=contributors"', 'href="contributors.html"');
    fs.writeFileSync(path.join(destination, route.file), html);
  }
  // Keep links shared from the original import working after semester organization.
  for (const catalog of runtime.fixtures) {
    const file = `catalog-${catalog.id}--official-papers.html`;
    const target = `catalog-${catalog.id}.html`;
    fs.writeFileSync(path.join(destination, file), `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escape(target)}"><link rel="canonical" href="${origin}${escape(target)}"><title>Choose a course | PaperOnBoard</title><a href="${escape(target)}">Choose a course and browse papers</a></html>`);
  }
  const indexable = routes.filter((r) => !r.noindex);
  fs.writeFileSync(path.join(destination, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable.map((r) => `<url><loc>${escape(origin + (r.file === 'index.html' ? '' : r.file))}</loc></url>`).join('')}</urlset>\n`);
  fs.writeFileSync(path.join(destination, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}sitemap.xml\n`);
  fs.writeFileSync(path.join(destination, 'llms.txt'), `# PaperOnBoard\n\n> Independent, community-maintained GTU question-paper directory. Not affiliated with Gujarat Technological University.\n\nPaper links point to third-party GTU and Google Drive resources. Availability varies by subject and session. Imported subject names and semester/year assignments are verified from official paper headers.\n\n## Course directories\n${routes.filter((r) => r.file.startsWith('catalog-') && !r.file.includes('--') && !r.noindex).map((r) => `- [${r.title}](${origin}${r.file}): ${r.description}`).join('\n')}\n\n## Sources\n- [Official GTU question-paper repository](https://old26.gtu.ac.in/Download1.aspx)\n- [Contribute](https://github.com/tirthsidhpura/paperonboard)\n\nThis file is a navigation aid, not a guarantee of AI indexing or citation.\n`);
  console.log(`Rendered ${routes.length} HTML pages and ${indexable.length} sitemap URLs from the shared interface.`);
}
