module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  env: {
    es2020: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-unsafe-call': 'off', // k6 remote modules
    '@typescript-eslint/no-unsafe-return': 'off', // k6 remote modules
    '@typescript-eslint/no-unsafe-assignment': 'off', // k6 remote modules
    '@typescript-eslint/no-unsafe-member-access': 'off', // k6 remote modules
    '@typescript-eslint/no-unsafe-argument': 'off', // k6 remote modules
    '@typescript-eslint/prefer-ts-expect-error': 'off', // Allow @ts-ignore for k6
    'no-console': 'off', // k6 uses console for logging
    'prefer-const': 'error',
    'no-var': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'webpack.config.js', '*.js'],
};
