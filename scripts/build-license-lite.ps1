param(
    [string]$LicenseApiUrl = "http://101.43.20.2",
    [string]$WebsiteUrl = "http://101.43.20.2",
    [string]$PurchasePageUrl = "mailto:1018825014@qq.com?subject=Natively%20Lite%20Purchase",
    [string]$ActivationHelpUrl = "mailto:1018825014@qq.com?subject=Natively%20Lite%20Activation",
    [string]$SupportEmail = "1018825014@qq.com",
    [string]$UserDataName = "",
    [string[]]$ElectronBuilderArgs = @()
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

$commercialConfigPath = Join-Path $root "commercial.config.json"
$runtimeBuildConfigPath = Join-Path $root "dist-electron\runtime-build-config.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$overrides = @{
    "NATIVELY_LICENSE_API_URL" = $LicenseApiUrl
    "NATIVELY_REQUIRE_LICENSE" = "true"
    "NATIVELY_HOSTED_ENABLED" = "false"
    "NATIVELY_HIDE_BYOK" = "false"
    "NATIVELY_WEBSITE_URL" = $WebsiteUrl
    "NATIVELY_DOWNLOAD_URL" = $WebsiteUrl
    "NATIVELY_WINDOWS_DOWNLOAD_URL" = $WebsiteUrl
    "NATIVELY_MAC_DOWNLOAD_URL" = $WebsiteUrl
    "NATIVELY_PURCHASE_PAGE_URL" = $PurchasePageUrl
    "NATIVELY_ACTIVATION_HELP_URL" = $ActivationHelpUrl
    "NATIVELY_SUPPORT_EMAIL" = $SupportEmail
    "NATIVELY_SUPPORT_URL" = "mailto:$SupportEmail"
    "NATIVELY_PRIVACY_URL" = $WebsiteUrl
    "NATIVELY_REFUND_URL" = $WebsiteUrl
    "NATIVELY_EULA_URL" = $WebsiteUrl
    "NATIVELY_UPDATE_FEED_URL" = "$WebsiteUrl/downloads/latest.json"
    "NATIVELY_HOSTED_GATEWAY_URL" = $LicenseApiUrl
    "VITE_NATIVELY_LICENSE_API_URL" = $LicenseApiUrl
    "VITE_NATIVELY_REQUIRE_LICENSE" = "true"
    "VITE_NATIVELY_HOSTED_ENABLED" = "false"
    "VITE_NATIVELY_HIDE_BYOK" = "false"
    "VITE_NATIVELY_WEBSITE_URL" = $WebsiteUrl
    "VITE_NATIVELY_DOWNLOAD_URL" = $WebsiteUrl
    "VITE_NATIVELY_WINDOWS_DOWNLOAD_URL" = $WebsiteUrl
    "VITE_NATIVELY_MAC_DOWNLOAD_URL" = $WebsiteUrl
    "VITE_NATIVELY_PURCHASE_PAGE_URL" = $PurchasePageUrl
    "VITE_NATIVELY_ACTIVATION_HELP_URL" = $ActivationHelpUrl
    "VITE_NATIVELY_SUPPORT_EMAIL" = $SupportEmail
    "VITE_NATIVELY_SUPPORT_URL" = "mailto:$SupportEmail"
    "VITE_NATIVELY_PRIVACY_URL" = $WebsiteUrl
    "VITE_NATIVELY_REFUND_URL" = $WebsiteUrl
    "VITE_NATIVELY_EULA_URL" = $WebsiteUrl
    "VITE_NATIVELY_UPDATE_FEED_URL" = "$WebsiteUrl/downloads/latest.json"
    "VITE_NATIVELY_HOSTED_GATEWAY_URL" = $LicenseApiUrl
}

$originals = @{}
$originalCommercialConfig = [System.IO.File]::ReadAllText($commercialConfigPath)

try {
    $commercialConfig = $originalCommercialConfig | ConvertFrom-Json
    $commercialConfig.websiteUrl = $WebsiteUrl
    $commercialConfig.downloadUrl = $WebsiteUrl
    $commercialConfig.downloadWindowsUrl = $WebsiteUrl
    $commercialConfig.downloadMacUrl = $WebsiteUrl
    $commercialConfig.purchasePageUrl = $PurchasePageUrl
    $commercialConfig.activationHelpUrl = $ActivationHelpUrl
    $commercialConfig.supportEmail = $SupportEmail
    $commercialConfig.supportUrl = "mailto:$SupportEmail"
    $commercialConfig.issuesUrl = $WebsiteUrl
    $commercialConfig.communityUrl = $WebsiteUrl
    $commercialConfig.donationUrl = $WebsiteUrl
    $commercialConfig.privacyUrl = $WebsiteUrl
    $commercialConfig.refundUrl = $WebsiteUrl
    $commercialConfig.eulaUrl = $WebsiteUrl
    $commercialConfig.licenseApiBaseUrl = $LicenseApiUrl
    $commercialConfig.updateFeedUrl = "$WebsiteUrl/downloads/latest.json"
    $commercialConfig.hostedGatewayBaseUrl = $LicenseApiUrl
    $commercialConfig.requireLicense = $true
    $commercialConfig.hostedEnabled = $false
    $commercialConfig.hideByok = $false
    $patchedCommercialConfig = $commercialConfig | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($commercialConfigPath, $patchedCommercialConfig, $utf8NoBom)

    foreach ($entry in $overrides.GetEnumerator()) {
        $originals[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }

    Write-Host "Building desktop app for license-lite..."
    Write-Host "License API URL: $LicenseApiUrl"

    npm run build
    npx tsc -p electron/tsconfig.json

    $runtimeBuildConfig = @{}
    if ($UserDataName.Trim()) {
        $runtimeBuildConfig["userDataName"] = $UserDataName.Trim()
        Write-Host "User data directory override: $UserDataName"
    }
    $runtimeBuildConfigJson = $runtimeBuildConfig | ConvertTo-Json -Depth 10
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $runtimeBuildConfigPath)) | Out-Null
    [System.IO.File]::WriteAllText($runtimeBuildConfigPath, $runtimeBuildConfigJson, $utf8NoBom)

    $shimTarget = Join-Path $root "dist-electron\main.js"
    $compiledMain = Join-Path $root "dist-electron\electron\main.js"
    if (-not (Test-Path $compiledMain)) {
        throw "Expected compiled Electron entry not found: $compiledMain"
    }

    $shimContent = "module.exports = require('./electron/main.js')" + [Environment]::NewLine
    Set-Content -Path $shimTarget -Value $shimContent -Encoding ascii

    if ($ElectronBuilderArgs.Count -gt 0) {
        & npx electron-builder @ElectronBuilderArgs
    }
    else {
        npx electron-builder
    }
}
finally {
    [System.IO.File]::WriteAllText($commercialConfigPath, $originalCommercialConfig, $utf8NoBom)

    foreach ($entry in $originals.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
    Pop-Location
}
