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
      'dist-ocr/',
      '.cache/',
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
      // `__OCR__` is the build constant of vite.config.ts (declared in src/env.d.ts).
      globals: { ...globals.browser, ...globals.node, __OCR__: 'readonly' },
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
  {
    // The skin's code imports the one helper; the scripts outside src/ cannot import TypeScript.
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ConditionalExpression[test.type='BinaryExpression'][test.operator='instanceof'][test.right.name='Error'][consequent.property.name='message']",
          message: 'Use errorMessage(e) from src/error-message.ts for the text of a thrown value.',
        },
      ],
    },
  },
  prettier,
  svelte.configs.prettier,
);
