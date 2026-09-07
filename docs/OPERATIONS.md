# Hosting and review setup

## Public Nuttyinc services

GitHub Pages can host the static download page, but it cannot run .NET Aspire, Node.js servers, Go services, or account storage. Host the C# website/API and Go Bootstrap on a server under your control. `compose.yaml` builds both services; `docs/Caddyfile.example` shows HTTPS reverse-proxy configuration.

1. Point two DNS names to your server, one for the API/website and one for Bootstrap.
2. Set `BOOTSTRAP_SECRET` to the same random value on both services (at least 32 bytes). Set `NUTTY_API_URL` to the public HTTPS API origin.
3. Run `docker compose up --build -d`, then configure the HTTPS proxy. The container ports bind to host loopback by default.
4. Configure both public origins in the launcher. Test registration, sign-in, bootstrap verification, and an approved download before announcing the service.
5. Back up the `nutty-data` volume and restrict access. Use one API replica with this local JSON account store. Before larger-scale operation, replace it with a managed database, shared sessions, email verification, account recovery, and operational monitoring.

The current account implementation provides PBKDF2-SHA256 with individual salts, 600,000 iterations, random server-side sessions, HttpOnly SameSite=Strict cookies, authentication rate limiting, and atomic account writes. Cookies are secure in production. There is no email delivery, password reset, or email ownership verification in this initial version. Sessions end on process restart. Do not expose the development server or use the local HTTP settings for public deployment.

## GitHub Pages and release

- Enable GitHub Pages with **GitHub Actions** as its source.
- Push this implementation to `main`; `pages.yml` publishes the landing page and `nightly.yml` builds the complete Windows app folder ZIP.
- The nightly URL points to the latest successful main-branch artifact, named `download.net-launcher-v1`. Artifacts expire after 30 days; run the workflow again to refresh it.
- Push tag `v1.0` when you are ready to publish. The workflow creates a release named **download.net launcher v1**, attaches the app folder ZIP, and includes the nightly.link URL.
- Workflow write permissions must allow releases and Pages. Configure branch rules before allowing external contributions.

## Moderation is a required review process

Create an environment named `moderation`, restrict deployment to the main branch, and require a trusted maintainer to approve runs. Add `MODERATION_URL` and `MODERATION_KEY` to that environment’s secrets. The HTTPS endpoint receives listing text, category, publisher, and license, and must return:

```json
{"decision":"approve","reason":"The listing meets the configured text policy."}
```

Allowed decisions are `approve`, `review`, and `reject`. Errors, invalid responses, or missing credentials fail the review and leave the app pending. The adapter is provider-neutral; connect your own AI service. No live AI provider or secret is configured by this source package.

Run **Review app submission** with a PR number. It checks out trusted main-branch code, fetches the single submission manifest as data from the exact PR commit, downloads the .vfdn package with hash and size checks, validates and extracts its file inventory into an isolated temporary directory, and uses Java to inspect every contained .exe without executing it. It then moderates the listing text. The report artifact binds the review to the PR head SHA and package hash. The workflow does not merge, comment, or change catalog permissions.

Before approval, inspect distribution rights, publisher provenance, dependency/installer behavior, antivirus results from your chosen scanner, and the AI report. Java structural validation and AI text review are not antivirus scans. Do not run submitted executable files on the review runner.

A maintainer creates `reviews/APP_ID-SHA256.json` with `decision`, `sha256`, `manifestSha256`, `reviewedBy`, `aiRunUrl`, and `inspectionRunUrl`. Copy `manifestSha256` from the successful moderation report; it binds the approval to all normalized listing fields, so later metadata edits require new review. Set `decision` to `approve` only after successful review. Merge the submission and approval through review, then run `npm run publish:catalog` and commit `catalog/apps.json`. No PR automatically becomes a live listing.

Approval record example (replace every placeholder with verified values):

```json
{"decision":"approve","sha256":"THE_REVIEWED_SHA256","manifestSha256":"THE_REVIEWED_MANIFEST_SHA256","reviewedBy":"MAINTAINER_LOGIN","aiRunUrl":"https://github.com/nuttyinc/download.net/actions/runs/RUN_ID","inspectionRunUrl":"https://github.com/nuttyinc/download.net/actions/runs/RUN_ID"}
```

Protect `main` with required checks and code-owner reviews. Require review of `/catalog/`, `/reviews/`, `/.github/`, `/scripts/`, and `/shared/` using the provided CODEOWNERS file. Dismiss stale reviews and prevent direct pushes and bypasses. These GitHub administration settings cannot be enforced by repository files alone. Until configured, public submissions must not be accepted as approved listings.

## Current deployment limits

The accompanying Sites URL is a hosted website preview. It includes the static store UI; the Nuttyinc account and Bootstrap services still require the server deployment above. GitHub release and Pages publication require repository write access. Connect a valid GitHub account with those permissions to publish the prepared code. Never paste a personal access token into chat.


For local development, set CATALOG_FILE to an absolute local approved-catalog JSON file and ASPNETCORE_ENVIRONMENT to Development. The same catalog validation applies. Production ignores CATALOG_FILE and fetches the reviewed GitHub catalog.
