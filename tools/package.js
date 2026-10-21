#!/usr/bin/env node
// ares-package writes every tar member with mtime 0 on Node 22 and newer, and webOS rejects
// such an ipk ("ipk verified failed"). Run it under Node 20 whatever Node runs the build.
const { spawnSync } = require('child_process');
const path = require('path');

const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'ares-package');
const result = spawnSync(
  'npm',
  ['exec', '--yes', '--package=node@20', '--', bin, '--no-minify', 'dist/'],
  { stdio: 'inherit', cwd: path.join(__dirname, '..') },
);
process.exit(result.status === null ? 1 : result.status);
