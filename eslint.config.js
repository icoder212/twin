import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/node_modules',
      'apps/web/public',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
  noUnsanitized.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-refresh': reactRefresh.default ?? reactRefresh },
    rules: {
      // Security: the UI renders text, never HTML, and never evaluates strings as code.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render text, never HTML.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'Use textContent or React rendering.',
        },
        {
          selector: "MemberExpression[property.name='outerHTML']",
          message: 'Use textContent or React rendering.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Use DOM APIs or React rendering.',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-console': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // UI primitives and providers intentionally export helpers next to components.
    files: [
      'apps/web/src/shared/ui/**',
      'apps/web/src/features/auth/guards.tsx',
      'apps/web/src/app/**',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  { files: ['apps/web/src/lib/logger.ts'], rules: { 'no-console': 'off' } },
  { files: ['**/*.test.{ts,tsx}'], rules: { 'no-script-url': 'off' } },
);
