# download.net launcher v1.0.2

New Nuttyinc accounts must read and accept Contributor Covenant 2.1. Scroll to the end, then hold to accept before creating an account. The backend enforces acceptance and records the policy version, text fingerprint, and time. Existing accounts continue to sign in.

Catalog publishing now follows maintainer merges: package and file verification must pass before an app appears. New manifests go in catalog/submissions/, with legacy submissions supported. Repository writers publish from a branch without trying to fork their own repository; other contributors reuse or create a fork. AI listing review runs when a provider is configured.

Download caches the .vfdn package and uses the bundled download.net extractor to install the whole app folder into Programs. The standalone vfdn extract command supports --vfnd, -n, ----method-download.net, and -----plugin-download.net. Packages are data; embedded scripts are not run.

The updated Windows setup and portable ZIP include the automatic local .NET API and Go Bootstrap. Install the new setup to update the launcher; local accounts and cache persist. For portable use, extract the entire ZIP and keep all files together. SHA256SUMS.txt identifies these release assets.

The launcher software is MIT licensed. Contributor Covenant 2.1 and the reporting adaptation are CC BY 4.0. Binaries are unsigned. No AI provider is currently configured; merged apps receive package integrity and executable structure checks, not a malware safety guarantee.
