# download.net launcher v1.0.3

The new Updates tab checks for stable download.net releases at startup and every six hours. Installed launchers download updates in the background, verify them, and apply them when you close download.net. Choose Restart and update to install immediately after current transfers finish. Nuttyinc's bundled services stop before the launcher restarts.

The tab shows your version, the latest version, download progress, release notes, and a manual Check for updates button. Failed downloads can be retried. App-submission prereleases and older versions are excluded.

Install this 1.0.3 setup once to enable automatic updates for future releases. Versions 1.0.2 and earlier do not have an updater. Portable folders can check for releases; use Windows setup to enable automatic installation. Local accounts, settings, installed games, and cache stay in their existing locations.

This release includes latest.yml and the installer blockmap required by electron-updater, as well as setup, the full portable folder, and SHA256SUMS.txt. Future tagged releases publish these files automatically. Updates verify SHA-512 hashes over HTTPS from this GitHub repository. The current Windows builds remain unsigned.
