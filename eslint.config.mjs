import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * Flat config. eslint-config-next ships flat configs directly from Next 16,
 * so there is no need for the eslintrc compatibility layer.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'supabase/**'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // The codebase avoids `any`; make that a hard error rather than a nudge.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
