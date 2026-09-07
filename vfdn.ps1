param(
  [Parameter(Position=0)][ValidateSet('build','inspect','help')][string]$Command='help',
  [Parameter(Position=1)][string]$Source,
  [Alias('Out')][string]$Output
)
$ErrorActionPreference='Stop'
$nodeCommand=Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Install Node.js 22 or later, then run vfdn.ps1 again.' }
$buildArguments=@((Join-Path $PSScriptRoot 'scripts/vfdn.mjs'),$Command)
if ($Source) { $buildArguments+=$Source }
if ($Output) { $buildArguments+=@('--out',$Output) }
& $nodeCommand.Source @buildArguments
exit $LASTEXITCODE

