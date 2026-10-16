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

Do not send passwords in chat, put them in JSON, or commit `.env` files. The workflow reads secrets only in the deploy step on `main`. Pull requests—including contributions from forks—run checks without FTP secrets. Require PR review on `main` so changes to workflows and deployment code are reviewed before merging.

InfinityFree documents using [GitHub Actions for FTP uploads](https://forum.infinityfree.com/t/using-github-actions-for-automatic-upload-to-infinityfree/111008). Its FTP service supports [TLS via ftpupload.net](https://forum.infinityfree.com/t/ftp-encryption-where-did-it-go/82911). The included uploader uses explicit FTPS on port 21, verifies the TLS certificate, and encrypts data transfers. It does not fall back to plaintext FTP.

## Protect `main` before accepting contributions

After the first push, go to **Settings → Rules → Rulesets → New ruleset → New branch ruleset**. Name it `Protect main`, set enforcement to **Active**, and target `main` (or the default branch). Leave the bypass list empty if everyone should follow the rule.

Enable **Require a pull request before merging**, **Block force pushes**, and **Restrict deletions**. Under the pull request rule, require **1 approval**, dismiss stale approvals when new commits arrive, and require review conversations to be resolved. Once the workflow has run, enable **Require status checks to pass** and select the `site` check from this project's workflow.

Public visitors do not have push access by default: they fork the repository and submit PRs. Give write access only to trusted maintainers. PR authors cannot approve their own PR; with one required approval and no bypass, your own PRs will also need another trusted reviewer. If you are the only maintainer, requiring PRs with zero required approvals still blocks direct pushes, and you can manually review outside contributions before merging.

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

If contributor retrieval, validation, tests, or upload fails, the workflow fails visibly. Contributor retrieval failures do not publish an empty replacement list. Missing FTP secrets fail deployment; deployment stays skipped until `DEPLOY_ENABLED` is set.

The workflow has not been connected to a live repository or FTP account yet. The first live upload must confirm that the selected InfinityFree directory, credentials, TLS, and rename operations work for your account.
