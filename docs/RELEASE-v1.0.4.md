# download.net launcher v1.0.4

App downloads now check that the destination supports creating and renaming files before transferring the package. If a saved folder such as Program Files is protected, the launcher switches to your Windows account's %LOCALAPPDATA%\Programs folder and saves the corrected setting. Common placeholder paths that omit the account name are repaired too.

Settings includes **Use recommended folder**, and Downloads links directly to installation settings. Custom folders are checked before saving. Error messages identify whether the failure happened while saving settings, caching the package, or installing files, without Electron's remote-method prefix.

This release also fixes cancelled cached downloads, temporary-file collisions, download stream failures, and completion progress. Windows file operations retry brief locks, and cleanup cannot replace the original verification error. All package hashes, traversal protection, and existing app files remain protected.

Installed versions 1.0.3 and later download this stable update automatically. Choose **Updates → Restart and update** when it is ready, or install this setup manually. Portable users should extract the complete ZIP to a new folder. Local accounts and previously installed apps remain in place.
