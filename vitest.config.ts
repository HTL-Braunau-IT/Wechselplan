import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  // Needed for the automatic JSX runtime in component tests. Without it any
  // .tsx test fails with "React is not defined".
  plugins: [react()],
  test: {
    // Route tests run against node globals (Request/Response). Component tests
    // opt into a DOM with a `// @vitest-environment jsdom` docblock at the top
    // of the file.
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Both aliases are configured in tsconfig and both appear in source.
      '~': resolve(__dirname, './src'),
    },
  },
})
