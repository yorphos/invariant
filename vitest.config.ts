import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    include: [
      'src/tests/unit/**/*.test.ts',
      'src/tests/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src-tauri/',
        'dist/',
        '**/*.spec.ts',
        '**/*.test.ts',
        'migrations/',
        'scripts/',
      ],
      include: [
        'src/lib/**/*.{ts,js}',
      ],
    },
    setupFiles: [
      './src/tests/setup.ts',
      './src/tests/integration/setup.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    singleFork: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
