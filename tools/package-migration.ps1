[CmdletBinding()]
param(
    [string]$Distro = 'Ubuntu-24.04',
    [switch]$WslRoot,
    [switch]$SkipPull,
    [switch]$AllowDirty,
    [switch]$NoVerify
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'WSL is required. On a Linux Docker host run: sh tools/package-migration.sh'
}
$wslArgs = @('-d', $Distro)
if ($WslRoot) { $wslArgs += @('-u', 'root') }
$wslArgs += @('--cd', $repositoryRoot, '--', 'sh', 'tools/package-migration.sh')
if ($SkipPull) { $wslArgs += '--skip-pull' }
if ($AllowDirty) { $wslArgs += '--allow-dirty' }
if ($NoVerify) { $wslArgs += '--no-verify' }
& wsl.exe @wslArgs
if ($LASTEXITCODE -ne 0) { throw "Docker bundle build failed (exit $LASTEXITCODE)." }
