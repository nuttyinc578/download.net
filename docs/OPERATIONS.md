# Hosting and review setup

## Automatic desktop backend

Version 1.0.1 bundles the Windows x64 .NET API runtime and Go Bootstrap under `resources/runtime`. The launcher starts these files itself, listens only on 127.0.0.1 with automatically allocated ports, and verifies a fresh signed bootstrap ticket before using either service. No manual connection settings are required. Closing the launcher closes the child processes; stdin EOF also shuts them down if the launcher exits unexpectedly.

The account database and catalog cache live in the launcher’s user-data directory under `backend`, outside the installation folder, so normal updates preserve them. One launcher instance runs per Windows user. Accounts are local to this PC. The approved catalog still comes from GitHub, and metadata moderation still requires a configured provider.

For runtime changes, run `npm run build:runtime` and `npm run verify:runtime`; the check starts the real binaries and verifies account creation, authentication, logout, persistence across restart, and process shutdown. CI repeats it against the packaged resources and extracts the installer to compare all installed files with this build.

## Optional public Nuttyinc services

GitHub Pages can host the static download page, but it cannot run .NET Aspire, Node.js servers, Go services, or account storage. Host the C# website/API and Go Bootstrap on a server under your control. `compose.yaml` builds both services; `docs/Caddyfile.example` shows HTTPS reverse-proxy configuration.

1. Point two DNS names to your server, one for the API/website and one for Bootstrap.
2. Set `BOOTSTRAP_SECRET` to the same random value on both services (at least 32 bytes). Set `NUTTY_API_URL` to the public HTTPS API origin.
3. Run `docker compose up --build -d`, then configure the HTTPS proxy. The container ports bind to host loopback by default.
4. Test registration, sign-in, bootstrap verification, and the reviewed catalog on the hosted website before announcing the service. The desktop release currently uses its bundled local backend; it does not expose a manual remote-server form.
5. Back up the `nutty-data` volume and restrict access. Use one API replica with this local JSON account store. Before larger-scale operation, replace it with a managed database, shared sessions, email verification, account recovery, and operational monitoring.

The current account implementation provides PBKDF2-SHA256 with individual salts, 600,000 iterations, random server-side sessions, HttpOnly SameSite=Strict cookies, authentication rate limiting, and atomic account writes. Cookies are secure in production. There is no email delivery, password reset, or email ownership verification in this initial version. Sessions end on process restart. Do not expose the development server or use the local HTTP settings for public deployment.

## GitHub Pages and release

- Enable GitHub Pages with **GitHub Actions** as its source.
- Push this implementation to `main`; `pages.yml` publishes the landing page and `nightly.yml` builds the complete Windows installer and app folder ZIP, including both backend services.
- The main Download now button links to the permanent v1.0 release asset and does not depend on the GitHub API or nightly.link being available.
- The nightly URL points to the latest successful main-branch artifact, named `download.net-launcher-v1`. Artifacts expire after 30 days; run the workflow again to refresh it.
- Push a version tag such as `v1.0.1` with matching package version and `docs/RELEASE-v1.0.1.md`. The workflow creates the tagged release with setup, the complete app folder ZIP, and SHA-256 checksums. Keep old release tags immutable.
- If nightly.link reports that this public repository cannot be found, install the [nightly.link GitHub App](https://github.com/apps/nightly-link) for this repository with read-only Actions and metadata access, as recommended by [nightly.link](https://nightly.link/), then recheck the link. Public downloads do not require visitors to install the app. The tagged release remains the fallback.
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
{"decision":"approve","sha256":"THE_REVIEWED_SHA256","manifestSha256":"THE_REVIEWED_MANIFEST_SHA256","reviewedBy":"MAINTAINER_LOGIN","aiRunUrl":"https://github.com/nuttyinc578/download.net/actions/runs/RUN_ID","inspectionRunUrl":"https://github.com/nuttyinc578/download.net/actions/runs/RUN_ID"}
```

Protect `main` with required checks and code-owner reviews. Require review of `/catalog/`, `/reviews/`, `/.github/`, `/scripts/`, and `/shared/` using the provided CODEOWNERS file. Dismiss stale reviews and prevent direct pushes and bypasses. These GitHub administration settings cannot be enforced by repository files alone. Until configured, public submissions must not be accepted as approved listings.

## Current deployment limits

The accompanying Sites URL is a hosted website preview. It includes the static store UI; the Nuttyinc account and Bootstrap services still require the server deployment above. GitHub Pages and release v1.0 are published at nuttyinc578/download.net. The separate Sites preview has not received the latest folder-edition update. Never paste a personal access token into chat.


For local development, set CATALOG_FILE to an absolute local approved-catalog JSON file and ASPNETCORE_ENVIRONMENT to Development. The same catalog validation applies. Production ignores CATALOG_FILE and fetches the reviewed GitHub catalog.
