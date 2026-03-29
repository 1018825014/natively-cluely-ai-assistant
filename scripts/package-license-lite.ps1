param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $OutputPath) {
    $OutputPath = Join-Path $root "tmp\license-lite.tar.gz"
}

$stagingRoot = Join-Path $root "tmp\license-lite-package"
$stagingApp = Join-Path $stagingRoot "license-lite"

if (Test-Path $stagingRoot) {
    Remove-Item $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingRoot | Out-Null
Copy-Item (Join-Path $root "license-lite") $stagingRoot -Recurse

$pathsToRemove = @(
    (Join-Path $stagingApp "node_modules"),
    (Join-Path $stagingApp ".env"),
    (Join-Path $stagingApp "data")
)

foreach ($path in $pathsToRemove) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force
    }
}

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

if (Test-Path $OutputPath) {
    Remove-Item $OutputPath -Force
}

tar -czf $OutputPath -C $stagingRoot license-lite
Write-Host "Created archive: $OutputPath"
