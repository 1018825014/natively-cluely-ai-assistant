$ErrorActionPreference = 'Stop'

function Test-FileContentMatch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,

        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    if (-not (Test-Path $Source) -or -not (Test-Path $Destination)) {
        return $false
    }

    $sourceItem = Get-Item $Source
    $destinationItem = Get-Item $Destination

    if ($sourceItem.Length -ne $destinationItem.Length) {
        return $false
    }

    return (Get-FileHash -Algorithm SHA256 $Source).Hash -eq (Get-FileHash -Algorithm SHA256 $Destination).Hash
}

function Sync-FileIfChanged {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,

        [Parameter(Mandatory = $true)]
        [string]$DestinationDirectory
    )

    $destinationPath = Join-Path $DestinationDirectory (Split-Path $Source -Leaf)

    if (Test-FileContentMatch -Source $Source -Destination $destinationPath) {
        Write-Host "Native dependency already up to date: $(Split-Path $Source -Leaf)" -ForegroundColor DarkGray
        return
    }

    try {
        Copy-Item -LiteralPath $Source -Destination $DestinationDirectory -Force
        Write-Host "Updated native dependency: $(Split-Path $Source -Leaf)" -ForegroundColor DarkGray
    }
    catch {
        $message = $_.Exception.Message
        throw "Failed to sync $(Split-Path $Source -Leaf) into node_modules. If Natively is already running, close the running app and try again. Original error: $message"
    }
}

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
        @(
            (Join-Path $nativeModuleRoot 'package.json'),
            (Join-Path $nativeModuleRoot 'index.js'),
            (Join-Path $nativeModuleRoot 'index.d.ts'),
            $builtNative
        ) | ForEach-Object {
            Sync-FileIfChanged -Source $_ -DestinationDirectory $installedNativeRoot
        }
    }
}

if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
    Write-Host "node_modules not found. Running npm install first..." -ForegroundColor Yellow
    npm install
}

Write-Host "Launching dev app..." -ForegroundColor Green
npm run app:dev
