# Contributing.

Build something people can trust

Thank you for helping download.net grow. Contributions may include code, documentation, accessibility improvements, bug reports, and Windows app submissions.

Before you begin

Check existing issues and pull requests. Keep changes focused. Follow the MIT license for this launcher and respect the separate license of every third-party app. Never commit secrets or personal access tokens.

Submit your app

Sign in to your Nuttyinc account in the launcher. Choose the complete built app folder, enter an honest description, version, category, and license, then provide your GitHub token. The launcher detects every regular file, preserves subfolders, and builds one .vfdn package with file sizes and SHA-256 hashes. Include DLLs, assets, and configuration; check that the folder contains no private files.

Your GitHub token

Your token is used in memory to prepare your fork, create a public prerelease with the complete .vfdn folder package, and open a pull request in nuttyinc578/download.net. It must permit fork creation, release asset uploads, content commits, and pull requests. Revoke it through GitHub settings if you no longer need it.

Review and distribution

Your pull request must pass manifest validation, folder verification and executable structure inspection, configured AI moderation, and human review. AI reviews listing text, not executable safety. Maintainers verify distribution rights and provenance before merging. Rejected submissions stay out of the catalog.

Update an app

Submit a new version and package hash for review. Never silently replace an asset. Downloads with a mismatched size or hash are discarded. Maintain backward compatibility when possible and explain breaking changes.

Contribute code

Install Node.js, .NET, Go, and a JDK. Run the documented tests before opening a focused pull request. Do not run submitted executable files during tests or review.

End of contributing guide.
