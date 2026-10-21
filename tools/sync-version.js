#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const appInfoPath = path.join(__dirname, '..', 'assets', 'appinfo.json');
const appInfo = JSON.parse(fs.readFileSync(appInfoPath, 'utf-8'));

if (packageJson.version !== appInfo.version) {
  appInfo.version = packageJson.version;
  fs.writeFileSync(appInfoPath, JSON.stringify(appInfo, null, 2) + '\n');
  console.log(`Updated appinfo.json version to ${packageJson.version}`);
}
