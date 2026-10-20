// ESLint flat config: typescript-eslint's type-checked rules, eslint-plugin-svelte, then
// eslint-config-prettier last so no rule fights the formatter.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'release/',
      'dist/',
      'data/',
      'docs/product/',
      'test-results/',
      'playwright-report/',
      'e2e/.results/',
      'e2e-rig/.results/',
      'stint/',
      '.claude/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    // Plain JavaScript has no types to check: typescript-eslint's documented opt-out.
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.ts', '**/*.svelte'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  prettier,
  svelte.configs.prettier,
);
