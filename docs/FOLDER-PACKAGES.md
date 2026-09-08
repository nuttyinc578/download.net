# Complete app folders with VFDN

Build your app using its own toolchain first. Put the ready-to-run app and all its runtime files in a release folder. VFDN bundles that folder into one download; it does not compile arbitrary Java, C#, Go, Python, or Vned source code.

## Commands

Install Node.js 22 or later. From the extracted source or builder directory:

~~~powershell
.\vfdn.ps1 build "C:\Builds\My App" -Output "C:\Builds\MyApp.vfdn"
.\vnedfordownloaddotnet.cmd build "C:\Builds\My App" --out "C:\Builds\MyApp.vfdn"
.\vfdn.ps1 inspect "C:\Builds\MyApp.vfdn"
.\vfdn.cmd extract --vfnd "C:\Builds\MyApp.vfdn" -n my-app ----method-download.net -----plugin-download.net
.\vfdn.ps1 extract --vfnd "C:\Builds\MyApp.vfdn" -n my-app ----method-download.net -----plugin-download.net -Output "C:\Programs"
~~~

After npm link in the source checkout, the commands are also available as vnedfordownloaddotnet build and vfdn extract. If local PowerShell policy blocks scripts, use the .cmd command; no policy change is required.

The extract command accepts both --vfnd (the requested spelling) and --vfdn. Pass -n with your app ID. The method and plugin flags select the bundled download.net extractor; downloaded scripts and plugins are never executed. Add --sha256 with the reviewed catalog hash to verify provenance as well as the internal file hashes. Without it, manual extraction verifies package structure and internal hashes only. The launcher always supplies the reviewed hash. Extraction defaults to the per-user Programs folder.

The output must be outside the source folder and must not already exist. The builder includes every regular file, hidden filename, and empty directory. It does not apply ignore rules. Links, junctions, device names, alternate data streams, invalid Windows paths, and case-colliding paths are rejected explicitly. Keep the folder unchanged during the build. A file that changes while being copied fails verification.

## Publish and download

In the desktop launcher, sign in, choose **Publish an app → Choose folder**, review the file count and total size, fill in the listing, and provide your GitHub token. Check the folder for private material before consenting: its entire contents are uploaded publicly as one .vfdn release asset. The app builds the package automatically and opens a review pull request. The separate build command produces the identical package format for local builds and inspection.

After a maintainer merges your manifest, the Publish verified catalog workflow verifies it and updates catalog/apps.json. New manifests are stored in catalog/submissions/; legacy submissions/ entries still work.

Once listed, **Download** connects to Bootstrap, verifies the ticket, fetches the approved catalog manifest from Aspire, caches the package using Node.js, and verifies and installs every file.

Default destination: %LOCALAPPDATA%\Programs\<app-id>-<first-16-characters-of-package-sha256>.

Use **Settings → Choose Programs folder** for C:\Programs or another writable directory. C:\Program Files usually requires administrator write permission; this launcher does not request elevation. An unwritable selection produces an error so you can choose a writable folder.

Each distinct package has its own installation folder. Repeated downloads verify and reuse matching files. Changed existing files are preserved, and the launcher asks you to choose a different Programs folder. It never runs downloaded programs automatically. **Open app folder** reveals the installed directory. Apps that require registry changes, drivers, or their own installers need their publisher's separate setup process; use a portable app release folder for this store.

## Format v1

- Extension: .vfdn; first 8 bytes: ASCII VFDNPK1 followed by LF.
- Next 4 bytes: unsigned little-endian JSON header length.
- UTF-8 JSON header: format = "vfdn", version = 1, directories = [relative paths], and files = [{path, size, sha256}].
- Payload: exact file bytes concatenated in inventory order, without compression, padding, or trailing bytes.
- Paths use /, preserve case, and must not escape the installation directory.
- Limits: 2 GiB total package size, 8 MiB header, 20,000 combined file/directory entries, 240 characters per relative path.
- The catalog SHA-256 covers the whole package. Each file also has its own SHA-256.
- Extraction is staged in a new directory under the selected Programs root. Nothing becomes an installed app until all hashes pass. Failed and cancelled staging folders are removed.

The uncompressed format supports streaming with bounded memory and has no archive decompression-bomb behavior. Validation provides integrity and path protection, not malware detection. Java structurally inspects included executable files in the trusted review workflow; AI moderation reviews listing text.

The command name is vnedfordownloaddotnet. The launcher continues using the actual Python Vned runtime separately to compile its trusted connection-stage configuration.

