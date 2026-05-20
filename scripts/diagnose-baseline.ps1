# Diagnose why prisma migrate resolve is failing.
# Runs ONE migration with full output to see the actual error.

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

$env:DATABASE_URL = $DatabaseUrl

Write-Host "=== Test 1: prisma migrate status (current state) ===" -ForegroundColor Cyan
Write-Host ""
& npx prisma migrate status 2>&1 | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Exit code: $LASTEXITCODE"
Write-Host ""
Write-Host ""

Write-Host "=== Test 2: ONE migrate resolve with full output ===" -ForegroundColor Cyan
Write-Host ""
$migration = "20260305204642_add_booking_settings"
Write-Host "Running: npx prisma migrate resolve --applied `"$migration`""
Write-Host ""
& npx prisma migrate resolve --applied "$migration" 2>&1 | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Exit code: $LASTEXITCODE"
Write-Host ""
Write-Host ""

Write-Host "=== Test 3: migrate status AFTER ===" -ForegroundColor Cyan
Write-Host ""
& npx prisma migrate status 2>&1 | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Exit code: $LASTEXITCODE"

$env:DATABASE_URL = $null
