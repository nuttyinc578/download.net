# Hosting and review setup

## Automatic desktop backend

Version 1.0.2 bundles the Windows x64 .NET API runtime and Go Bootstrap under `resources/runtime`. The launcher starts these files itself, listens only on 127.0.0.1 with automatically allocated ports, and verifies a fresh signed bootstrap ticket before using either service. No manual connection settings are required. Closing the launcher closes the child processes; stdin EOF also shuts them down if the launcher exits unexpectedly.

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
- The main Download now button links to the permanent v1.0.2 installer asset and does not depend on the GitHub API or nightly.link being available.
- The nightly URL points to the latest successful main-branch artifact, named `download.net-launcher-v1`. Artifacts expire after 30 days; run the workflow again to refresh it.
- Push a version tag such as `v1.0.2` with matching package version and `docs/RELEASE-v1.0.2.md`. The workflow creates the tagged release with setup, the complete app folder ZIP, and SHA-256 checksums. Keep old release tags immutable.
- If nightly.link reports that this public repository cannot be found, install the [nightly.link GitHub App](https://github.com/apps/nightly-link) for this repository with read-only Actions and metadata access, as recommended by [nightly.link](https://nightly.link/), then recheck the link. Public downloads do not require visitors to install the app. The tagged release remains the fallback.
- Workflow write permissions must allow releases and Pages. Configure branch rules before allowing external contributions.

## Catalog publication after merge

A maintainer approves publication by merging a submission into main. The **Publish verified catalog** workflow reads catalog/submissions/ and legacy submissions/, selects the most recently merged manifest per app ID, downloads the package, verifies its full SHA-256 and every file, and inspects contained Windows executable headers without running them. It updates catalog/apps.json only when verification succeeds. Failed verification leaves the previous catalog intact; inspect the failed Actions run, correct the submission, and rerun the workflow.

The workflow runs automatically for merged submission changes and can also be run manually. It uses the repository Actions token to commit catalog/apps.json. Allow Actions write access to contents; if branch rules reject that bot commit, allow this catalog workflow or commit its verified output through a maintainer PR. The API and website read main/catalog/apps.json, never a contributor's fork catalog. The API cache refreshes after five minutes; reopening the launcher starts a fresh cache.

Review distribution rights, publisher provenance, and the app's behavior before merging. Package verification establishes integrity and file structure; it is not an antivirus scan. Repository writers can also publish from a submission branch in the upstream repository, so the owner is never asked to fork their own repository. Other contributors reuse or create their own fork.

### Optional AI listing moderation

No AI provider is configured. Per the maintainer's chosen policy, merge approval plus package verification is sufficient for publication. To add AI review to automatic publication, set MODERATION_URL and MODERATION_KEY as repository Actions secrets. The HTTPS endpoint must return JSON with decision (approve, review, or reject) and reason. Once either setting is present, both are required and moderation must succeed before listing changes are published. AI evaluates listing text, not executable safety.

The manual **Review app submission** workflow remains available for pre-merge inspection and AI moderation. Its environment-scoped secrets belong to the moderation environment; configure those separately if using that workflow. It reads a single manifest from the exact PR head as data and runs trusted main-branch tools. A manual review requires its AI provider; it does not automatically approve or merge a PR.

Old reviews/ approval records are retained for history but are no longer required to populate the catalog. Protect main with required checks and code-owner review for catalog/, submissions/, scripts/, shared/, and workflows.

## Signup code of conduct

New accounts must accept the project's Contributor Covenant 2.1 before creation. build:web derives the displayed text, JSON policy metadata, and API constants from CODE_OF_CONDUCT.md. Rebuild the website and API together after edits. Acceptance includes the exact normalized document hash, version, and server UTC timestamp in users.json. Existing accounts retain normal login and are not assigned invented acceptance records. The repository, app, and static website contain the same covenant; static GitHub Pages cannot create accounts by itself.

## Current deployment limits

The accompanying Sites URL is a hosted website preview. It includes the static store UI; the Nuttyinc account and Bootstrap services still require the server deployment above. GitHub Pages and release v1.0.2 are published at nuttyinc578/download.net. The desktop release includes its automatic local backend. The separate Sites preview has not received the latest folder-edition update. Never paste a personal access token into chat.


For local development, set CATALOG_FILE to an absolute local approved-catalog JSON file and ASPNETCORE_ENVIRONMENT to Development. The same catalog validation applies. Production ignores CATALOG_FILE and fetches the reviewed GitHub catalog.

## Automatic launcher updates

The Updates tab uses electron-updater 6.8.9 with the public nuttyinc578/download.net GitHub release feed. Installations made by the Windows setup check at startup and every six hours. Stable, higher versions download automatically and install on normal app exit, or with Restart and update. The latter waits until transfers finish and stops the local backend before running setup. Portable copies only check and notify.

Every future release must increment package.json and package-lock.json, add matching release notes, and use a new immutable version tag. The build generates and verifies latest.yml with the installer filename, size, and SHA-512, and publishes the .exe.blockmap alongside setup. Do not upload a new installer without matching metadata. App submission prereleases are excluded. The channel does not consume nightly.link artifacts.

CI verifies the actual installer payload, updater dependency and GitHub configuration, metadata hash, backend account persistence, and regression tests before publishing. No updater token is distributed to users. Existing builds have no Authenticode certificate; integrity relies on GitHub HTTPS and release SHA-512 metadata. Signing can be added later with the normal electron-builder certificate configuration.
