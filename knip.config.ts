import { defineConfig } from 'knip/config';

export default defineConfig(({ production }) => ({
  entry: ['steiger.config.ts', 'tools/*.{js,cjs}', 'tests/browser/*.cjs'],
  project: ['src/**/*.{js,jsx,ts,tsx}!', 'tools/*.{js,cjs}', 'tests/**/*.{ts,tsx,cjs}', '*.{js,mjs,mts,ts}', '!src/**/*.test.{ts,tsx}!'],
  ignoreExportsUsedInFile: true,
  ignoreDependencies: ['core-js'],
  ignoreBinaries: production ? ['webpack'] : [],
}));
