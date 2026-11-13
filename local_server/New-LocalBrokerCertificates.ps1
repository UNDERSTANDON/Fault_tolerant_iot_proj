param(
    [string]$BrokerDnsName = "localhost",
    [string]$BrokerIpAddress = "127.0.0.1",
    [string]$SecretsDirectory = (Join-Path $env:LOCALAPPDATA "FaultTolerantIoT\mosquitto")
)

$ErrorActionPreference = "Stop"

if ($BrokerDnsName -notmatch '^[A-Za-z0-9.-]+$') {
    throw "BrokerDnsName must contain only letters, digits, dots, and hyphens."
}

$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($BrokerIpAddress, [ref]$parsedIp)) {
    throw "BrokerIpAddress must be a valid IP address."
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

if ((Test-Path $caKey) -or (Test-Path $caCert) -or (Test-Path $serverKey) -or (Test-Path $serverCert)) {
    throw "Local broker certificate files already exist. Move or remove only these named local files before regenerating them."
}

$altNames = @(
    "[alt_names]",
    "DNS.1 = $BrokerDnsName",
    "IP.1 = $BrokerIpAddress"
)

$extensionLines = @(
    "basicConstraints = critical,CA:FALSE",
    "keyUsage = critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt_names"
) + $altNames
$extensionText = $extensionLines -join "`r`n"
Set-Content -Path $extensions -Value $extensionText -Encoding Ascii

& $opensslCommand.Source req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes `
    -keyout $caKey -out $caCert -subj "/CN=Fault Tolerant IoT Local CA" `
    -addext "basicConstraints=critical,CA:TRUE" `
    -addext "keyUsage=critical,keyCertSign,cRLSign"
if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL failed to create the local CA."
}

& $opensslCommand.Source req -new -newkey rsa:3072 -sha256 -nodes `
    -keyout $serverKey -out $serverCsr -subj "/CN=$BrokerDnsName"
if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL failed to create the broker certificate request."
}

& $opensslCommand.Source x509 -req -in $serverCsr -CA $caCert -CAkey $caKey `
    -CAcreateserial -out $serverCert -days 825 -sha256 -extfile $extensions
if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL failed to sign the broker certificate."
}

Remove-Item -LiteralPath $serverCsr, $extensions -Force
Write-Host "Created local broker TLS certificates for DNS:$BrokerDnsName and IP:$BrokerIpAddress."
Write-Host "CA certificate: $caCert"
Write-Host "Keep $caKey private. It is not mounted into the broker container."
