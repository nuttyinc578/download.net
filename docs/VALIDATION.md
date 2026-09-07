# Validation and remaining setup

Validated on 7 September 2026:

- Windows NSIS installer built: download.net-Setup-1.0.0.exe (103,431,638 bytes).
- All 17 Node tests passed, including account signup/login/logout, bootstrap ticket signatures and replay rejection, download integrity, cache handling, safe redirects, PE inspection, GitHub submission requests, and stale moderation approval rejection.
- The .NET API and Aspire AppHost compiled successfully.
- The Java executable inspector compiled and checked both a test fixture and the generated installer without executing them.
- A direct integration check passed from Go Bootstrap to C# verification; the C# website served the storefront.
- The Windows installer archive passed 7-Zip integrity testing. Its embedded archive produces a normal trailing-data warning because it is inside an installer executable.
- All 14 checked packaged launcher files exactly matched the tested source.
- The website production build passed and its private Sites deployment succeeded.
- Vned's actual Python runtime compiled vned/launcher.vned into the launcher flow configuration.

Limitations:

- The installed app was not run through an interactive installation or a complete live GitHub submission during this task. GitHub publishing is covered by mocked request tests.
- Local Aspire DCP startup timed out, so the full AppHost runtime could not be verified. The direct Go/C# service path passed. Use npm run dev for the local fallback, and verify the AppHost on the intended server/development machine.
- The installer is unsigned. Configure publisher code signing before a signed public release.
- No public Nuttyinc backend or AI provider credentials are configured.
- The initial reviewed catalog is empty. It becomes reachable when the repository source/catalog is published.
- GitHub access was rechecked and remains read-only, so the repository changes, Pages workflow, nightly workflow, and v1.0 release have not been published.
- The live Sites URL is a private website/store preview. Account operations run on the C# website after backend deployment.

Installer SHA-256:
c12b87ad16d28a266b5c103eacdb1be77a35a6cb14774ac403a6372cb60d8274

