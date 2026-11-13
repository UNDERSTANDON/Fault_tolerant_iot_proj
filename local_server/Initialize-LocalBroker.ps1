param(
    [string]$BrokerDnsName = "localhost",
    [string]$BrokerIpAddress = "127.0.0.1",
    [string]$BindAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$secretsDir = Join-Path $env:LOCALAPPDATA "FaultTolerantIoT\mosquitto"
$certDir = Join-Path $secretsDir "certs"
$credentialsPath = Join-Path $secretsDir "bridge.env"
$passwordFile = Join-Path $certDir "password_file"
$composeEnvPath = Join-Path $root ".env"
$composeEnvPathUnix = ($certDir -replace '\\', '/')

$parsedBindAddress = $null
if (-not [System.Net.IPAddress]::TryParse($BindAddress, [ref]$parsedBindAddress)) {
    throw "BindAddress must be an IPv4 or IPv6 address assigned to this computer."
}
if (-not (Get-NetIPAddress -IPAddress $BindAddress -ErrorAction SilentlyContinue)) {
    throw "BindAddress is not currently assigned to a local network interface."
}

$parsedBrokerIp = $null
if (-not [System.Net.IPAddress]::TryParse($BrokerIpAddress, [ref]$parsedBrokerIp)) {
    throw "BrokerIpAddress must be a valid IP address included in the broker certificate."
}

if (Test-Path $composeEnvPath) {
    throw "local_server/.env already exists. Review it and move it aside before initializing a new broker."
}
if (Test-Path $credentialsPath) {
    throw "Local broker credentials already exist at $credentialsPath. Refusing to overwrite them."
}
if (Test-Path $passwordFile) {
    throw "A Mosquitto password file already exists at $passwordFile. Refusing to overwrite it."
}

$certificateScript = Join-Path $root "New-LocalBrokerCertificates.ps1"
& $certificateScript -BrokerDnsName $BrokerDnsName -BrokerIpAddress $BrokerIpAddress -SecretsDirectory $secretsDir

function New-RandomPassword {
    $bytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
}

$esp32Password = New-RandomPassword
$bridgePassword = New-RandomPassword
$caPath = (Join-Path $certDir "ca.crt") -replace '\\', '/'
$credentials = @(
    "MQTT_TLS_URL=mqtts://$BrokerDnsName`:8883",
    "BROKER_URL=wss://$BrokerDnsName`:8084",
    "BROKER_CA_PATH=$caPath",
    "BROKER_USERNAME=dashboard_bridge",
    "BROKER_PASSWORD=$bridgePassword",
    "ESP32_MQTT_USERNAME=esp32_test",
    "ESP32_MQTT_PASSWORD=$esp32Password"
) -join "`r`n"
Set-Content -Path $credentialsPath -Value $credentials -Encoding Ascii

$composeEnv = @(
    "BROKER_BIND_IP=$BindAddress",
    "BROKER_SECRETS_DIR=$composeEnvPathUnix",
    "LOCAL_BROKER_CREDENTIALS=$($credentialsPath -replace '\\', '/')"
) -join "`r`n"
Set-Content -Path $composeEnvPath -Value $composeEnv -Encoding Ascii

$dockerMount = "type=bind,source=$certDir,target=/mosquitto/secrets"
$accounts = @(
    @{ Username = "esp32_test"; Password = $esp32Password; Create = $true },
    @{ Username = "dashboard_bridge"; Password = $bridgePassword; Create = $false }
)

foreach ($account in $accounts) {
    $arguments = @(
        "run", "--rm", "--mount", $dockerMount,
        "--entrypoint", "mosquitto_passwd",
        "eclipse-mosquitto:2",
        "-b"
    )
    if ($account.Create) {
        $arguments += "-c"
    }
    $arguments += @("/mosquitto/secrets/password_file", $account.Username, $account.Password)
    & docker @arguments *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create the local broker account file."
    }
}

$arguments = @(
    "run", "--rm", "--mount", $dockerMount,
    "--entrypoint", "chmod",
    "eclipse-mosquitto:2",
    "644", "/mosquitto/secrets/password_file"
)
& docker @arguments *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Could not set broker-readable permissions on the password hash file."
}

Push-Location $root
try {
    & docker compose --env-file $composeEnvPath up -d
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose could not start the broker."
    }
}
finally {
    Pop-Location
}

Write-Host "Broker container started with ports bound to $BindAddress only."
Write-Host "Generated credentials are stored outside the repository at $credentialsPath."
Write-Host "Use the test verifier: node verify-broker.mjs"
