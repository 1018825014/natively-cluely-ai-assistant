param(
    [ValidateSet("create", "show", "reset", "revoke", "renew", "list", "help")]
    [string]$Action = "create",
    [string]$ServerHost = "101.43.20.2",
    [string]$Username = "root",
    [string]$RemoteDir = "/srv/natively/app/license-lite"
)

$ErrorActionPreference = "Stop"

function Read-Required {
    param(
        [string]$Prompt
    )

    while ($true) {
        $value = Read-Host $Prompt
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
        Write-Host "This value is required. Please enter it again." -ForegroundColor Yellow
    }
}

function Read-Optional {
    param(
        [string]$Prompt
    )

    return (Read-Host $Prompt).Trim()
}

function Select-Sku {
    Write-Host ""
    Write-Host "Choose a license duration:"
    Write-Host "1. 1 day"
    Write-Host "2. Promo trial (1-7 days, unlimited devices)"
    Write-Host "3. 7 days"
    Write-Host "4. 30 days"
    Write-Host "5. 365 days"
    Write-Host "6. Lifetime"

    while ($true) {
        $choice = Read-Host "Enter 1-6"
        switch ($choice.Trim()) {
            "1" { return "cn_1d" }
            "2" { return "cn_1d_promo" }
            "3" { return "cn_7d" }
            "4" { return "cn_30d" }
            "5" { return "cn_365d" }
            "6" { return "cn_lifetime" }
            default { Write-Host "Please enter a number from 1 to 6." -ForegroundColor Yellow }
        }
    }
}

function Read-PromoDurationDays {
    while ($true) {
        $value = Read-Host "Promo trial days (1-7)"
        $parsed = 0
        if ([int]::TryParse($value.Trim(), [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 7) {
            return "$parsed"
        }
        Write-Host "Please enter a whole number between 1 and 7." -ForegroundColor Yellow
    }
}

function Show-Help {
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\license-lite-remote.ps1"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\license-lite-remote.ps1 -Action show"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\license-lite-remote.ps1 -Action reset"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\license-lite-remote.ps1 -Action revoke"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\license-lite-remote.ps1 -Action renew"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\license-lite-remote.ps1 -Action list"
    Write-Host ""
}

if ($Action -eq "help") {
    Show-Help
    exit 0
}

$pythonScript = Join-Path $PSScriptRoot "license-lite-remote.py"
if (-not (Test-Path $pythonScript)) {
    throw "Cannot find script: $pythonScript"
}

$commonArgs = @(
    $pythonScript,
    "--host", $ServerHost,
    "--username", $Username,
    "--remote-dir", $RemoteDir
)

switch ($Action) {
    "create" {
        $sku = Select-Sku
        $durationDays = ""
        if ($sku -eq "cn_1d_promo") {
            $durationDays = Read-PromoDurationDays
        }
        $buyer = Read-Required "Buyer label (WeChat name or note)"
        $order = Read-Optional "Order id (optional)"
        $wechatNote = Read-Optional "WeChat note (optional)"
        $orderNote = Read-Optional "Order note (optional)"

        $args = @("create-license", "--sku", $sku, "--buyer", $buyer)
        if ($durationDays) {
            $args += @("--duration-days", $durationDays)
        }
        if ($order) {
            $args += @("--order", $order)
        }
        if ($wechatNote) {
            $args += @("--wechat-note", $wechatNote)
        }
        if ($orderNote) {
            $args += @("--order-note", $orderNote)
        }

        Write-Host ""
        Write-Host "Next, enter the server root password. The password will be hidden while typing." -ForegroundColor Cyan
        & python @commonArgs @args
    }
    "show" {
        $licenseKey = Read-Required "License key"
        & python @commonArgs "show-license" "--license" $licenseKey
    }
    "reset" {
        $licenseKey = Read-Required "License key"
        $hardware = Read-Optional "Hardware id (optional, leave blank to reset all activations)"
        $args = @("reset-activation", "--license", $licenseKey)
        if ($hardware) {
            $args += @("--hardware", $hardware)
        }
        & python @commonArgs @args
    }
    "revoke" {
        $licenseKey = Read-Required "License key"
        $reason = Read-Optional "Revoke reason (optional)"
        $args = @("revoke-license", "--license", $licenseKey)
        if ($reason) {
            $args += @("--reason", $reason)
        }
        & python @commonArgs @args
    }
    "renew" {
        $licenseKey = Read-Required "License key"
        $sku = Select-Sku
        $durationDays = ""
        if ($sku -eq "cn_1d_promo") {
            $durationDays = Read-PromoDurationDays
        }
        $args = @("renew-license", "--license", $licenseKey, "--sku", $sku)
        if ($durationDays) {
            $args += @("--duration-days", $durationDays)
        }
        & python @commonArgs @args
    }
    "list" {
        $limit = Read-Optional "How many rows to show (default 20)"
        if (-not $limit) {
            $limit = "20"
        }
        & python @commonArgs "list-licenses" "--limit" $limit
    }
}
