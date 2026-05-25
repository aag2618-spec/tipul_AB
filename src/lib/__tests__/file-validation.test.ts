/* eslint-disable security/detect-bidi-characters */
import { describe, it, expect } from "vitest";
import { sanitizeDownloadFilename } from "@/lib/file-validation";

// Unicode bidi-override character constants (instead of literals — keeps git
// from treating this file as binary, and makes intent explicit).
const LRM = "‎"; // LEFT-TO-RIGHT MARK
const RLM = "‏"; // RIGHT-TO-LEFT MARK
const LRE = "‪"; // LEFT-TO-RIGHT EMBEDDING
const RLE = "‫"; // RIGHT-TO-LEFT EMBEDDING
const PDF = "‬"; // POP DIRECTIONAL FORMATTING
const LRO = "‭"; // LEFT-TO-RIGHT OVERRIDE
const RLO = "‮"; // RIGHT-TO-LEFT OVERRIDE (the famous one)
const LRI = "⁦"; // LEFT-TO-RIGHT ISOLATE
const RLI = "⁧"; // RIGHT-TO-LEFT ISOLATE
const FSI = "⁨"; // FIRST STRONG ISOLATE
const PDI = "⁩"; // POP DIRECTIONAL ISOLATE

describe("sanitizeDownloadFilename — RTL spoofing protection (round15 L5)", () => {
  it("returns ASCII-safe + UTF-8 encoded for plain filename", () => {
    const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename("invoice.pdf");
    expect(asciiSafe).toBe("invoice.pdf");
    expect(utf8Encoded).toBe("invoice.pdf");
  });

  it("strips U+202E (RIGHT-TO-LEFT OVERRIDE) — classic exe-as-jpg attack", () => {
    const evil = `evil${RLO}gpj.exe`;
    const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename(evil);
    expect(asciiSafe).not.toContain(RLO);
    expect(asciiSafe).toBe("evilgpj.exe");
    expect(utf8Encoded).not.toContain("%E2%80%AE");
  });

  it("strips U+200E (LRM) and U+200F (RLM)", () => {
    const evil = `file${LRM}${RLM}.txt`;
    const { asciiSafe } = sanitizeDownloadFilename(evil);
    expect(asciiSafe).toBe("file.txt");
  });

  it("strips U+202A-U+202D (embedding/override) range", () => {
    const evil = `doc${LRE}${RLE}${PDF}${LRO}.pdf`;
    const { asciiSafe } = sanitizeDownloadFilename(evil);
    expect(asciiSafe).toBe("doc.pdf");
  });

  it("strips U+2066-U+2069 (isolate) range", () => {
    const evil = `report${LRI}${RLI}${FSI}${PDI}.xlsx`;
    const { asciiSafe } = sanitizeDownloadFilename(evil);
    expect(asciiSafe).toBe("report.xlsx");
  });

  it("replaces non-ASCII Hebrew with underscores in asciiSafe, preserves in utf8Encoded", () => {
    const hebrew = "קובץ.pdf"; // קובץ.pdf
    const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename(hebrew);
    expect(asciiSafe).toBe("____.pdf");
    expect(utf8Encoded).toBe(encodeURIComponent(hebrew));
  });

  it("escapes header-injection chars (quote, backslash, CR, LF, NUL)", () => {
    const evil = 'name"with\\bad\r\nchars .txt';
    const { asciiSafe } = sanitizeDownloadFilename(evil);
    expect(asciiSafe).not.toContain('"');
    expect(asciiSafe).not.toContain("\\");
    expect(asciiSafe).not.toContain("\r");
    expect(asciiSafe).not.toContain("\n");
  });

  it("returns 'file' fallback when input is null/undefined", () => {
    expect(sanitizeDownloadFilename(null).asciiSafe).toBe("file");
    expect(sanitizeDownloadFilename(undefined).asciiSafe).toBe("file");
  });

  it("returns 'file' fallback when input is empty after stripping bidi chars", () => {
    const allBidi = `${RLO}${LRO}${LRI}${PDI}${LRM}${RLM}`;
    const { asciiSafe } = sanitizeDownloadFilename(allBidi);
    expect(asciiSafe).toBe("file");
  });

  it("caps input length at 255 chars to prevent header DoS", () => {
    const long = "a".repeat(500) + ".pdf";
    const { asciiSafe } = sanitizeDownloadFilename(long);
    expect(asciiSafe.length).toBeLessThanOrEqual(255);
  });

  it("handles realistic CVE example — exe disguised as jpg via RTL", () => {
    // Classic RTL spoof: ".jpg.exe" displayed as ".exe.jpg"
    const cve = `photo${RLO}gnp.exe`;
    const { asciiSafe } = sanitizeDownloadFilename(cve);
    // After strip: "photognp.exe" — still .exe extension, no spoofing.
    expect(asciiSafe.endsWith(".exe")).toBe(true);
    expect(asciiSafe).toBe("photognp.exe");
  });

  it("preserves dots and dashes (safe ASCII)", () => {
    const safe = "my-file.tar.gz";
    const { asciiSafe } = sanitizeDownloadFilename(safe);
    expect(asciiSafe).toBe("my-file.tar.gz");
  });
});
