# PaperOnBoard SEO audit and growth plan

Reviewed October 17, 2026. Production domain: https://paperonboard.in/

## Main finding

Keep the PaperOnBoard domain. The important technical gap in this checkout was that subject downloads were accessible through JavaScript query routes but had no dedicated, pre-rendered subject HTML pages. Course and branch pages already had static HTML, canonical tags, metadata, structured data, robots.txt and a sitemap.

This change adds one static subject page per course and subject code. Common subjects across branches share a page that combines their recorded resources. Branch navigation and search results link to these pages. Each page includes its subject name, code, course, navigation context and download links before JavaScript runs. Legacy query URLs still work and their browser metadata identifies the corresponding subject page as canonical.

The homepage now explicitly identifies itself as a GTU question-paper directory in its main heading and title. Course and branch titles include GTU. Subject pages have unique titles, descriptions, canonical URLs and breadcrumbs. Empty subject pages are excluded from the sitemap and marked noindex. Resource filters and search results remain noindex in the interactive application.

These changes improve discovery and relevance; they do not guarantee indexing or a particular ranking. Generated pages reuse the existing catalog. No new paper availability or solutions have been claimed.

## Limits of the live review

Public searches for `site:paperonboard.in`, the domain name and GTU question-paper terms did not surface a first-party PaperOnBoard result in the returned sample. This is not a complete index report or proof that Google has no indexed pages.

Attempts to retrieve the HTTPS homepage, HTTP homepage, www homepage and robots.txt through the web tool failed. A local curl request reported that the domain could not be resolved from this execution environment. Network restrictions or retrieval-tool limitations may explain this. This audit does not establish a production DNS outage, a Googlebot block or a hosting fault.

No authenticated Search Console data, analytics, live PageSpeed results, backlink data or production hosting configuration was available. Live deployment parity, response codes, redirects, crawl access and performance still need verification. The fixes described here are in the local project and generated dist folder, not confirmed on production.

## Search landscape

This is a sample of returned search results, not measured Google ranking positions. Results vary by location, device and time. Competitor pages describe their own coverage; those claims have not been independently verified.

| Resource observed | Visible approach | Opportunity for PaperOnBoard |
| --- | --- | --- |
| [Official GTU repository](https://www.gtu.ac.in/student-corner/examination/question-paper-repository) | Session, course and subject-code lookup | Make finding the correct recorded paper easier, with clear source links and reliable navigation. |
| [GTUPapers](https://gtupapers.in/) | Prominent GTU wording, degree directories, subject listings and download-oriented content | Offer accurate coverage and clear navigation; do not copy broad claims about solutions or complete coverage. |
| [UnFoldPrep GTU library](https://unfoldprep.com/papers/gtu/) | Branch directories and dedicated paper pages; some readable questions and worked solutions | Add original, reviewed educational value to the subjects students use most. |

The inference from this sample is that the broad query is competitive. Dedicated subject pages create opportunities to compete for precise searches first, such as a subject code plus `GTU question paper`, rather than relying entirely on the homepage for every search.

## Prioritized work after deployment

### 1. Establish crawl access and indexing

- Deploy only `dist/` through the existing reviewed deployment workflow. This release adds thousands of small HTML files, so allow for a longer initial FTP upload.
- From an unrestricted network, verify that the homepage, sitemap, robots.txt and a sample subject page return successfully without a login, browser challenge or hosting interstitial. If DNS fails there too, correct the domain/hosting configuration before further SEO work.
- Verify the domain property in Google Search Console and submit `https://paperonboard.in/sitemap.xml`.
- Inspect the homepage, one populated course, one branch and several subject URLs. Use the live test and rendered HTML to confirm that Google can see subject names and download links. Check Google's selected canonical in the indexed report once available.
- Check Pages, Manual Actions and Security Issues. Resolve reported access errors or indexing exclusions before treating the issue as poor ranking.
- Verify that HTTP and www versions consistently redirect to the selected HTTPS non-www domain. Canonical tags are already generated; server redirects must be checked separately.
- Review historic URLs with actual traffic or backlinks before changing hosting redirects. Preserve useful links with permanent redirects to their closest relevant page rather than sending every old URL to the homepage.

### 2. Improve the pages students already need

- Use Search Console impressions and student requests to pick the first 10–20 subject pages. Prioritize correct subject codes and syllabus versions, accurate Summer/Winter labels, working source links and recent papers that actually exist.
- Add reviewed question transcriptions and worked solutions where useful and permitted. Clearly distinguish official papers, student-written solutions and study material. Include author/reviewer information and correction links for authored explanations.
- Show verified session coverage and substantive update dates when the data supports them. Do not insert a current year or an automatic date merely to look fresh.
- Add syllabus links and guidance specific to a subject only after checking the applicable curriculum. Generic paragraphs repeated across thousands of pages offer little additional help.
- Check high-traffic download links regularly. The current build validates catalog structure and URL construction; it does not prove every third-party PDF is reachable.

### 3. Make mobile downloads fast and clear

- Measure the deployed homepage, branch and subject page with PageSpeed Insights and Search Console Core Web Vitals. Set priorities from measured loading time, interaction delay and layout shift rather than an assumed score.
- Review mobile ad placement, especially any Auto ads. Keep advertisements away from download controls and verify that they do not obstruct navigation or cause unexpected movement.
- Browser initialization now loads only the current course catalog; the homepage and course directory use small build-generated summary counts without loading catalogs. Navigation reuses loaded catalogs. Global search loads the remaining catalogs on demand, so measure its loading time separately on slower connections.

### 4. Earn relevant visibility

- Seek resource-page links from relevant college clubs, student communities and educators who find the directory useful. Share the most relevant course or subject page with their permission.
- Publish helpful, accurate exam-preparation resources that people have a reason to reference. Avoid buying backlinks, mass submissions and keyword-stuffed pages.
- Keep the independent-site disclosure and contact information visible. Use your own brand; do not imply university endorsement.

## Measurement and review

Record a Search Console baseline before deployment if available. Track non-brand queries containing GTU, clicks, impressions, click-through rate and average position by landing page. Track homepage, course pages and subject pages separately. Use indexed-page reports to distinguish discovery problems from ranking problems.

After deployment, confirm access and successful rendering first. Review query and page trends after approximately 28 days, and compare longer periods as data accumulates. These are review intervals, not promised ranking deadlines. Exact targets and traffic projections require the baseline and actual query demand.

Aim first for useful visibility on specific subject-code searches, then expand to branch/course searches and the broad `GTU question paper` query. Treat number one as an ambition, not a deliverable that code changes can guarantee.

## Primary guidance used

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): domain-name keywords have little ranking effect.
- [Google Search Essentials](https://developers.google.com/search/docs/essentials): helpful content, prominent descriptive wording and crawlable links.
- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): pre-rendered HTML, crawlable navigation and canonical consistency.
- [Creating helpful, reliable content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): original value and trustworthy information.
- [Sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview): discovery assistance, not an indexing guarantee.
- [Search Console URL Inspection](https://support.google.com/webmasters/answer/9012289): indexed status, live testing and Google's selected canonical.
- [Google page-experience guidance](https://developers.google.com/search/docs/appearance/page-experience): assess real page experience alongside relevance.
