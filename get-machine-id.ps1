# ====================================
# FBO Extension - Get Machine ID (Windows PowerShell)
# ====================================
# Usage: Run this in PowerShell (no Node.js required)
#   .\get-machine-id.ps1

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "🔑 FBO EXTENSION LICENSE INFO" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Get Machine GUID from Windows Registry
try {
    $machineGuid = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid).MachineGuid

    Write-Host "Platform: Windows" -ForegroundColor Green
    Write-Host ""
    Write-Host "Raw Machine ID:" -ForegroundColor Yellow
    Write-Host $machineGuid
    Write-Host ""

    # Hash the Machine ID using SHA-256
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($machineGuid)
    $hash = $sha256.ComputeHash($bytes)
    $hashedId = [System.BitConverter]::ToString($hash).Replace('-','').ToLower()

    Write-Host "Hashed Machine ID (SHA-256):" -ForegroundColor Yellow
    Write-Host $hashedId
    Write-Host ""

    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host "📋 ADD THIS TO SERVER allowedIds:" -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[`"Your Name - Windows`", `"$hashedId`"]" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "❌ Error: Could not read Machine GUID from registry" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
