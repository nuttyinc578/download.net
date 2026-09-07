# download.net

A Windows app and game store by Nuttyinc. Built with Electron, Node.js, Go, C#, .NET Aspire, Java, and Vned.

[Website](https://nuttyinc.github.io/download.net/) · [Nightly download](https://nightly.link/nuttyinc/download.net/workflows/nightly.yml/main/download.net-launcher-v1.zip) · [MIT license](LICENSE) · [Code of conduct](CODE_OF_CONDUCT.md) · [Contributing](CONTRIBUTING.md)

The website and nightly links become available after the supplied workflows are pushed and successfully run. This initial implementation has no approved app listings and no preconfigured public Nuttyinc server.

## Run locally

Install Node.js 22+, .NET SDK 8, Go 1.23+, and a JDK 17+ (Java is used for submission inspection).

```sh
npm ci
npm run build:web
npm run dev
```

Open http://127.0.0.1:5080 for the Aspire-compatible website and account system. The developer script starts the C# website and Go bootstrap with a shared ephemeral secret. Account records persist in the ignored `data/` directory. Sessions live in memory and expire after seven days or a server restart.

In another terminal:

```sh
npm start
```

In the launcher’s Settings, enter `http://127.0.0.1:5080` as the API and `http://127.0.0.1:5090` as Bootstrap. Create a Nuttyinc account to publish. Downloads do not require an account. No third-party executable is automatically run.

## Run with .NET Aspire

Set the Aspire parameter `bootstrap-secret` to a random secret of at least 32 characters using user-secrets:

```sh
dotnet user-secrets init --project services/AppHost
dotnet user-secrets set 'Parameters:bootstrap-secret' 'YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS' --project services/AppHost
dotnet run --project services/AppHost
```

The AppHost orchestrates the C# website and the Go Bootstrap service with service references and startup ordering. Node.js runs the Electron download engine. Java runs executable inspection in the review workflow. Vned generates the launcher’s connection-stage text at build time.

## Build the installer

```sh
node scripts/installer-art.mjs
npm run build:web
npm run build:desktop
```

Windows x64 setup is written to `artifacts/download.net-Setup-1.0.0.exe`. The custom NSIS wizard includes the MIT agreement, installation directory, desktop shortcut, and uninstaller. The default local build is unsigned. For distribution under your publisher identity, configure electron-builder code signing before release.

## How downloads work

1. Electron requests a short-lived HMAC-signed ticket from Nuttyinc Bootstrap.
2. It rejects an unexpected API origin and asks the C# API to verify the ticket. Reused and expired tickets are rejected.
3. The launcher fetches the app manifest from the Aspire website’s reviewed GitHub catalog.
4. Node.js streams the `.exe` into a temporary file. Redirects are restricted to GitHub release hosts, with limits on size and SHA-256 validation.
5. Only matching files are finalized in the user’s `Downloads/download.net` directory. Failed or cancelled partials are discarded. Existing downloads are hashed again before reuse.

SHA-256 verifies integrity, not malware safety. The launcher never starts a downloaded executable automatically. The API caches the reviewed catalog in memory for five minutes and writes a cache snapshot to disk. It fails closed when a new catalog fetch fails after expiry.

## Publishing apps

The desktop form accepts a local `.exe`, name, ID, version, category, description, license, and GitHub token. It checks PE structure and calculates the real file hash and size. It then creates the user’s fork, uploads the binary to a public GitHub prerelease, commits one JSON manifest, and opens a pull request in `nuttyinc/download.net`.

The token is kept in process memory only and cleared from the input immediately. It is not stored in settings, sent to Nuttyinc, or committed. It must authorize creating a fork, uploading release assets, writing fork contents, and opening an upstream PR. GitHub organization policies and token restrictions can still reject the request; the launcher surfaces that error. The uploaded release can remain if creating the PR later fails, and the launcher links it for cleanup.

See [Hosting and review setup](docs/OPERATIONS.md) before accepting public submissions.

## Vned integration

`vned/launcher.vned` uses the actual `SET`, `IF … THEN`, and `PRINT` syntax in your Python-based Vned runtime. Its output becomes `web/flow.js`, consumed by the launcher download queue. Set `VNED_RUNTIME` to the path of `Vned Runtime.py` and run `npm run build:web` to recompile. The nightly workflow fetches the runtime from an immutable commit of your repository. Python and the runtime are build-time tools; the Electron app uses the compiled output.

Upstream: [Vned runtime](https://github.com/nuttyinc578/Vned-progeraiming-lingerge/blob/ca943f962c468b6d1d35025672aa14cec30b4c53/68c9f55e4dc1f/vned/Vned%20Runtime.py). The GPL-licensed runtime remains separate and is not redistributed as part of this MIT launcher. Only trusted, repository-owned Vned scripts are compiled; the upstream interpreter evaluates Python expressions and must not receive app submissions or arbitrary user scripts.

## Verification

```sh
dotnet build services/Api/Api.csproj -c Release
npm test
dotnet build services/AppHost/AppHost.csproj -c Release
go test ./...
# Run the Go command from services/bootstrap.
javac --release 17 -d services/inspector/build services/inspector/ExeInspector.java
node scripts/validate-catalog.mjs
```

Tests exercise real account signup/login/logout, password hashing, bootstrap signatures and replay rejection, manifest validation, verified cache reuse, corrupted/truncated/oversized/cancelled downloads, redirect restrictions, and Windows PE validation.


