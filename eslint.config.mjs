import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    'artifacts/**',
    'coverage/**',
    'logs/**',
    '.bkit/**',
    '.cache/**',
    '.claude/**',
    'next-env.d.ts',
  ]),
]);
