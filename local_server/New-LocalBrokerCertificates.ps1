param(
    [string]$BrokerDnsName = "localhost",
    [string]$BrokerIpAddress = "127.0.0.1",
    [string[]]$AdditionalIpAddresses = @(),
    [string]$SecretsDirectory = (Join-Path $env:LOCALAPPDATA "FaultTolerantIoT\mosquitto"),
    [switch]$RenewServerCertificate
)

$ErrorActionPreference = "Stop"

if ($BrokerDnsName -notmatch '^[A-Za-z0-9.-]+$') {
    throw "BrokerDnsName must contain only letters, digits, dots, and hyphens."
}

$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($BrokerIpAddress, [ref]$parsedIp)) {
    throw "BrokerIpAddress must be a valid IP address."
}

foreach ($additionalIp in $AdditionalIpAddresses) {
    $parsedAdditionalIp = $null
    if (-not [System.Net.IPAddress]::TryParse($additionalIp, [ref]$parsedAdditionalIp)) {
        throw "Additional IP addresses must be valid IP addresses."
    }
}

$opensslCommand = Get-Command openssl -ErrorAction SilentlyContinue
if ($null -eq $opensslCommand) {
    throw "OpenSSL was not found on PATH."
}

$certDir = Join-Path $SecretsDirectory "certs"
$privateDir = Join-Path $SecretsDirectory "private"
New-Item -ItemType Directory -Force -Path $certDir, $privateDir | Out-Null

$caKey = Join-Path $privateDir "ca.key"
$caCert = Join-Path $certDir "ca.crt"
$serverKey = Join-Path $certDir "server.key"
$serverCsr = Join-Path $privateDir "server.csr"
$serverCert = Join-Path $certDir "server.crt"
$extensions = Join-Path $privateDir "server.ext"

if ($RenewServerCertificate) {
    if (-not (Test-Path $caKey) -or -not (Test-Path $caCert)) {
        throw "Cannot renew the broker certificate without the existing local CA key and certificate."
    }
}
elseif ((Test-Path $caKey) -or (Test-Path $caCert) -or (Test-Path $serverKey) -or (Test-Path $serverCert)) {
    throw "Local broker certificate files already exist. Move or remove only these named local files before regenerating them."
}

$altNames = @(
    "[alt_names]",
    "DNS.1 = $BrokerDnsName"
)
$ipAddresses = @($BrokerIpAddress) + $AdditionalIpAddresses | Select-Object -Unique
for ($index = 0; $index -lt $ipAddresses.Count; $index++) {
    $altNames += "IP.$($index + 1) = $($ipAddresses[$index])"
}

$extensionLines = @(
    "basicConstraints = critical,CA:FALSE",
    "keyUsage = critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt_names"
) + $altNames
$extensionText = $extensionLines -join "`r`n"
Set-Content -Path $extensions -Value $extensionText -Encoding Ascii

$workingServerKey = $serverKey
$workingServerCsr = $serverCsr
$workingServerCert = $serverCert
if ($RenewServerCertificate) {
    $renewalId = [Guid]::NewGuid().ToString("N")
    $workingServerKey = Join-Path $privateDir "server-renewal-$renewalId.key"
    $workingServerCsr = Join-Path $privateDir "server-renewal-$renewalId.csr"
    $workingServerCert = Join-Path $privateDir "server-renewal-$renewalId.crt"
}
else {
    & $opensslCommand.Source req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes `
        -keyout $caKey -out $caCert -subj "/CN=Fault Tolerant IoT Local CA" `
        -addext "basicConstraints=critical,CA:TRUE" `
        -addext "keyUsage=critical,keyCertSign,cRLSign"
    if ($LASTEXITCODE -ne 0) {
        throw "OpenSSL failed to create the local CA."
    }
}

& $opensslCommand.Source req -new -newkey rsa:3072 -sha256 -nodes `
    -keyout $workingServerKey -out $workingServerCsr -subj "/CN=$BrokerDnsName"
if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL failed to create the broker certificate request."
}

if ($RenewServerCertificate) {
    $serial = Join-Path $privateDir "ca.srl"
    if (-not (Test-Path $serial)) {
        throw "The local CA serial file is missing; refusing to renew the broker certificate."
    }
    & $opensslCommand.Source x509 -req -in $workingServerCsr -CA $caCert -CAkey $caKey `
        -CAserial $serial -out $workingServerCert -days 825 -sha256 -extfile $extensions
}
else {
    & $opensslCommand.Source x509 -req -in $workingServerCsr -CA $caCert -CAkey $caKey `
        -CAcreateserial -out $workingServerCert -days 825 -sha256 -extfile $extensions
}
if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL failed to sign the broker certificate."
}

if ($RenewServerCertificate) {
    Move-Item -LiteralPath $workingServerKey -Destination $serverKey -Force
    Move-Item -LiteralPath $workingServerCert -Destination $serverCert -Force
}
Remove-Item -LiteralPath $workingServerCsr, $extensions -Force
Write-Host "Created local broker TLS certificate for DNS:$BrokerDnsName and IP addresses: $($ipAddresses -join ', ')."
Write-Host "CA certificate: $caCert"
Write-Host "Keep $caKey private. It is not mounted into the broker container."
