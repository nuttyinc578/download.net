param([string]$ArchiveTool = (Join-Path $env:ProgramFiles '7-Zip/7z.exe'))
$ErrorActionPreference = 'Stop'
$package = Get-Content package.json -Raw | ConvertFrom-Json
$installer = (Resolve-Path ("artifacts/download.net-Setup-{0}.exe" -f $package.version)).Path
if ((Get-Item -LiteralPath $installer).VersionInfo.ProductVersion -ne $package.version) { throw 'Installer version does not match package.json.' }
if (!(Test-Path -LiteralPath $ArchiveTool)) { throw '7-Zip is required to inspect the installer payload.' }
$verification = Join-Path (Resolve-Path artifacts).Path ('installer-check-' + [Guid]::NewGuid().ToString('N'))
$outer = Join-Path $verification 'outer'
$payload = Join-Path $verification 'payload'
& $ArchiveTool x $installer "-o$outer" -y -bso0 -bsp0
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the installer for verification.' }
$archives = @(Get-ChildItem -LiteralPath $outer -Recurse -File -Filter 'app-64.7z')
if ($archives.Count -ne 1) { throw 'Expected exactly one Windows x64 app payload.' }
& $ArchiveTool x $archives[0].FullName "-o$payload" -y -bso0 -bsp0
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the embedded app folder.' }
node scripts/verify-packaged-source.cjs $payload
if ($LASTEXITCODE -ne 0) { throw 'Installer source verification failed.' }
$expectedRoot = (Resolve-Path artifacts/win-unpacked).Path
$expectedFiles = @(Get-ChildItem -LiteralPath $expectedRoot -Recurse -File)
foreach ($file in $expectedFiles) {
    $relative = [IO.Path]::GetRelativePath($expectedRoot, $file.FullName)
    $installedFile = Join-Path $payload $relative
    if (!(Test-Path -LiteralPath $installedFile) -or (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $installedFile).Hash) { throw "Installer file does not match this build: $relative" }
}
Write-Output ("PASS: installer {0} embeds this source and all {1} launcher/runtime files." -f $package.version, $expectedFiles.Count)
