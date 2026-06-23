/**
 * Canonical app logo (single asset for UI, metadata icons, and PWA).
 * Update only here when replacing the logo file.
 *
 * Quick visual check (transparency + sidebar demo): /logo-preview
 * Download self-contained HTML: GET /api/download/logo-preview (browser)
 * Or from project root: npm run save-logo-preview → writes to Downloads folder
 * CBT work-page demo HTML: npm run save-work-demo-cbt or GET /api/download/work-demo-cbt
 * Offline from repo: public/dashboard-logo-preview.html next to public/logo.png
 */
export const APP_LOGO = {
  src: "/logo.png",
  alt: "MyTipul",
  /** Intrinsic dimensions of public/logo.png (used by next/image for aspect ratio). */
  width: 1376,
  height: 768,
} as const;

/**
 * Square app icon (PWA install, apple-touch, favicon). Distinct from APP_LOGO — that is the
 * wide horizontal logo used inside the app UI. Generated from public/icon.svg + icon-maskable.svg
 * via `node scripts/generate-app-icons.mjs` (sharp). Update the SVGs then re-run the script.
 */
export const APP_ICON = {
  svg: "/icon.svg",
  favicon32: "/favicon-32.png",
  apple: "/apple-touch-icon.png",
} as const;
