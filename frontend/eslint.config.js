import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'scripts', '*.config.*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // autoFocus is used deliberately for focus management (modals, the 2FA
      // code step, inline-edit fields that appear on demand) — it's correct UX
      // there, so don't flag it.
      'jsx-a11y/no-autofocus': 'off',
      // Recognise the app's custom date control as a form control, and look a
      // little deeper for nested label text (label > span > span patterns).
      'jsx-a11y/label-has-associated-control': [
        'error',
        { controlComponents: ['ShamsiDatePicker'], depth: 4 },
      ],
    },
  },
  // Test files run under Vitest/Node.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
);
