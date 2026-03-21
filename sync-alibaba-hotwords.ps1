param(
    [string]$Prefix,
    [string]$TargetModel = 'paraformer-realtime-v2',
    [switch]$ForceCreate
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Quote-PowerShellString {
    param([string]$Value)

    return "'" + ($Value -replace "'", "''") + "'"
}

function Set-LocalEnvValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$Value
    )

    $line = '$env:{0} = {1}' -f $Name, (Quote-PowerShellString $Value)

    if (-not (Test-Path $Path)) {
        Set-Content -Path $Path -Value $line -Encoding UTF8
        return
    }

    $content = Get-Content -Path $Path -Raw -Encoding UTF8
    $pattern = '(?m)^\$env:{0}\s*=.*$' -f [regex]::Escape($Name)

    if ($content -match $pattern) {
        $updated = [regex]::Replace($content, $pattern, $line)
    } else {
        $trimmed = $content.TrimEnd("`r", "`n")
        if ($trimmed.Length -gt 0) {
            $updated = $trimmed + "`r`n" + $line + "`r`n"
        } else {
            $updated = $line + "`r`n"
        }
    }

    Set-Content -Path $Path -Value $updated -Encoding UTF8
}

function Convert-LineToVocabularyItem {
    param([string]$Line)

    $trimmed = $Line.Trim()
    if (-not $trimmed) {
        return $null
    }

    $parts = $trimmed -split '\|', 2
    $text = $parts[0].Trim()
    if (-not $text) {
        return $null
    }

    $weight = 4
    if ($parts.Count -gt 1) {
        $parsedWeight = 0
        if ([int]::TryParse($parts[1].Trim(), [ref]$parsedWeight)) {
            $weight = [Math]::Min([Math]::Max($parsedWeight, 1), 5)
        }
    }

    return [ordered]@{
        text = $text
        weight = $weight
    }
}

function Normalize-HotwordText {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $Text
    }

    if ($Text -match '[\p{IsCJKUnifiedIdeographs}]') {
        return $Text
    }

    $latin1 = [System.Text.Encoding]::GetEncoding('ISO-8859-1')
    $bytes = $latin1.GetBytes($Text)
    $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)

    if ($decoded -match '[\p{IsCJKUnifiedIdeographs}]') {
        return $decoded
    }

    return $Text
}

function Get-NormalizedVocabularyJson {
    param([object[]]$Vocabulary)

    $normalized = $Vocabulary |
        ForEach-Object {
            [ordered]@{
                text = Normalize-HotwordText ([string]$_.text)
                weight = [int]$_.weight
            }
        } |
        Sort-Object text, weight

    return $normalized | ConvertTo-Json -Compress -Depth 5
}

function Invoke-BailianCustomization {
    param([hashtable]$InputPayload)

    $body = @{
        model = 'speech-biasing'
        input = $InputPayload
    } | ConvertTo-Json -Depth 20
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

    return Invoke-RestMethod `
        -Method Post `
        -Uri 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization' `
        -Headers $script:headers `
        -Body $bodyBytes
}

function Get-VocabularyDetails {
    param([string]$VocabularyId)

    if (-not $VocabularyId) {
        return $null
    }

    try {
        $response = Invoke-BailianCustomization @{
            action = 'query_vocabulary'
            vocabulary_id = $VocabularyId
        }
        return $response.output
    } catch {
        Write-Host ("Query failed for {0}: {1}" -f $VocabularyId, $_.Exception.Message) -ForegroundColor DarkYellow
        return $null
    }
}

function Wait-ForVocabularyReady {
    param([string]$VocabularyId)

    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        $details = Get-VocabularyDetails -VocabularyId $VocabularyId
        if ($details -and $details.status -eq 'OK') {
            return $details
        }

        Start-Sleep -Seconds 2
    }

    throw "Vocabulary $VocabularyId did not reach OK status in time."
}

$localConfig = Join-Path $repoRoot 'start-natively.local.ps1'
if (Test-Path $localConfig) {
    Write-Host "Loading local startup config..." -ForegroundColor Yellow
    . $localConfig
}

$apiKey = $env:NATIVELY_ALIBABA_STT_API_KEY
if (-not $apiKey) {
    throw 'NATIVELY_ALIBABA_STT_API_KEY is required. Put it in start-natively.local.ps1 or current shell env.'
}

$headers = @{
    Authorization = "Bearer $apiKey"
    'Content-Type' = 'application/json; charset=utf-8'
}

$glossaryPath = if ($env:NATIVELY_TECHNICAL_GLOSSARY_PATH) {
    $env:NATIVELY_TECHNICAL_GLOSSARY_PATH
} else {
    Join-Path $repoRoot 'tmp\alibaba-hotwords.txt'
}

if (-not (Test-Path $glossaryPath)) {
    throw "Hotword file not found: $glossaryPath"
}

if (-not $Prefix) {
    if ($env:NATIVELY_ALIBABA_VOCABULARY_PREFIX) {
        $Prefix = $env:NATIVELY_ALIBABA_VOCABULARY_PREFIX
    } else {
        $Prefix = 'natstt'
    }
}

$hotwords = Get-Content -Path $glossaryPath -Encoding UTF8 |
    ForEach-Object { Convert-LineToVocabularyItem $_ } |
    Where-Object { $_ -ne $null }

if (-not $hotwords -or $hotwords.Count -eq 0) {
    throw "No valid hotwords found in $glossaryPath"
}

$desiredVocabulary = Get-NormalizedVocabularyJson -Vocabulary $hotwords
$existingVocabularyId = $env:NATIVELY_ALIBABA_VOCABULARY_ID

$candidateIds = New-Object System.Collections.Generic.List[string]
if ($existingVocabularyId) {
    $candidateIds.Add($existingVocabularyId)
}

$listResponse = Invoke-BailianCustomization @{
    action = 'list_vocabulary'
    prefix = $Prefix
    page_index = 0
    page_size = 50
}

foreach ($item in ($listResponse.output.vocabulary_list | Where-Object { $_.vocabulary_id })) {
    if (-not $candidateIds.Contains($item.vocabulary_id)) {
        $candidateIds.Add($item.vocabulary_id)
    }
}

$activeVocabularyId = $null
$activeVocabularyDetails = $null

if (-not $ForceCreate) {
    foreach ($candidateId in $candidateIds) {
        $details = Get-VocabularyDetails -VocabularyId $candidateId
        if (-not $details) {
            continue
        }

        if ($details.status -ne 'OK') {
            continue
        }

        if ($details.target_model -ne $TargetModel) {
            continue
        }

        $currentVocabulary = Get-NormalizedVocabularyJson -Vocabulary $details.vocabulary
        if ($currentVocabulary -eq $desiredVocabulary) {
            $activeVocabularyId = $candidateId
            $activeVocabularyDetails = $details
            break
        }
    }
}

if (-not $activeVocabularyId) {
    Write-Host "Creating a new Bailian hotword vocabulary..." -ForegroundColor Cyan
    $createResponse = Invoke-BailianCustomization @{
        action = 'create_vocabulary'
        prefix = $Prefix
        target_model = $TargetModel
        vocabulary = $hotwords
    }

    $activeVocabularyId = $createResponse.output.vocabulary_id
    if (-not $activeVocabularyId) {
        throw 'Bailian did not return a vocabulary_id.'
    }

    $activeVocabularyDetails = Wait-ForVocabularyReady -VocabularyId $activeVocabularyId
} else {
    Write-Host "Reusing existing Bailian hotword vocabulary: $activeVocabularyId" -ForegroundColor Green
}

Set-LocalEnvValue -Path $localConfig -Name 'NATIVELY_ALIBABA_VOCABULARY_PREFIX' -Value $Prefix
Set-LocalEnvValue -Path $localConfig -Name 'NATIVELY_ALIBABA_VOCABULARY_ID' -Value $activeVocabularyId

Write-Host ''
Write-Host 'Alibaba hotword sync complete.' -ForegroundColor Green
Write-Host "Glossary file : $glossaryPath"
Write-Host "Hotword count : $($hotwords.Count)"
Write-Host "Prefix        : $Prefix"
Write-Host "Target model  : $TargetModel"
Write-Host "Vocabulary ID : $activeVocabularyId"
Write-Host "Status        : $($activeVocabularyDetails.status)"
