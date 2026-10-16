# Add to the library

Thanks for helping another student get a head start. All content lives in `data/`; you do not need to change the UI.

Fork the public GitHub repository, create a branch for your change, and submit a pull request to `main`. Once reviewed and merged, the deployment workflow adds your public GitHub profile to the contributors page automatically. Only merged PRs count; direct commits and bot PRs are not included in that list.

## Add a question paper

Open the relevant stream JSON, find its branch, semester, and subject, and add an item to the subject's `papers` array:

```json
{
  "label": "Summer 2026",
  "url": "https://example.edu/papers/4310701-summer-2026.pdf",
  "type": "paper"
}
```

Replace the example URL with a real public paper link. Open it and check the subject, code, and exam session before submitting. Prefer direct HTTPS links to the original institution. Don't add login-only links, personal access tokens, names/emails of contributors, or copyrighted materials you cannot share.

For a local PDF, place a reviewed file in `uploads/`, use a path like `uploads/4310701-summer-2026.pdf`, then explicitly add that file with `git add -f uploads/4310701-summer-2026.pdf`. Uploads are ignored by default so personal or unreviewed files are not published accidentally. The build includes only local files referenced in a catalog.

## Add a subject or study material

Add this object to a semester's `subjects` array:

```json
{
  "code": "4310701",
  "name": "Fundamentals of Computer",
  "useExamTemplates": false,
  "papers": [
    {
      "label": "Summer 2026",
      "url": "https://example.edu/papers/4310701.pdf",
      "type": "paper"
    },
    {
      "label": "Revision notes — Unit 1",
      "url": "https://example.edu/notes/computer-unit-1.pdf",
      "type": "material"
    }
  ]
}
```

Use `useExamTemplates: false` for newly verified, explicit paper links. Existing migrated subjects may use `true`: this adds every stream-level `examTemplates` session using the subject's code. These inherited archive templates may point to unavailable sessions. Adding a template affects **all** subjects that opt in; add a direct link to one subject when only its paper is known to exist.

## Manage shared URL versions

`data/urls.json` holds base URLs used across all streams:

```json
{
  "versions": {
    "v1": "https://old26.gtu.ac.in/uploads/"
  }
}
```

An entry in a stream's `examTemplates` now looks like this:

```json
{
  "label": "Winter 2025",
  "urlVersion": "v1",
  "path": "w2025/BE/{code}.pdf"
}
```

The site combines the base URL, path, and subject code. Keep the base URL's trailing `/`, omit a leading `/` in the path, and preserve the archive's capitalization (`W2024` and `w2025` are different paths).

If the existing archive moves, change `v1` once in `data/urls.json`; every reference to `v1` follows it. If only newer papers use a new archive, add `v2` with that archive's real HTTPS base URL, then use `"urlVersion": "v2"` in the new entries. Existing `v1` references keep using their original archive.

Individual items in `papers` can also use `urlVersion` and `path` instead of `url`. Keep `url` for standalone Google Drive links or local files. Do not combine both formats in one entry.

Future pages can use the same resolver in a module script:

```js
import { resolvePaperURL, validateURLSources } from './paper-urls.js';

const response = await fetch('data/urls.json');
if (!response.ok) throw new Error('Could not load URL configuration');
const sources = validateURLSources(await response.json());
const url = resolvePaperURL(
  { urlVersion: 'v1', path: 'w2025/BE/{code}.pdf' },
  sources,
  '3110014'
);
```

Run `npm run build` after changing a base URL or version so the published files contain the update.

## Add a semester

Add an object to a branch's `semesters` array. IDs are strings; use any unique ID within that branch. The UI does not hardcode semester numbers:

```json
{
  "id": "9",
  "name": "Semester 9",
  "subjects": []
}
```

Populate `subjects` with the objects above. Empty semesters display an empty state and can be filled later. Combined semesters can use IDs such as `1-2`.

## Add a branch

Add a branch object to the stream's `branches` array:

```json
{
  "id": "artificial-intelligence",
  "name": "Artificial Intelligence",
  "semesters": []
}
```

## Add a stream

Create `data/masters.json`:

```json
{
  "id": "masters",
  "name": "Master of Engineering",
  "examTemplates": [],
  "branches": []
}
```

Register it in the `streams` array in `data/site.json`:

```json
{
  "id": "masters",
  "name": "Master of Engineering",
  "shortName": "ME",
  "description": "Take your next step",
  "file": "data/masters.json"
}
```

Add branches and semesters, then run `npm run validate`, `npm test`, and `npm run build`. The UI and build discover the new catalog automatically.

## Before submitting

Use valid JSON (double quotes, no comments or trailing commas). Keep branch IDs unique within their stream, semester IDs unique within their branch, and subject codes unique within their semester. Keep codes as strings to preserve letters and leading zeros.

Run `npm run validate`, `npm test`, and `node scripts/check-public.mjs`. Preview with `npm run build` and `npm start`, check the changed subject, then submit your change. Never commit `legacy-private/`, backend config, credentials, database exports, or personal information.
