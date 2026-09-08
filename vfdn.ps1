$ErrorActionPreference='Stop'
$nodeCommand=Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Install Node.js 22 or later, then run vfdn.ps1 again.' }
& $nodeCommand.Source (Join-Path $PSScriptRoot 'scripts/vfdn.mjs') @args
exit $LASTEXITCODE
