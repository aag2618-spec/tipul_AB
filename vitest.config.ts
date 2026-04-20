import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // server-only הוא חבילה של Next.js שחוסמת import מ-client components.
      // ב-vitest אין לה משמעות — מחליפים ב-stub ריק.
      'server-only': path.resolve(__dirname, './test-utils/server-only-stub.ts'),
    },
  },
  test: {
    globals: true,
  },
});
