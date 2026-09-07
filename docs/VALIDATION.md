# Folder edition validation — 7 September 2026

- All 29 Node tests passed. Coverage includes account sessions, signed Bootstrap tickets, acceptance of .vfdn catalog listings and rejection of old .exe listings, GitHub publishing requests, complete-folder installation, cache integrity, unsafe paths/junctions, cancellation, and preserving existing installations.
- The .NET API build passed with zero warnings and zero errors.
- The actual Python Vned runtime compiled the updated download and installation flow.
- The Windows x64 portable Electron folder was built. All 18 checked packaged files, including the builder commands, match current source.
- The command alias built a folder with an executable and nested asset. Package verification and the real Java inspector passed without executing the submitted app.
- The PowerShell wrapper parsed, but this machine's execution policy blocks running .ps1 files. The .cmd alias works without changing that policy.
- The website production build passed. Its generated storefront files match source, and the restored local preview returned HTTP 200.

Remaining setup and limits:

- The UI was not interactively tested and a real GitHub submission was not made; publishing is tested with mocked GitHub requests.
- No public Nuttyinc backend or AI provider is configured. The initial reviewed catalog is empty.
- GitHub CLI authentication was verified as nuttyinc578 with repository write/admin access on 7 September 2026. The repository now targets nuttyinc578/download.net. Check its Actions and Releases pages for current publication status.
- The private Sites website is a preview; account operations require the hosted C# backend.
- The previous full Aspire DCP startup attempt timed out. The API and AppHost compiled previously, and the direct Go-to-C# verification smoke passed. Verify full AppHost startup on the intended host.
- The launcher build is unsigned. Folder packages preserve portable app files; they do not perform application-specific registry, driver, or system installer steps.

