// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: [
    '.data/**',
    '.output/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ],
  // The repository predates the lint gate. Keep the initial gate focused on
  // rules that are already clean so new regressions fail CI without turning
  // this reliability release into a broad formatting/type-debt rewrite.
  // Re-enable these rules in small, separately reviewed cleanup slices.
  rules: {
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-dynamic-delete': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/no-import-type-side-effects': 'off',
    '@typescript-eslint/no-invalid-void-type': 'off',
    '@typescript-eslint/no-unsafe-function-type': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/unified-signatures': 'off',
    'import/first': 'off',
    'import/no-duplicates': 'off',
    'no-control-regex': 'off',
    'no-empty': 'off',
    'no-regex-spaces': 'off',
    'no-useless-assignment': 'off',
    'no-useless-escape': 'off',
    'no-var': 'off',
    'prefer-const': 'off',
    'preserve-caught-error': 'off',
    'vue/attributes-order': 'off',
    'vue/first-attribute-linebreak': 'off',
    'vue/html-self-closing': 'off',
    'vue/no-multiple-template-root': 'off',
    'vue/no-parsing-error': 'off',
    'vue/require-default-prop': 'off',
    'vue/require-toggle-inside-transition': 'off',
  },
})
