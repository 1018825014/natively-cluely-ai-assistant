param(
    [string]$LicenseApiUrl = "http://101.43.20.2",
    [string]$WebsiteUrl = "http://101.43.20.2",
    [string]$PurchasePageUrl = "mailto:1018825014@qq.com?subject=Natively%20Lite%20Purchase",
    [string]$ActivationHelpUrl = "mailto:1018825014@qq.com?subject=Natively%20Lite%20Activation",
    [string]$SupportEmail = "1018825014@qq.com",
    [string]$UserDataName = "natively-lite-package-test"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $PSScriptRoot "build-license-lite.ps1"

& $buildScript `
    -LicenseApiUrl $LicenseApiUrl `
    -WebsiteUrl $WebsiteUrl `
    -PurchasePageUrl $PurchasePageUrl `
    -ActivationHelpUrl $ActivationHelpUrl `
    -SupportEmail $SupportEmail `
    -UserDataName $UserDataName

$version = (node -p "require('./package.json').version" | Out-String).Trim()
$releaseDir = Join-Path $root "release"

$installer = Join-Path $releaseDir "面试岸 Setup $version.exe"
$portable = Join-Path $releaseDir "面试岸 $version.exe"
$testInstaller = Join-Path $releaseDir "面试岸 测试专用 Setup $version.exe"
$testPortable = Join-Path $releaseDir "面试岸 测试专用 $version.exe"

Copy-Item $installer $testInstaller -Force
Copy-Item $portable $testPortable -Force

Write-Host "Created test installer: $testInstaller"
Write-Host "Created test portable: $testPortable"
Write-Host "Isolated user data directory: $UserDataName"
