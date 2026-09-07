# download.net

A Windows app and game store by Nuttyinc. Built with Electron, Node.js, Go, C#, .NET Aspire, Java, and Vned.

[Website](https://nuttyinc578.github.io/download.net/) · [Download v1.0](https://github.com/nuttyinc578/download.net/releases/download/v1.0/download.net-launcher-v1-folder.zip) · [Nightly download](https://nightly.link/nuttyinc578/download.net/workflows/nightly.yml/main/download.net-launcher-v1.zip) · [MIT license](LICENSE) · [Code of conduct](CODE_OF_CONDUCT.md) · [Contributing](CONTRIBUTING.md)

The website and v1.0 release are published. Download the complete folder ZIP, extract every file together, and open download.net.exe. Nightly builds are also produced by GitHub Actions; if nightly.link is unavailable, use the permanent v1.0 download. This initial implementation has no approved app listings and no preconfigured public Nuttyinc server.

## Run locally

Install Node.js 22+, .NET SDK 8, Go 1.23+, and a JDK 17+ (Java is used for submission inspection).

```sh
npm ci
npm run build:web
npm run dev
```

Open http://127.0.0.1:5080 for the Aspire-compatible website and account system. The developer script starts the C# website and Go bootstrap with a shared ephemeral secret. Account records persist in the ignored `data/` directory. Sessions live in memory and expire after seven days or a server restart.

The installed Windows launcher includes its own backend. It starts the .NET API and Go Bootstrap automatically on private loopback ports, verifies their connection, and stops both services on exit. Accounts and cache persist under the launcher’s user-data directory. These accounts belong to this PC; they are not a shared hosted identity. The manual server-address form and Save connection button have been removed.

To run Electron from source, first build the Windows service binaries:

```sh
npm run build:runtime
npm start
```

Create a local Nuttyinc account to publish. Downloads do not require an account. No downloaded third-party executable is automatically run.

## Run with .NET Aspire

Set the Aspire parameter `bootstrap-secret` to a random secret of at least 32 characters using user-secrets:

```sh
dotnet user-secrets init --project services/AppHost
dotnet user-secrets set 'Parameters:bootstrap-secret' 'YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS' --project services/AppHost
dotnet run --project services/AppHost
```

The AppHost orchestrates the C# website and the Go Bootstrap service with service references and startup ordering. Node.js runs the Electron download engine. Java runs executable inspection in the review workflow. Vned generates the launcher’s connection-stage text at build time.

## Build the complete launcher folder

Run `npm run build:desktop` on Windows. It builds the website, publishes the self-contained .NET API, compiles Go Bootstrap, and creates the custom NSIS installer plus `artifacts/win-unpacked`. The installer includes all runtime files; users do not need Node.js, Go, or a .NET SDK. For portable use, keep every file together and open download.net.exe. CI verifies the actual installer payload against the current source and tests account persistence with the packaged services before publishing setup and the folder ZIP.

## Package your own app folder

Build your app with its normal compiler first. Include its executable, DLLs, assets, configuration, and other runtime files in one release folder. Use vfdn.ps1 build or vnedfordownloaddotnet build to bundle every file into one .vfdn package. See [the package format and command guide](docs/FOLDER-PACKAGES.md) for commands and installation behavior.

## How downloads work

1. Electron requests a short-lived HMAC-signed ticket from Nuttyinc Bootstrap.
2. It rejects an unexpected API origin and asks the C# API to verify the ticket. Reused and expired tickets are rejected.
3. The launcher fetches the app manifest from the Aspire website’s reviewed GitHub catalog.
4. Node.js streams the .vfdn folder package into its local cache. Redirects are restricted to GitHub release hosts, with limits on size and SHA-256 validation.
5. After verifying the package hash, the launcher extracts all files into a temporary folder and verifies each file. Only a completely verified folder is moved to %LOCALAPPDATA%\Programs\<app-id>-<package-hash-prefix>. Settings lets you choose another writable Programs folder, such as C:\Programs. Failed or cancelled partials are discarded; existing downloads and installations are verified before reuse.

SHA-256 verifies integrity, not malware safety. The launcher never starts a downloaded executable automatically. The API caches the reviewed catalog in memory for five minutes and writes a cache snapshot to disk. It fails closed when a new catalog fetch fails after expiry.

## Publishing apps

The desktop form accepts a whole app folder, name, ID, version, category, description, license, and GitHub token. It detects all files, displays their count and total size, and builds the same .vfdn format as the command-line builder. It creates the user’s fork, uploads the package to a public GitHub prerelease, commits one catalog manifest, and opens a pull request in nuttyinc578/download.net. Every file in the selected folder becomes public. Package inspection verifies all file hashes; Java checks contained .exe files without executing them.

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

Tests exercise real account signup/login/logout, password hashing, bootstrap signatures and replay rejection, manifest validation, verified cache reuse, corrupted/truncated/oversized/cancelled downloads, redirect restrictions, Windows PE validation, whole-folder round trips, unsafe paths and junctions, cancelled extraction, deterministic builds, and preservation of existing installations.
