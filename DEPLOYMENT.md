# GitHub → InfinityFree

The repository can stay public. The workflow uses a standard GitHub-hosted Ubuntu runner, no paid actions, no artifact uploads, and no dependencies to install. Standard runners are free for public repositories under [GitHub's Actions billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## One-time setup after you create the repository

1. Push this project to the repository's `main` branch. Keep the repository public if you want the public-repository Actions allowance. Select a code license before inviting reuse.
2. In GitHub, go to **Settings → Secrets and variables → Actions → Secrets** and add these repository secrets:

   | Secret | Value |
   | --- | --- |
   | `FTP_HOST` | The FTP hostname shown by InfinityFree, typically `ftpupload.net` |
   | `FTP_USERNAME` | Your hosting account's FTP username |
   | `FTP_PASSWORD` | Your FTP password |
   | `FTP_DIRECTORY` | The exact existing document root for `paperonboard.in`, such as `/htdocs` or `/paperonboard.in/htdocs`—check the domain's actual directory first |

3. Under **Variables**, add repository variable `DEPLOY_ENABLED` with value `true` after confirming the upload directory. This enables replacement of matching files on the live site.
4. Open **Actions → Check and deploy site → Run workflow** on `main` for the first deployment. Future merges or direct pushes to `main` deploy automatically.

Do not send passwords in chat, put them in JSON, or commit `.env` files. The workflow reads secrets only in the deploy step on `main`. Opening or updating a pull request does not run this workflow. Review changes before merging; validation and tests run after the merge, before deployment.

InfinityFree documents using [GitHub Actions for FTP uploads](https://forum.infinityfree.com/t/using-github-actions-for-automatic-upload-to-infinityfree/111008). Its FTP service supports [TLS via ftpupload.net](https://forum.infinityfree.com/t/ftp-encryption-where-did-it-go/82911). The included uploader uses explicit FTPS on port 21, verifies the TLS certificate, and encrypts data transfers. It does not fall back to plaintext FTP.

## Protect `main` before accepting contributions

After the first push, go to **Settings → Rules → Rulesets → New ruleset → New branch ruleset**. Name it `Protect main`, set enforcement to **Active**, and target `main` (or the default branch). Leave the bypass list empty if everyone should follow the rule.

Enable **Require a pull request before merging**, **Block force pushes**, and **Restrict deletions**. Set required approvals to **0** and leave **Require status checks to pass** disabled. If a required `site` check was previously configured, remove it: the workflow now runs only on pushes to `main` (including merges) or manual dispatch, not on PRs.

Public visitors do not have push access by default: they fork the repository and submit PRs. Keep yourself as the only account with write/admin access if you want to be the only person who can merge. PR authors cannot formally approve their own PR, but with zero required approvals you can review and merge your own changes as well as others' changes. Requiring PRs still blocks direct pushes without imposing automated PR checks.

These are GitHub settings, not settings a repository file can enforce. They must be enabled after creating the repository. Branch rulesets are available for public repositories on GitHub Free. See [GitHub's ruleset setup guide](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

## What happens after a merge

1. GitHub checks out the merged `main` branch and checks tracked files for prohibited private files and common secret patterns.
2. The contributor script fetches all closed PRs targeting the default branch, keeps merged PRs, excludes bots, and counts each PR's author. Squash merges count correctly because the source is PR records, not commit authors.
3. The script writes public GitHub logins and merged-PR counts to `data/contributors.json` in the workflow checkout. No access token, email address, or FTP detail is included. No generated commit or repository write permission is needed.
4. The workflow builds `dist/`, validates catalogs, runs tests, and uploads only the static build to the confirmed document root.

Contributor data updates in the deployed site. Your local JSON stays empty until you sync it; it is not automatically committed back to GitHub. The repository name is detected using `GITHUB_REPOSITORY`. You do not need to edit the workflow for a new repository name. If the default branch changes from `main`, update the workflow's branch filters and conditions.

## Deployment behavior and limits

Each file is uploaded to a temporary name and renamed after upload; `index.html` is uploaded last. Deployments are serialized so two jobs do not upload at once. This is a per-file update, not an atomic whole-site deployment: a failure may leave a mixture of old and new files. Re-run the workflow after resolving the error. A previous revision can be restored by reverting the commit and deploying again.

The uploader overwrites matching files but **does not delete unrelated files**. Existing PHP pages and uploads on InfinityFree remain until you review and remove them separately. Review the old hosted backend before declaring the production site static-only. Stale static files are also retained; a renamed or removed public file needs an explicit hosting cleanup if it must stop being accessible.

JSON files are uploaded only when their contents differ. The uploader stores SHA-256 hashes and byte sizes in `deployment-json-state.json` in the confirmed document root. On subsequent runs, a matching local hash plus remote file size skips that JSON upload. Missing remote files are restored. When the state is absent or unusable, or a local hash changes, the uploader downloads the existing remote JSON to compare its actual hash before deciding whether to upload it. The first run can therefore avoid re-uploading identical JSON that is already hosted.

The state file contains public paths, hashes and sizes only, and is replaced after every site file succeeds. Failed runs do not commit new state; retries compare already-completed JSON where necessary. Files are compared by content rather than Git timestamps, so same-size changes and rollbacks are detected. JSON generated during the build, including contributor data, follows the same rules. Other static files keep the existing upload behavior. Logs report uploaded files and skipped JSON files.

The state assumes JSON is managed by this deployer. If you manually edit hosted JSON without changing its size, remove `deployment-json-state.json` through your hosting file manager before the next deployment to force a fresh remote content comparison. Network and authentication failures stop deployment rather than silently treating comparison errors as unchanged files.

If contributor retrieval, validation, tests, or upload fails, the workflow fails visibly. Contributor retrieval failures do not publish an empty replacement list. Missing FTP secrets fail deployment; deployment stays skipped until `DEPLOY_ENABLED` is set.

The workflow has not been connected to a live repository or FTP account yet. The first live upload must confirm that the selected InfinityFree directory, credentials, TLS, and rename operations work for your account.

## DNS error (`gaierror`)

If connection fails with `gaierror`, first edit the `FTP_HOST` repository secret. It must contain just the FTP hostname shown by InfinityFree, typically `ftpupload.net`. Do not include `ftp://`, `ftps://`, `https://`, `:21`, `/htdocs`, or quotes. The script trims surrounding whitespace and rejects malformed hostnames before connecting. If the hostname is correct, rerun the workflow; the failure may be temporary DNS resolution on the runner or at the provider. A DNS failure during connection occurs before username/password authentication.

## Google Analytics

The original site's GA4 measurement ID, `G-F7Y6W97FD0`, is restored by `analytics.js`, which is included once in every generated content page. It loads Google's tag asynchronously only on `paperonboard.in` and `www.paperonboard.in`; localhost and preview hosts do not load the tag or submit analytics. The measurement ID is a public site identifier, not an API credential.

The integration uses GA4's automatic pageviews rather than adding duplicate manual events. In the existing GA4 property's web stream, check **Admin → Data Streams → Web → Enhanced measurement → Page views → Show advanced settings**, and enable **Page changes based on browser history events**. This account setting is needed to measure navigation between courses, branches and subjects that update the URL without a full document reload. See [Google's SPA measurement guide](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications).

After deployment, verify the initial page load and navigation to another subject in Realtime/DebugView or Google Tag Assistant. Confirm that the Google tag points to the expected existing property and that each navigation produces one pageview. No Analytics account settings are changed by a repository deployment, and ad blockers or browser tracking protection may prevent collection.

## Controlled ad placement

The shared page has one labelled display-ad area after the main content and old-paper explanation, separated from download controls. Its space is reserved before requesting the ad: 250x250 on narrow phones, 300x250 on larger phones, and 728x90 on desktop. It stays mounted during route changes and is requested only once per page load. An empty slot ID hides the area completely.

Subject pages additionally have a labelled top placement between the subject overview and a separate “Browse papers” section. The overview shows the subject, code, course, semester and actual resource/year coverage. The link scrolls directly to the filters and downloads; its short arrow animation stops after three cycles and respects reduced-motion settings. No timer, ad click or video playback is required to reach papers.

The top placement reuses `ads.displaySlot` by default. To measure it separately, create another AdSense Display ad unit and set its slot string in `ads.subjectSlot`; set that field to an empty string to disable only the top placement. The top slot reserves 250x250 on narrow phones, 300x250 from 380px wide, and 728x90 on desktop. It is requested only on populated subject pages on the live domain, once per document. The unit remains mounted outside the changing catalog content so filters and subject navigation do not refresh it. Empty subjects do not request this ad. This is the existing AdSense integration; Taboola/video demand would require that provider’s approved integration code.

In AdSense, create a Display ad unit and copy its `data-ad-slot` value into `ads.displaySlot` in `data/site.json` as a string. The existing publisher ID is already configured. Manual ad requests run only on paperonboard.in and www.paperonboard.in. The existing AdSense loader remains present for Auto ads.

For placement controlled entirely by this layout, turn off Auto ads for this site in the AdSense dashboard before enabling the manual slot. Otherwise Google can insert additional ads outside the reserved area. Check the published site on mobile and desktop after activation, including the open-source notice. Compare revenue, viewability and engagement in AdSense before increasing ad density; more ads do not guarantee more revenue.
