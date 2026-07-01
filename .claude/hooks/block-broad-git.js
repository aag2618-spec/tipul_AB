// PreToolUse hook (Bash) — חוסם פקודות git "רחבות" שבולעות את ה-staging המשותף.
// המשתמש מריץ כמה צ'אטים של Claude Code במקביל על אותה תיקיית עבודה (git index
// משותף). git add . / -A / commit -a תופסים גם קבצים שצ'אט אחר הכין, וכך צ'אט
// אחד "מעלה" בטעות את העבודה של צ'אט אחר. הכלל: commit עם שמות מפורשים בלבד.
//
// קורא את ה-PreToolUse JSON מ-stdin, ומחזיר exit code 2 (block) אם הפקודה רחבה.
// exit 0 = מותר. כל מקרה לא ודאי (JSON לא תקין וכו') → מותר (fail-open, לא חוסם
// עבודה לגיטימית).

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = JSON.parse(raw)?.tool_input?.command || "";
  } catch {
    process.exit(0); // לא JSON תקין — לא חוסמים
  }

  // git add . (נקודה לבדה) | git add -A | git add --all | git add -all
  // לא תופס נתיב ספציפי כמו "git add .gitignore" או "git add ./src" (אחרי הנקודה
  // חייב רווח או סוף-מחרוזת).
  const broadAdd = /\bgit\s+add\s+(?:-A\b|--all\b|-all\b|\.(?:\s|$))/;

  // git commit עם דגל a כלשהו: -a / -am / -ma / --all. לא תופס -m לבד ולא --amend.
  const broadCommit = /\bgit\s+commit\b[^|&;]*?(?:\s-[A-Za-z]*a[A-Za-z]*\b|\s--all\b)/;

  if (broadAdd.test(cmd) || broadCommit.test(cmd)) {
    process.stderr.write(
      "חסום: בעבודה מקבילה (כמה צ'אטים על אותה תיקייה) אסור 'git add .' / '-A' / " +
        "'commit -a' — הם בולעים קבצים של צ'אטים אחרים מה-staging המשותף. " +
        "עשה commit עם שמות קבצים מפורשים בלבד: git commit <file1> <file2> -m '...'"
    );
    process.exit(2); // block
  }

  process.exit(0); // allow
});
