[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [string]$HotspotInterfaceAlias,
    [switch]$Remove,
    [switch]$ScopeDockerBackend,
    [switch]$RestoreDockerBackend
)

$ErrorActionPreference = "Stop"

$rules = @(
    @{
        Name = "FTIoT-Hotspot-Vite-5173"
        DisplayName = "Fault-tolerant IoT hotspot dashboard (Vite)"
        Port = 5173
        Description = "Allow the development dashboard from the hotspot subnet only."
    },
    @{
        Name = "FTIoT-Hotspot-ESP32-MQTT-TLS-8883"
        DisplayName = "Fault-tolerant IoT hotspot MQTT over TLS"
        Port = 8883
        Description = "Allow authenticated ESP32 MQTT/TLS clients from the hotspot subnet only."
    },
    @{
        Name = "FTIoT-Hotspot-Bridge-WSS-8081"
        DisplayName = "Fault-tolerant IoT authenticated dashboard bridge"
        Port = 8081
        Description = "Allow authenticated browser WSS clients from the hotspot subnet only."
    }
)
$dockerFirewallBackupPath = Join-Path $env:LOCALAPPDATA "FaultTolerantIoT\firewall\docker-backend-rules.json"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-PortFilterMatches {
    param(
        [object[]]$LocalPorts,
        [int]$Port
    )

    foreach ($entry in $LocalPorts) {
        $text = $entry.ToString()
        if ($text -eq "Any") {
            return $true
        }
        if ($text -match "^(\d+)-(\d+)$") {
            if ($Port -ge [int]$Matches[1] -and $Port -le [int]$Matches[2]) {
                return $true
            }
        }
        elseif ($text -match "^\d+$" -and [int]$text -eq $Port) {
            return $true
        }
    }

    return $false
}

if (-not $WhatIfPreference -and -not (Test-IsAdministrator)) {
    throw "Run this script from an elevated PowerShell session to change Windows Firewall rules."
}

if ($RestoreDockerBackend) {
    if (-not (Test-Path $dockerFirewallBackupPath)) {
        throw "No Docker firewall backup exists at $dockerFirewallBackupPath."
    }

    $backup = Get-Content -Raw -Path $dockerFirewallBackupPath | ConvertFrom-Json
    foreach ($savedRule in $backup.Rules) {
        $existing = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name $savedRule.Name -ErrorAction SilentlyContinue)
        if ($existing.Count -eq 0) {
            Write-Warning "Docker firewall rule '$($savedRule.Name)' no longer exists; it was not restored."
            continue
        }

        if ($PSCmdlet.ShouldProcess($savedRule.Name, "Restore original Docker firewall address scope")) {
            $addressFilter = $existing | Get-NetFirewallAddressFilter
            Set-NetFirewallAddressFilter `
                -InputObject $addressFilter `
                -LocalAddress @($savedRule.LocalAddress) `
                -RemoteAddress @($savedRule.RemoteAddress) `
                -Confirm:$false `
                -ErrorAction Stop

            if ($savedRule.EdgeTraversalPolicy) {
                Set-NetFirewallRule `
                    -PolicyStore PersistentStore `
                    -Name $savedRule.Name `
                    -EdgeTraversalPolicy $savedRule.EdgeTraversalPolicy `
                    -Confirm:$false `
                    -ErrorAction Stop | Out-Null
            }
        }
    }
    return
}

if ($Remove) {
    foreach ($rule in $rules) {
        $existing = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name $rule.Name -ErrorAction SilentlyContinue)
        if ($existing.Count -gt 0 -and $PSCmdlet.ShouldProcess($rule.DisplayName, "Remove firewall rule")) {
            $existing | Remove-NetFirewallRule -Confirm:$false
        }
    }
    return
}

if ([string]::IsNullOrWhiteSpace($HotspotInterfaceAlias)) {
    throw "Specify the active hotspot interface using -HotspotInterfaceAlias."
}

$profiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore)
if ($profiles.Count -eq 0) {
    throw "Could not read the active Windows Firewall profiles."
}
foreach ($profile in $profiles) {
    if (-not $profile.Enabled -or $profile.DefaultInboundAction -ne "Block" -or -not $profile.AllowLocalFirewallRules) {
        throw "Firewall profile '$($profile.Name)' must be enabled, block unsolicited inbound traffic, and allow local rules."
    }
}

$adapters = @(Get-NetAdapter -IncludeHidden | Where-Object {
    $_.Name -ceq $HotspotInterfaceAlias -and $_.Status -eq "Up"
})
if ($adapters.Count -ne 1) {
    throw "The specified hotspot interface must identify exactly one active network adapter."
}

$addresses = @(Get-NetIPAddress -InterfaceIndex $adapters[0].ifIndex -AddressFamily IPv4 -AddressState Preferred -Type Unicast)
if ($addresses.Count -ne 1) {
    throw "The hotspot interface must have exactly one preferred IPv4 address."
}

$hotspotIp = [System.Net.IPAddress]::Parse($addresses[0].IPAddress)
$prefixLength = [int]$addresses[0].PrefixLength
if ($prefixLength -lt 24 -or $prefixLength -gt 30) {
    throw "The hotspot IPv4 prefix must be between /24 and /30 to prevent an overly broad firewall scope."
}

$ipBytes = $hotspotIp.GetAddressBytes()
$isPrivateIPv4 = $ipBytes[0] -eq 10 `
    -or ($ipBytes[0] -eq 172 -and $ipBytes[1] -ge 16 -and $ipBytes[1] -le 31) `
    -or ($ipBytes[0] -eq 192 -and $ipBytes[1] -eq 168)
if (-not $isPrivateIPv4) {
    throw "The selected interface does not have an RFC 1918 IPv4 address."
}

$networkBytes = [byte[]]$ipBytes.Clone()
$maskBytes = New-Object byte[] 4
$bitsRemaining = $prefixLength
for ($index = 0; $index -lt $networkBytes.Length; $index++) {
    if ($bitsRemaining -ge 8) {
        $mask = 255
    }
    elseif ($bitsRemaining -le 0) {
        $mask = 0
    }
    else {
        $mask = (255 -shl (8 - $bitsRemaining)) -band 255
    }
    $maskBytes[$index] = [byte]$mask
    $networkBytes[$index] = [byte](([int]$networkBytes[$index]) -band $mask)
    $bitsRemaining -= 8
}

$networkAddress = New-Object System.Net.IPAddress(,$networkBytes)
$networkMask = New-Object System.Net.IPAddress(,$maskBytes)
$hotspotSubnet = "$($networkAddress.IPAddressToString)/$prefixLength"
$hotspotSubnetWithMask = "$($networkAddress.IPAddressToString)/$($networkMask.IPAddressToString)"

$ownedRuleNames = @($rules | ForEach-Object { $_.Name })
$activeAllowRules = @(Get-NetFirewallRule -PolicyStore ActiveStore -Enabled True -Direction Inbound -Action Allow)
$dockerRulesToRestrict = @{}
$listenerPidsByPort = @{}
$listenerPathsByPort = @{}
foreach ($rule in $rules) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $rule.Port -ErrorAction SilentlyContinue)
    $listenerPids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    $listenerPaths = @($listenerPids | ForEach-Object {
        (Get-Process -Id $_ -ErrorAction SilentlyContinue).Path
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($rule.Port -eq 5173) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($nodeCommand) {
            $listenerPaths += $nodeCommand.Source
        }
    }

    $listenerPidsByPort[$rule.Port] = $listenerPids
    $listenerPathsByPort[$rule.Port] = @($listenerPaths | Sort-Object -Unique)
}

foreach ($activeRule in $activeAllowRules) {
    if ($activeRule.Name -in $ownedRuleNames) {
        continue
    }

    $portFilter = $activeRule | Get-NetFirewallPortFilter
    if ($portFilter.Protocol -notin @("TCP", "Any", "6")) {
        continue
    }

    foreach ($rule in $rules) {
        if (-not (Test-PortFilterMatches -LocalPorts @($portFilter.LocalPort) -Port $rule.Port)) {
            continue
        }

        if (-not [string]::IsNullOrWhiteSpace($activeRule.PackageFamilyName)) {
            continue
        }

        $applicationFilter = $activeRule | Get-NetFirewallApplicationFilter
        $configuredProgram = [Environment]::ExpandEnvironmentVariables($applicationFilter.Program)
        $programIsAny = [string]::IsNullOrWhiteSpace($configuredProgram) -or $configuredProgram -in @("Any", "*")
        $programMatchesListener = $programIsAny -or $listenerPathsByPort[$rule.Port] -contains $configuredProgram
        if (-not $programMatchesListener) {
            continue
        }

        if ([System.IO.Path]::GetFileName($configuredProgram) -ieq "com.docker.backend.exe") {
            if (-not $ScopeDockerBackend) {
                throw "Docker Desktop has an unrestricted inbound rule. Re-run with -ScopeDockerBackend to limit all Docker-published ports to the hotspot subnet; this affects other Docker workloads too."
            }
            $dockerRulesToRestrict[$activeRule.Name] = $activeRule
            continue
        }

        throw "Existing inbound allow rule '$($activeRule.DisplayName)' applies to TCP port $($rule.Port). Review it before adding a scoped rule."
    }
}

if ($ScopeDockerBackend) {
    foreach ($activeRule in $activeAllowRules) {
        $applicationFilter = $activeRule | Get-NetFirewallApplicationFilter
        $configuredProgram = [Environment]::ExpandEnvironmentVariables($applicationFilter.Program)
        if ([System.IO.Path]::GetFileName($configuredProgram) -ieq "com.docker.backend.exe") {
            $dockerRulesToRestrict[$activeRule.Name] = $activeRule
        }
    }

    if ($dockerRulesToRestrict.Count -gt 0) {
        $backupState = if (Test-Path $dockerFirewallBackupPath) {
            Get-Content -Raw -Path $dockerFirewallBackupPath | ConvertFrom-Json
        }
        else {
            [pscustomobject]@{
                Version = 1
                Rules = @()
            }
        }

        $newBackupRules = @()
        foreach ($dockerRule in $dockerRulesToRestrict.Values) {
            $savedRule = $backupState.Rules | Where-Object { $_.Name -eq $dockerRule.Name } | Select-Object -First 1
            if ($savedRule) {
                if (-not $savedRule.PSObject.Properties['EdgeTraversalPolicy']) {
                    $savedRule | Add-Member -NotePropertyName EdgeTraversalPolicy -NotePropertyValue $dockerRule.EdgeTraversalPolicy
                }
                continue
            }
            $addressFilter = $dockerRule | Get-NetFirewallAddressFilter
            $newBackupRules += [pscustomobject]@{
                Name = $dockerRule.Name
                LocalAddress = @($addressFilter.LocalAddress)
                RemoteAddress = @($addressFilter.RemoteAddress)
                EdgeTraversalPolicy = $dockerRule.EdgeTraversalPolicy
            }
        }

        if ($PSCmdlet.ShouldProcess("Docker Desktop firewall rules", "Back up and restrict to $hotspotIp from $hotspotSubnet")) {
            if ($newBackupRules.Count -gt 0 -or $backupState.Rules.Count -gt 0) {
                $backupDirectory = Split-Path -Parent $dockerFirewallBackupPath
                New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
                $backupState.Rules = @($backupState.Rules) + $newBackupRules
                $backupState | ConvertTo-Json -Depth 5 | Set-Content -Path $dockerFirewallBackupPath -Encoding UTF8
            }

            foreach ($dockerRule in $dockerRulesToRestrict.Values) {
                try {
                    if ($dockerRule.EdgeTraversalPolicy -eq "DeferToUser") {
                        Set-NetFirewallRule `
                            -PolicyStore PersistentStore `
                            -Name $dockerRule.Name `
                            -EdgeTraversalPolicy Block `
                            -Confirm:$false `
                            -ErrorAction Stop | Out-Null
                    }

                    $updatedRule = Get-NetFirewallRule -PolicyStore PersistentStore -Name $dockerRule.Name -ErrorAction Stop
                    $addressFilter = $updatedRule | Get-NetFirewallAddressFilter
                    Set-NetFirewallAddressFilter `
                        -InputObject $addressFilter `
                        -LocalAddress $hotspotIp.IPAddressToString `
                        -RemoteAddress $hotspotSubnet `
                        -Confirm:$false `
                        -ErrorAction Stop

                    $updatedRule = Get-NetFirewallRule -PolicyStore PersistentStore -Name $dockerRule.Name -ErrorAction Stop
                    $updatedAddressFilter = $updatedRule | Get-NetFirewallAddressFilter
                    $updatedLocalAddresses = @($updatedAddressFilter.LocalAddress | ForEach-Object { $_.ToString() })
                    $updatedRemoteAddresses = @($updatedAddressFilter.RemoteAddress | ForEach-Object { $_.ToString() })
                    if ($hotspotIp.IPAddressToString -notin $updatedLocalAddresses) {
                        throw "Docker firewall rule '$($dockerRule.Name)' did not retain the expected local address."
                    }
                    if ($hotspotSubnet -notin $updatedRemoteAddresses -and $hotspotSubnetWithMask -notin $updatedRemoteAddresses) {
                        throw "Docker firewall rule '$($dockerRule.Name)' did not retain the expected remote subnet."
                    }
                    if ($updatedRule.EdgeTraversalPolicy -eq "DeferToUser") {
                        throw "Docker firewall rule '$($dockerRule.Name)' still uses DeferToUser edge traversal."
                    }
                }
                catch {
                    throw "Failed to safely scope Docker firewall rule '$($dockerRule.Name)': $($_.Exception.Message)"
                }
            }
            Write-Output "Restricted Docker Desktop inbound rules to hotspot address $($hotspotIp.IPAddressToString) from $hotspotSubnet."
        }
    }
}

foreach ($rule in $rules) {
    $existing = @(Get-NetFirewallRule -PolicyStore PersistentStore -Name $rule.Name -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0 -and $PSCmdlet.ShouldProcess($rule.DisplayName, "Replace firewall rule")) {
        $existing | Remove-NetFirewallRule -Confirm:$false
    }

    if ($PSCmdlet.ShouldProcess("$($rule.DisplayName) on $hotspotIp from $hotspotSubnet", "Create firewall rule")) {
        New-NetFirewallRule `
            -PolicyStore PersistentStore `
            -Name $rule.Name `
            -DisplayName $rule.DisplayName `
            -Description $rule.Description `
            -Direction Inbound `
            -Action Allow `
            -Enabled True `
            -Profile Any `
            -Protocol TCP `
            -LocalPort $rule.Port `
            -LocalAddress $hotspotIp.IPAddressToString `
            -RemoteAddress $hotspotSubnet `
            -EdgeTraversalPolicy Block `
            -Confirm:$false `
            -ErrorAction Stop | Out-Null
        Write-Output "Configured TCP $($rule.Port) for hotspot address $($hotspotIp.IPAddressToString) from $hotspotSubnet."
    }
}

Write-Output "TCP 8081 is restricted to the hotspot subnet and is intended for the authenticated WSS bridge only."
if ($ScopeDockerBackend) {
    Write-Output "Docker-published ports, including broker WSS, are limited to the selected hotspot address and subnet."
}
