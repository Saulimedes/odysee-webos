#!/usr/bin/env node
// ares-package writes every tar member with mtime 0 on Node 22 and newer, and webOS rejects
// such an ipk ("ipk verified failed"). Run it under Node 20 whatever Node runs the build.
const { spawnSync } = require('child_process');
const path = require('path');
const { execFileSync } = require('child_process');
const appInfo = require('../assets/appinfo.json');

const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'ares-package');
const result = spawnSync(
  'npm',
  ['exec', '--yes', '--package=node@20', '--', bin, '--no-minify', 'dist/'],
  { stdio: 'inherit', cwd: path.join(__dirname, '..') },
);
if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
execFileSync('node', [path.join(__dirname, 'check-ipk.js'), `${appInfo.id}_${appInfo.version}_all.ipk`], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
