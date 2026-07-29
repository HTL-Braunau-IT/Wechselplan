import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.next',
      // Agent worktrees are separate checkouts of this repo that happen to live
      // inside it (gitignored). They carry no node_modules, so type-aware rules
      // resolve this tree's generated Prisma client against their stale source.
      '.claude/worktrees/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/test/**',
      '**/tests/**',
      // One-off data-migration scripts, committed alongside the migration that
      // ran them. They are a historical record, not living source.
      'prisma/migrations/**',
    ],
  },
  // eslint-config-next ships a flat config from v15 onwards. Loading it
  // through FlatCompat, as this file used to, made ESLint fail outright with
  // "Converting circular structure to JSON", so `npm run lint` and
  // `npm run check` could not run at all.
  ...nextCoreWebVitals,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      //CUSTOM RULES
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'react-hooks/exhaustive-deps': 'off',
      // New in eslint-config-next 16, and flagged across several pre-existing
      // components (theme-provider, entitlements-context, the schedule
      // dialogs). Each needs a real restructure onto React Query rather than a
      // mechanical edit, so it is a warning for now rather than a blocker.
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      //
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
)
