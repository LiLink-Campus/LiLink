# Run once as Administrator (right-click -> Run with PowerShell as admin).
# Opens LiLink dev ports (3000 web, 4000 API) to the local network for phone testing.

$ErrorActionPreference = "Stop"

function Ensure-FirewallRule {
    param(
        [string]$Name,
        [int]$Port
    )

    $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Firewall rule already exists: $Name"
        return
    }

    New-NetFirewallRule `
        -DisplayName $Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port | Out-Null

    Write-Host "Added firewall rule: $Name (TCP $Port)"
}

Ensure-FirewallRule -Name "LiLink Dev Web 3000" -Port 3000
Ensure-FirewallRule -Name "LiLink Dev API 4000" -Port 4000

Write-Host ""
Write-Host "Done. Phone on the same Wi-Fi can reach:"
Write-Host "  Web: http://<your-lan-ip>:3000"
Write-Host "  API: http://<your-lan-ip>:4000/v1"
Write-Host ""
Write-Host "Replace <your-lan-ip> with the address printed by: npm run setup:dev-mobile"
