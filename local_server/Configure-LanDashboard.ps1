[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter(Mandatory = $true)]
    [string]$HotspotInterfaceAlias
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent $root
$composeEnvPath = Join-Path $root ".env"
$dashboardEnvPath = Join-Path $repositoryRoot "main\web_hoster\web\react_app\.env"
$secretsRoot = Join-Path $env:LOCALAPPDATA "FaultTolerantIoT\mosquitto"
$defaultCredentialsPath = Join-Path $secretsRoot "bridge.env"
$certDir = Join-Path $secretsRoot "certs"
$certPath = Join-Path $certDir "server.crt"
$keyPath = Join-Path $certDir "server.key"
$caPath = Join-Path $certDir "ca.crt"

$adapter = @(Get-NetAdapter -IncludeHidden | Where-Object {
    $_.Name -ceq $HotspotInterfaceAlias -and $_.Status -eq "Up"
})
if ($adapter.Count -ne 1) {
    throw "The specified hotspot interface must identify exactly one active network adapter."
}

$addresses = @(Get-NetIPAddress -InterfaceIndex $adapter[0].ifIndex -AddressFamily IPv4 -AddressState Preferred -Type Unicast)
if ($addresses.Count -ne 1) {
    throw "The hotspot interface must have exactly one preferred IPv4 address."
}

$hotspotIp = [System.Net.IPAddress]::Parse($addresses[0].IPAddress)
$addressBytes = $hotspotIp.GetAddressBytes()
$isPrivateIPv4 = $addressBytes[0] -eq 10 `
    -or ($addressBytes[0] -eq 172 -and $addressBytes[1] -ge 16 -and $addressBytes[1] -le 31) `
    -or ($addressBytes[0] -eq 192 -and $addressBytes[1] -eq 168)
if (-not $isPrivateIPv4) {
    throw "The selected interface does not have an RFC 1918 IPv4 address."
}

foreach ($file in @($certPath, $keyPath, $caPath)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Required local TLS file is missing: $file"
    }
}

$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $openssl) {
    throw "OpenSSL is required to verify the local bridge certificate."
}
$sanOutput = & $openssl.Source x509 -in $certPath -noout -ext subjectAltName 2>$null
if ($LASTEXITCODE -ne 0 -or ($sanOutput -join "`n") -notmatch [regex]::Escape("IP Address:$($hotspotIp.IPAddressToString)")) {
    throw "The existing local TLS certificate does not include the current hotspot IP. Do not start a LAN bridge with an unverified certificate."
}

$composeEnv = if (Test-Path -LiteralPath $composeEnvPath) {
    (Get-Content -Raw -LiteralPath $composeEnvPath).TrimStart([char]0xFEFF)
}
else {
    ""
}
$credentialsMatch = [regex]::Match($composeEnv, '(?m)^LOCAL_BROKER_CREDENTIALS=(.+)$')
$credentialsPath = if ($credentialsMatch.Success) {
    [Environment]::ExpandEnvironmentVariables($credentialsMatch.Groups[1].Value.Trim().Trim('"'))
}
else {
    $defaultCredentialsPath
}
if (-not (Test-Path -LiteralPath $credentialsPath -PathType Leaf)) {
    throw "The local broker credentials file is missing. Initialize and verify the broker before configuring LAN access."
}

$credentialText = Get-Content -Raw -LiteralPath $credentialsPath
$updatedCredentialText = [regex]::Replace($credentialText, '(?m)^BRIDGE_BROWSER_TOKEN=.*(?:\r?\n|$)', '')

function Set-EnvironmentEntry {
    param(
        [string]$Text,
        [string]$Name,
        [string]$Value
    )

    $pattern = '^\s*' + [regex]::Escape($Name) + '='
    $lines = @($Text -split "`r?`n")
    $output = New-Object System.Collections.Generic.List[string]
    $replaced = $false
    foreach ($line in $lines) {
        if ($line -match $pattern) {
            if (-not $replaced) {
                $output.Add("$Name=$Value")
                $replaced = $true
            }
        }
        else {
            $output.Add($line)
        }
    }
    if (-not $replaced) {
        $output.Add("$Name=$Value")
    }

    return ($output -join "`r`n").TrimEnd("`r", "`n") + "`r`n"
}

$updatedComposeEnv = $composeEnv
$updatedComposeEnv = Set-EnvironmentEntry $updatedComposeEnv "BRIDGE_HOST" $hotspotIp.IPAddressToString
$updatedComposeEnv = Set-EnvironmentEntry $updatedComposeEnv "BRIDGE_PORT" "8081"
$updatedComposeEnv = Set-EnvironmentEntry $updatedComposeEnv "BRIDGE_ALLOWED_ORIGINS" "https://$($hotspotIp.IPAddressToString):5173"
$updatedComposeEnv = Set-EnvironmentEntry $updatedComposeEnv "BRIDGE_TLS_CERT_PATH" (($certPath -replace '\\', '/'))
$updatedComposeEnv = Set-EnvironmentEntry $updatedComposeEnv "BRIDGE_TLS_KEY_PATH" (($keyPath -replace '\\', '/'))

$dashboardEnv = if (Test-Path -LiteralPath $dashboardEnvPath) {
    (Get-Content -Raw -LiteralPath $dashboardEnvPath).TrimStart([char]0xFEFF)
}
else {
    ""
}
$updatedDashboardEnv = Set-EnvironmentEntry $dashboardEnv "DEV_LAN_HOST" $hotspotIp.IPAddressToString
$updatedDashboardEnv = Set-EnvironmentEntry $updatedDashboardEnv "VITE_LAN_BRIDGE_URL" "wss://$($hotspotIp.IPAddressToString):8081"
$updatedDashboardEnv = Set-EnvironmentEntry $updatedDashboardEnv "VITE_LOCAL_SERVER_URL" "https://$($hotspotIp.IPAddressToString):8081"

if ($PSCmdlet.ShouldProcess("Local bridge credentials and ignored environment files", "Configure authenticated WSS at $($hotspotIp.IPAddressToString)")) {
    Set-Content -LiteralPath $credentialsPath -Value $updatedCredentialText -Encoding Ascii
    Set-Content -LiteralPath $composeEnvPath -Value $updatedComposeEnv -Encoding Ascii
    Set-Content -LiteralPath $dashboardEnvPath -Value $updatedDashboardEnv -Encoding Ascii
    Write-Output "Configured the authenticated HTTPS/WSS local server for $($hotspotIp.IPAddressToString)."
    Write-Output "Removed any obsolete browser-token entry from the local credentials file."
    Write-Output "The trusted local CA certificate is at $caPath and must be installed on each browser device."
}
