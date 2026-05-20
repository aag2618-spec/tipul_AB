# =============================================================================
# baseline-render-migrations.ps1
# =============================================================================
# מסמן את כל ה-Prisma migrations הקיימות כ-"applied" ב-DB של Render.
# פעולה בטוחה — לא משנה schema, רק מעדכן טבלת _prisma_migrations הפנימית.
#
# למה צריך את זה: DB ב-production נוצר עם `db push` (בלי migrations).
# כדי לעבור ל-`migrate deploy` בעתיד, צריך לסמן את כל ה-migrations
# הקיימות כ-applied (אחרת prisma ינסה להריץ הכל מ-0 = catastrophic).
#
# שימוש (מ-PowerShell):
#   1. קח DATABASE_URL מ-Render Dashboard → Database → Connect → External Connection
#   2. הרץ:    .\scripts\baseline-render-migrations.ps1 -DatabaseUrl "postgres://..."
#   3. עברו על אישור כשהוא יבקש
# =============================================================================

param(
    [Parameter(Mandatory=$true, HelpMessage="DATABASE_URL מ-Render Dashboard (External Connection)")]
    [string]$DatabaseUrl,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# צבעים
function Write-Info($msg)  { Write-Host "ℹ  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "✓  $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "⚠  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "✗  $msg" -ForegroundColor Red }

# בדיקה 1: DATABASE_URL נראה תקין
if (-not $DatabaseUrl.StartsWith("postgres://") -and -not $DatabaseUrl.StartsWith("postgresql://")) {
    Write-Err "DATABASE_URL לא תקין. חייב להתחיל ב-postgres:// או postgresql://"
    exit 1
}

# בדיקה 2: מציג רק את החלק הציבורי של ה-URL (לא את הסיסמה)
$urlSafe = $DatabaseUrl -replace ":[^:@]+@", ":***@"
Write-Info "מתחבר ל: $urlSafe"

# בדיקה 3: prisma/migrations קיים
if (-not (Test-Path "prisma/migrations")) {
    Write-Err "תיקיית prisma/migrations לא נמצאה. הרץ מ-root של הפרויקט."
    exit 1
}

# רשימת migrations אמיתיות (תיקיות בלבד, לא קבצי .sql)
$migrations = Get-ChildItem -Path "prisma/migrations" -Directory |
    Where-Object { $_.Name -ne "migration_lock.toml" } |
    Sort-Object Name

if ($migrations.Count -eq 0) {
    Write-Err "לא נמצאו migrations ב-prisma/migrations/"
    exit 1
}

Write-Host ""
Write-Info "נמצאו $($migrations.Count) migrations לסימון כ-applied:"
foreach ($m in $migrations) {
    Write-Host "    • $($m.Name)" -ForegroundColor Gray
}

# בדיקה 4: גיבוי DB
Write-Host ""
Write-Warn "לפני שממשיכים — האם עשית גיבוי ל-DB ב-Render Dashboard?"
Write-Warn "  (Render Dashboard → Database → Backups → Backup Now)"
$confirmBackup = Read-Host "כתוב 'yes' אם יש גיבוי טרי"
if ($confirmBackup -ne "yes") {
    Write-Err "לא ממשיכים. תעשה גיבוי קודם ואז חוזר."
    exit 1
}

# בדיקה 5: אישור סופי
Write-Host ""
Write-Warn "התרחיש:"
Write-Warn "  - אסמן את כל ה-$($migrations.Count) migrations כ-applied ב-DB של Render"
Write-Warn "  - לא ישתנה schema של DB. רק טבלת _prisma_migrations הפנימית"
Write-Warn "  - לאחר מכן, npx prisma migrate status יחזיר: 'Database schema is up to date!'"
$confirm = Read-Host "כתוב 'apply' כדי לאשר"
if ($confirm -ne "apply") {
    Write-Info "ביטול. לא בוצע כלום."
    exit 0
}

# שמירת DATABASE_URL זמנית לסביבת ה-process
$env:DATABASE_URL = $DatabaseUrl

# הרצה
Write-Host ""
Write-Info "מתחיל לסמן migrations..."
$success = 0
$failed = 0
$alreadyApplied = 0

foreach ($m in $migrations) {
    Write-Host -NoNewline "  • $($m.Name) ... "

    if ($DryRun) {
        Write-Host "[DRY-RUN]" -ForegroundColor Yellow
        continue
    }

    try {
        $output = & npx prisma migrate resolve --applied $m.Name 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Host "✓ applied" -ForegroundColor Green
            $success++
        } elseif ($output -match "already") {
            Write-Host "✓ already applied" -ForegroundColor Gray
            $alreadyApplied++
        } else {
            Write-Host "✗ FAILED" -ForegroundColor Red
            Write-Host "      $output" -ForegroundColor DarkRed
            $failed++
        }
    } catch {
        Write-Host "✗ ERROR" -ForegroundColor Red
        Write-Host "      $_" -ForegroundColor DarkRed
        $failed++
    }
}

# סיכום
Write-Host ""
Write-Host "═══════════════════════════════════════"
Write-Ok "Applied:         $success"
Write-Host "ⓘ  Already applied: $alreadyApplied" -ForegroundColor Gray
if ($failed -gt 0) {
    Write-Err "Failed:          $failed"
    Write-Host ""
    Write-Err "יש שגיאות. שלח לי screenshot של הפלט ותחזירו את ה-DB מהגיבוי."
    exit 1
} else {
    Write-Host ""
    Write-Ok "כל ה-migrations סומנו בהצלחה!"
    Write-Host ""
    Write-Info "השלב הבא — בדיקה:"
    Write-Host "    `$env:DATABASE_URL = `"$urlSafe`"" -ForegroundColor White
    Write-Host "    npx prisma migrate status" -ForegroundColor White
    Write-Host ""
    Write-Info "מצופה לראות: 'Database schema is up to date!'"
    Write-Host ""
    Write-Info "לאחר אישור — שלח לי הודעה ואשנה את render.yaml + package.json"
    Write-Info "מ-`db push` ל-`migrate deploy`."
}

# ניקוי
$env:DATABASE_URL = $null
