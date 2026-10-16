# PaperOnBoard

A free, community-maintained GTU question paper library. One HTML interface, plain CSS and JavaScript, and one JSON catalog per stream. No framework, database, accounts, API keys, or build dependencies.

Students can browse **stream → branch → semester → subject → paper**, or use **Search papers** in the navbar to search all streams by subject name, code, or examination. Search also covers study materials. Filters and searches have shareable URLs and support browser back/forward.

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
| `data/site.json` | Brand name, tagline, stream cards, and catalog registry |
| `data/diploma.json` | Diploma branches, semesters, subjects, and papers |
| `data/bachelors.json` | Bachelor of Engineering catalog |
| `data/architecture.json` | Architecture catalog |
| `data/pharma.json` | Pharmacy catalog |
| `style.css` | Colors, typography, and responsive layout |

See [CONTRIBUTING.md](CONTRIBUTING.md) for copy-and-paste examples for papers, semesters, branches, streams, and materials. Adding catalog content requires no HTML or JavaScript edits. After edits, run validation and rebuild.

## Deploy

Run `npm run build` and publish **only `dist/`** on any static host (GitHub Pages, Cloudflare Pages, Netlify, or a basic web server). There are no server functions. All asset paths are relative, including when hosted under a GitHub Pages repository subpath. Build output includes small redirect pages for the old course and branch HTML URLs; the actual interface is always `index.html`.

Do not serve the repository root. The included preview server serves only `dist/`, and the build uses an explicit file allowlist. Existing PHP URLs need host-level redirects if you want to preserve those links; static hosts do not execute PHP.

## Migration and publication

The original local site is retained in **`legacy-private/`**, which is ignored by Git. It includes the original backend configuration, old pages, and original uploads. Never upload that folder or remove its ignore rule. Do not publish original database dumps, credentials, contributor details, admin code, or unreviewed uploads.

The new catalogs preserve subject records and direct paper links from the old course pages. `data/migration-report.json` records the source pages and skipped incomplete placeholders. Repeated entries for the same subject code in a semester were merged. Existing GTU archive URL templates are preserved separately from direct paper links: a generated session link is **not a claim that a paper exists**. External GTU and Google Drive availability has not been verified. Some original subject names/codes may need community correction.

Database-only study material, upload records, and course records cannot be recovered from these files. Export and review them before adding them to the public JSON catalogs. The five original uploaded PDFs remain in the ignored archive for review; they are not automatically redistributed.

Git was initialized locally. `.gitignore` excludes the original site, secrets, database dumps, local state, and build output. `scripts/check-public.mjs` checks staged content for common secrets and prohibited paths. Run it before committing:

```sh
node scripts/check-public.mjs
```

Publishing a GitHub repository, choosing its owner/name, and selecting a code license remain owner decisions. The code has no open-source license yet; select one before inviting others to reuse it. No license is assumed for third-party question papers. Only submit materials you have permission to share.
