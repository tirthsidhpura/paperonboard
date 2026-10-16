# PaperOnBoard

A free, community-maintained GTU question paper library. The landing and contributors pages extend the original styling, with consistent navigation and footer. Paper browsing retains the original semester scrolling, subject dropdowns, and download cards. A dismissible open-source announcement appears across all routes and stays dismissed for the browser tab session. One HTML interface loads its content from one JSON catalog per stream. No frontend framework, database, accounts, or third-party build dependencies. The build renders static HTML for the home, course and branch pages from the same JavaScript interface, so their content and paper links are readable before JavaScript runs.

Students can browse **stream → branch → semester → subject → paper**, or use **Search** in the navbar to search all streams by subject name, code, or examination. Branch views show all semesters as before. Each subject dropdown keeps the existing direct links and opens its latest papers in the same single-page interface. Subject views and searches have shareable URLs and support browser back/forward. Projects, IELTS, and the privacy policy retain links to their original public site destinations.

## Run locally

With Node.js installed:

```sh
npm run validate
npm run build
npm start
```

Open http://127.0.0.1:4173. Node is only a development tool; the published site is entirely HTML, CSS, JS, and JSON. No `npm install` is needed. JSON is loaded with `fetch`, so opening `index.html` as a `file://` URL will not work.

## Edit the library

| File | What to change |
| --- | --- |
| `data/site.json` | Page title, announcement, course labels, and catalog registry |
| `data/urls.json` | Shared, versioned base URLs for paper hosts |
| `data/contributors.json` | Public contributor list, generated from merged GitHub PRs during deployment |
| `data/diploma.json` | Diploma branches, semesters, subjects, and papers |
| `data/bachelors.json` | Bachelor of Engineering catalog |
| `data/architecture.json` | Architecture catalog |
| `data/pharma.json` | Pharmacy catalog |
| `data/gtu-*.json` | Additional GTU course catalogs, import coverage and official program names |
| `scripts/prerender.mjs` | Static page generation, metadata, sitemap, robots and navigation summary |
| `style.css`, `inside.css` | Original site styles, preserved unchanged |
| `catalog.css` | Small additions for search, keyboard/touch access, and paper cards |
| `landing.css` | Landing and contributors page styles, scoped away from paper-browsing pages |

See [CONTRIBUTING.md](CONTRIBUTING.md) for copy-and-paste examples for papers, semesters, branches, streams, and materials. Adding catalog content requires no HTML or JavaScript edits. After edits, run validation and rebuild.

Exam templates reference a `urlVersion` in `data/urls.json` and a relative `path`. Update the version's base URL once when its host moves. Add a new version when new papers use a different host and older papers should keep their existing host. `paper-urls.js` exports the shared resolver for reuse by other pages.

## Deploy

For automatic updates after a merged PR, see [DEPLOYMENT.md](DEPLOYMENT.md). The included GitHub Actions workflow updates contributors, builds, tests, and deploys over FTPS to InfinityFree once configured with repository secrets. It is disabled for live uploads until `DEPLOY_ENABLED=true` is set.

Run `npm run build` and publish **only `dist/`** on any static host (GitHub Pages, Cloudflare Pages, Netlify, or a basic web server). There are no server functions. All asset paths are relative, including when hosted under a GitHub Pages repository subpath. Build output includes small redirect pages for the old course and branch HTML URLs; the actual interface is always `index.html`.

Do not serve the repository root. The included preview server serves only `dist/`, and the build uses an explicit file allowlist. Existing PHP URLs need host-level redirects if you want to preserve those links; static hosts do not execute PHP.

## Migration and publication

The original local site is retained in **`legacy-private/`**, which is ignored by Git. It includes the original backend configuration, old pages, and original uploads. Never upload that folder or remove its ignore rule. Do not publish original database dumps, credentials, contributor details, admin code, or unreviewed uploads.

The new catalogs preserve subject records and direct paper links from the old course pages. `data/migration-report.json` records the source pages and skipped incomplete placeholders. Repeated entries for the same subject code in a semester were merged. GTU catalogs use `archivePolicy: "listed-only"`: paper cards come from explicit catalog entries, never a generated link for every year. Historical sessions are added only when the official listing contains that subject code. New courses and revised subject codes therefore do not inherit papers from before they existed. Original manually curated direct links are retained. External GTU and Google Drive availability has not been verified. Some original subject names/codes may need community correction.

Database-only study material, upload records, and course records cannot be recovered from these files. Export and review them before adding them to the public JSON catalogs. The five original uploaded PDFs remain in the ignored archive for review; they are not automatically redistributed.

Git was initialized locally. `.gitignore` excludes the original site, secrets, database dumps, local state, and build output. `scripts/check-public.mjs` checks staged content for common secrets and prohibited paths. Run it before committing:

```sh
node scripts/check-public.mjs
```

Publishing a GitHub repository, choosing its owner/name, and selecting a code license remain owner decisions. The code has no open-source license yet; select one before inviting others to reuse it. No license is assumed for third-party question papers. Only submit materials you have permission to share.


## Official course coverage

The registry includes all 58 course codes listed in the official [GTU question-paper repository](https://old26.gtu.ac.in/Download1.aspx), checked on 16 October 2026. Paper listings were retrieved for 39 codes; the remaining codes are kept with an explicit unavailable-listings message and official source link. Some GTU session searches return HTTP 500, so zero retrieved results does not establish that no papers exist. The archive refresh checks every exam session offered by the official search form. Historical enrichment adds papers to known subject codes; unrelated retired curricula are not automatically added. This is not an exhaustive import of every historical paper.

The [GTU syllabus program table](https://old26.gtu.ac.in/Syllabus/default.aspx) supplies expanded names for 42 codes. Other codes keep GTU's exact abbreviation instead of a guessed program name. Imported subject names and semester/year assignments are read from the headers of official GTU PDFs. Every stream follows stream → course/branch → semester → subject → paper cards. Students select a subject before seeing its paper cards, ordered oldest to newest. Course memberships come from official syllabus headers and timetable tables; legacy numeric codes are matched to the official branch registry. Existing curated streams keep their course links and semester scrolling. Year-based courses use their printed academic year rather than an invented semester. Records without a readable header or a verified course membership remain pending and are not published as an unclassified semester. Existing curated subject names and branches remain intact. `data/gtu-subjects.json` records the metadata and its official PDF source. Visually verified labels from scanned headers are kept in `data/gtu-subject-overrides.json` so refreshes retain them. `data/gtu-course-map.json` contains official branch names and timetable memberships. `data/gtu-source.json` records coverage and `data/gtu-program-names.json` records the program-name source.

To collect an updated snapshot and merge it after review:

```sh
python3 scripts/import-gtu.py
python3 scripts/apply-gtu-import.py .local/gtu-listings.json
python3 scripts/read-gtu-headers.py
python3 scripts/read-gtu-courses.py
python3 scripts/organize-gtu-subjects.py
npm run build
npm test
```

The listing importer reads GTU's public search form and paper links. The PDF header and course-membership readers require the optional development package `pypdf` (`python3 -m pip install pypdf`) and reads official PDFs to extract subject names and semesters; PDFs are not republished. Verified metadata is cached locally and seeded from the checked-in source registry on a fresh checkout. By default the listing importer checks every official session. Use `--recent` for a quick recent-session snapshot or `--resume .local/gtu-listings.json --output .local/gtu-history.json` to extend a saved snapshot. Failed sessions are recorded separately from empty successful searches; a missing result does not establish that no paper exists. It preserves curated catalogs and adds missing entries. Snapshot files stay in ignored `.local/`. Review coverage and any errors before applying a new snapshot.

To enrich existing subjects with past papers without importing unrelated retired curricula:

```sh
python3 scripts/import-gtu.py --resume .local/gtu-listings.json --output .local/gtu-history.json
python3 scripts/apply-gtu-import.py .local/gtu-history.json --existing-only
npm run build
npm test
```

The full-session merge switches catalogs to explicit links and disables inherited exam templates. It preserves manually added resources. Shared subjects receive the same verified session links in each course. New courses need no guessed introduction date: absent sessions simply produce no card. Review `sessionErrors` in `data/gtu-source.json` before claiming archive completeness.

## Search and AI discovery

The build generates HTML pages with visible catalog content, source links, unique titles/descriptions, canonical URLs, Open Graph tags and WebSite/WebPage/Breadcrumb structured data. A sitemap lists pages with substantive content; empty course directories are marked `noindex,follow`. The browser uses the same renderer and updates page metadata during navigation. Old query-string links continue to work. Search results and resource filters are marked `noindex,follow` and point to the unfiltered canonical page.

`robots.txt` permits crawling. `llms.txt` is a plain-text navigation aid, not a ranking mechanism or an indexing guarantee. [Google's AI guidance](https://developers.google.com/search/docs/appearance/ai-features) says normal SEO practices apply; no special AI schema or text file is required. No implementation can promise a #1 ranking or citations from an LLM.

After deployment, verify `paperonboard.in` in Google Search Console, submit `https://paperonboard.in/sitemap.xml`, and inspect the homepage and several course/branch URLs with **Test live URL**. Confirm that Google receives the actual page text and allows indexing. The current InfinityFree host returned an `aes.js` browser challenge to direct requests for the homepage, `robots.txt` and JSON. This observation does not prove Googlebot is blocked, but non-browser crawlers may receive the challenge rather than site content. This server behavior cannot be fixed by page markup. See [InfinityFree's explanation](https://forum.infinityfree.com/t/issue-with-aes-js-preventing-google-from-indexing-my-site-correctly/116446). If the crawlers you need cannot retrieve the content, host the existing `dist/` on a static host without that challenge; changing hosting/DNS is a separate action.
