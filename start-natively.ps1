$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Host "Starting Natively from $repoRoot" -ForegroundColor Cyan

$localConfig = Join-Path $repoRoot 'start-natively.local.ps1'
if (Test-Path $localConfig) {
    Write-Host "Loading local startup config..." -ForegroundColor Yellow
    . $localConfig
}

if ($env:OS -eq 'Windows_NT') {
    $nativeModuleRoot = Join-Path $repoRoot 'native-module'
    $builtNative = Join-Path $nativeModuleRoot 'index.win32-x64-msvc.node'
    $installedNativeRoot = Join-Path $repoRoot 'node_modules\natively-audio'

    if (Test-Path $builtNative) {
        New-Item -ItemType Directory -Force -Path $installedNativeRoot | Out-Null
        Copy-Item `
            (Join-Path $nativeModuleRoot 'package.json'),
            (Join-Path $nativeModuleRoot 'index.js'),
            (Join-Path $nativeModuleRoot 'index.d.ts'),
            $builtNative `
            -Destination $installedNativeRoot `
            -Force
    }
}

if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
    Write-Host "node_modules not found. Running npm install first..." -ForegroundColor Yellow
    npm install
}

Write-Host "Launching dev app..." -ForegroundColor Green
npm run app:dev
