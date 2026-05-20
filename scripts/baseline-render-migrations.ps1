# =============================================================================
# baseline-render-migrations.ps1
# =============================================================================
# Marks all Prisma migrations as "applied" in Render DB without changing schema.
# Safe operation — only updates the internal _prisma_migrations table.
#
# Why: production DB was created with `db push` (no migrations tracked).
# To switch to `migrate deploy`, we must first mark existing migrations
# as applied (otherwise prisma will try to run them all from 0 = catastrophic).
#
# Usage:
#   1. Get DATABASE_URL from Render Dashboard -> Database -> Info -> External
#   2. Run: .\scripts\baseline-render-migrations.ps1 -DatabaseUrl "postgres://..."
#   3. Confirm prompts
# =============================================================================

param(
    [Parameter(Mandatory=$true, HelpMessage="DATABASE_URL from Render (External)")]
    [string]$DatabaseUrl,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Info($msg)  { Write-Host "[i] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[X] $msg" -ForegroundColor Red }

# Check 1: DATABASE_URL format
if (-not $DatabaseUrl.StartsWith("postgres://") -and -not $DatabaseUrl.StartsWith("postgresql://")) {
    Write-Err "DATABASE_URL must start with postgres:// or postgresql://"
    exit 1
}

# Display URL safely (mask password)
$urlSafe = $DatabaseUrl -replace ":[^:@]+@", ":***@"
Write-Info "Connecting to: $urlSafe"

# Check 2: prisma/migrations exists
if (-not (Test-Path "prisma/migrations")) {
    Write-Err "Directory prisma/migrations not found. Run from project root."
    exit 1
}

# Find real migration directories (not loose .sql files)
$migrations = Get-ChildItem -Path "prisma/migrations" -Directory |
    Where-Object { $_.Name -ne "migration_lock.toml" } |
    Sort-Object Name

if ($migrations.Count -eq 0) {
    Write-Err "No migrations found in prisma/migrations/"
    exit 1
}

Write-Host ""
Write-Info "Found $($migrations.Count) migrations to mark as applied:"
foreach ($m in $migrations) {
    Write-Host "    - $($m.Name)" -ForegroundColor Gray
}

# Check 3: Backup confirmation
Write-Host ""
Write-Warn "Before continuing: did you create a DB backup in Render?"
Write-Warn "  (Render Dashboard -> Database -> Recovery -> Backup Now)"
$confirmBackup = Read-Host "Type 'yes' if backup is fresh"
if ($confirmBackup -ne "yes") {
    Write-Err "Aborted. Create a backup first, then run again."
    exit 1
}

# Check 4: Final confirmation
Write-Host ""
Write-Warn "About to do the following:"
Write-Warn "  - Mark all $($migrations.Count) migrations as applied in Render DB"
Write-Warn "  - Will NOT change DB schema. Only updates _prisma_migrations table"
Write-Warn "  - After: 'npx prisma migrate status' should say 'up to date'"
if ($DryRun) {
    Write-Info "DRY-RUN MODE: nothing will be changed"
}
$confirm = Read-Host "Type 'apply' to confirm"
if ($confirm -ne "apply") {
    Write-Info "Aborted. Nothing was done."
    exit 0
}

# Set DATABASE_URL for this session only
$env:DATABASE_URL = $DatabaseUrl

# Process each migration
Write-Host ""
Write-Info "Starting baseline..."
$success = 0
$failed = 0
$alreadyApplied = 0

foreach ($m in $migrations) {
    Write-Host -NoNewline "  - $($m.Name) ... "

    if ($DryRun) {
        Write-Host "[DRY-RUN]" -ForegroundColor Yellow
        continue
    }

    try {
        $output = & npx prisma migrate resolve --applied $m.Name 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Host "OK (applied)" -ForegroundColor Green
            $success++
        } elseif ($output -match "already") {
            Write-Host "already applied" -ForegroundColor Gray
            $alreadyApplied++
        } else {
            Write-Host "FAILED" -ForegroundColor Red
            Write-Host "      $output" -ForegroundColor DarkRed
            $failed++
        }
    } catch {
        Write-Host "ERROR" -ForegroundColor Red
        Write-Host "      $_" -ForegroundColor DarkRed
        $failed++
    }
}

# Summary
Write-Host ""
Write-Host "======================================="
Write-Ok "Applied:         $success"
Write-Host "[i] Already applied: $alreadyApplied" -ForegroundColor Gray
if ($failed -gt 0) {
    Write-Err "Failed:          $failed"
    Write-Host ""
    Write-Err "Errors occurred. Send screenshot and restore DB from backup if needed."
    exit 1
} else {
    Write-Host ""
    Write-Ok "All migrations marked successfully!"
    Write-Host ""
    Write-Info "Next step - verify:"
    Write-Host "    `$env:DATABASE_URL = `"<your-url>`"" -ForegroundColor White
    Write-Host "    npx prisma migrate status" -ForegroundColor White
    Write-Host ""
    Write-Info "Expected: 'Database schema is up to date!'"
    Write-Host ""
    Write-Info "Then notify Claude to switch render.yaml + package.json"
    Write-Info "from 'db push' to 'migrate deploy'."
}

# Cleanup
$env:DATABASE_URL = $null
