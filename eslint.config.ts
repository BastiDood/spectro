import css from '@eslint/css';
import globals from 'globals';
import html from '@html-eslint/eslint-plugin';
import htmlSvelte from '@html-eslint/eslint-plugin-svelte';
import imsort from '@bastidood/eslint-plugin-imsort';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import { tailwind4 } from 'tailwind-csstree';

const TYPED_PARSER_OPTIONS = {
  projectService: true,
  extraFileExtensions: ['.svelte'],
};

export default defineConfig(
  { ignores: ['.svelte-kit/**/*', '.vercel/**/*', 'build/**/*', 'node_modules/**/*'] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    ...html.configs['flat/recommended'],
    files: ['**/*.html'],
    rules: {
      ...html.configs['flat/recommended'].rules,
      '@html-eslint/indent': 'off',
      '@html-eslint/no-duplicate-class': 'error',
      '@html-eslint/no-extra-spacing-tags': [
        'error',
        {
          enforceBeforeSelfClose: true,
          disallowMissing: true,
          disallowTabs: true,
          disallowInAssignment: true,
        },
      ],
      '@html-eslint/no-extra-spacing-text': 'error',
      '@html-eslint/no-inline-styles': 'error',
      '@html-eslint/no-nested-interactive': 'error',
      '@html-eslint/no-script-style-type': 'error',
      '@html-eslint/no-target-blank': 'error',
      '@html-eslint/prefer-https': 'error',
      '@html-eslint/require-button-type': 'error',
      '@html-eslint/require-closing-tags': 'off',
      '@html-eslint/require-explicit-size': 'error',
      '@html-eslint/require-meta-charset': 'error',
      '@html-eslint/no-abstract-roles': 'error',
      '@html-eslint/no-accesskey-attrs': 'error',
      '@html-eslint/no-aria-hidden-body': 'error',
      '@html-eslint/no-heading-inside-button': 'error',
      '@html-eslint/no-invalid-role': 'error',
      '@html-eslint/no-non-scalable-viewport': 'error',
      '@html-eslint/no-positive-tabindex': 'error',
      '@html-eslint/no-skip-heading-levels': 'error',
      '@html-eslint/require-form-method': 'error',
      '@html-eslint/require-frame-title': 'error',
      '@html-eslint/require-input-label': 'error',
      '@html-eslint/require-meta-viewport': 'error',
    },
  },
  {
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    languageOptions: { customSyntax: tailwind4 },
    rules: {
      ...css.configs.recommended.rules,
      'css/prefer-logical-properties': 'error',
      'css/no-invalid-at-rules': 'off',
    },
  },
  {
    files: ['src/**/*.{{j,t}s,svelte}', '*.{j,t}s'],
    extends: [
      js.configs.recommended,
      ...ts.configs.strictTypeChecked,
      ...ts.configs.stylisticTypeChecked,
      imsort.configs.all,
      prettier,
    ],
    plugins: { '@bastidood/imsort': imsort },
    languageOptions: { parserOptions: TYPED_PARSER_OPTIONS },
    rules: {
      '@typescript-eslint/class-methods-use-this': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/init-declarations': 'error',
      '@typescript-eslint/method-signature-style': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'enumMember', format: ['PascalCase'] },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            object: {
              message:
                'Use a precise object contract, Record, or unknown at an untrusted boundary.',
            },
          },
        },
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: 'only-allowed-literals' },
      ],
      '@typescript-eslint/no-unnecessary-parameter-property-assignment': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      // The `tsconfig.json` does not enable `noUnusedLocals` and `noUnusedParameters`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/parameter-properties': ['error', { prefer: 'parameter-property' }],
      '@typescript-eslint/prefer-enum-initializers': 'error',
      '@typescript-eslint/prefer-literal-enum-member': ['error', { allowBitwiseExpressions: true }],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowNullableObject: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: false,
        },
      ],
      'array-callback-return': ['error', { checkForEach: true }],
      'block-scoped-var': 'error',
      'class-methods-use-this': 'off',
      'consistent-this': ['error', 'self'],
      curly: ['error', 'multi', 'consistent'],
      'default-case': 'off',
      'default-param-last': 'off',
      eqeqeq: 'error',
      'func-style': ['error', 'declaration'],
      'grouped-accessor-pairs': ['error', 'getBeforeSet'],
      'guard-for-in': 'error',
      'init-declarations': 'off',
      'logical-assignment-operators': 'error',
      'new-cap': 'error',
      'no-alert': 'warn',
      'no-caller': 'error',
      'no-console': 'warn',
      'no-constructor-return': 'error',
      'no-div-regex': 'error',
      'no-duplicate-imports': 'error',
      'no-else-return': 'error',
      'no-empty-static-block': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-extend-native': 'error',
      'no-fallthrough': 'off',
      'no-implicit-coercion': 'error',
      'no-implicit-globals': 'error',
      'no-invalid-this': 'off',
      'no-iterator': 'error',
      'no-label-var': 'error',
      'no-lone-blocks': 'error',
      'no-lonely-if': 'error',
      'no-loop-func': 'error',
      'no-multi-assign': 'error',
      'no-negated-condition': 'error',
      'no-nested-ternary': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': 'error',
      'no-promise-executor-return': 'error',
      'no-proto': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**'],
              message:
                'Use `#lib` subpath imports for cross-directory imports. Parent traversal is banned.',
            },
          ],
        },
      ],
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-sequences': 'error',
      'no-undef-init': 'error',
      'no-undefined': 'error',
      'no-underscore-dangle': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-assignment': 'error',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unreachable-loop': 'error',
      'no-use-before-define': 'off',
      'no-var': 'error',
      'object-shorthand': ['error', 'always', { avoidExplicitReturnArrows: true }],
      'one-var': ['error', 'never'],
      'operator-assignment': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'off',
      'prefer-destructuring': 'error',
      'prefer-exponentiation-operator': 'error',
      'prefer-named-capture-group': 'error',
      'prefer-numeric-literals': 'error',
      'prefer-object-has-own': 'error',
      'prefer-object-spread': 'error',
      'prefer-regex-literals': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'preserve-caught-error': 'error',
      radix: 'error',
      'require-atomic-updates': 'error',
      'require-unicode-regexp': 'error',
      'symbol-description': 'error',
      yoda: ['warn', 'never', { exceptRange: true }],
    },
  },
  {
    files: ['src/**/*.svelte', 'src/**/*.svelte.{j,t}s'],
    extends: [
      ...svelte.configs.recommended,
      htmlSvelte.configs.recommended,
      ...svelte.configs.prettier,
    ],
    languageOptions: {
      parserOptions: {
        ...TYPED_PARSER_OPTIONS,
        parser: ts.parser,
      },
    },
    rules: {
      // Doc section anchors are public URLs, so they stay kebab-case.
      '@html-eslint/svelte/id-naming-convention': ['error', 'kebab-case'],
      'svelte/prefer-const': 'error',
      // TODO: Reinstate when ready to restructure the docs.
      'svelte/no-navigation-without-resolve': 'off',
      'no-restricted-globals': [
        'error',
        {
          name: '$effect',
          message:
            'Refactor the code so that side effects are performed in the event handlers themselves, not in effect synchronization. This is incorrect and poor practice that leads to buggy reactivity patterns. Avoid `$effect` at all costs!',
        },
      ],
    },
  },
  {
    // TODO: Remove this once there's a way for type-aware lints to detect the `.svelte-kit/` types.
    files: ['src/hooks{,.{client,server}}.{j,t}s', 'src/routes/**/+*.{{j,t}s,svelte}'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
