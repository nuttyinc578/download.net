download.net launcher v1.0.1 fixes the outdated Windows installer and connects to Nuttyinc automatically.

- Updated custom setup installs the current launcher, including whole-folder app publishing and VFDN downloads.
- The .NET API and Go Bootstrap are included and start automatically when the launcher opens. No separate runtime installation, server-address form, or Save connection button is needed.
- Accounts and catalog cache are stored on this Windows account's PC. Accounts are local to this installation; they are not a hosted account shared between devices.
- Both services listen only on this PC and stop when the launcher closes. Account data is retained for the next launch.
- The installer keeps the existing application identity so it can update the older installation. The app displays version 1.0.1.

[Download the updated Windows installer](https://github.com/nuttyinc578/download.net/releases/download/v1.0.1/download.net-Setup-1.0.1.exe)

[Download the complete portable folder](https://github.com/nuttyinc578/download.net/releases/download/v1.0.1/download.net-launcher-v1-folder.zip)

[Latest nightly build](https://nightly.link/nuttyinc578/download.net/workflows/nightly.yml/main/download.net-launcher-v1.zip)

Close the older launcher before running setup. For the portable version, extract every file together and open download.net.exe. Downloaded apps install into %LOCALAPPDATA%\Programs by default; Settings lets you choose another writable folder such as C:\Programs.

The GitHub catalog starts empty until submissions are reviewed and approved. AI moderation still requires a configured provider. The setup is unsigned. File integrity checks do not constitute a malware scan.
