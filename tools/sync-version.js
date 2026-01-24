#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const appInfoPath = path.join(__dirname, '..', 'assets', 'appinfo.json');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
const appInfo = JSON.parse(fs.readFileSync(appInfoPath, 'utf-8'));

if (packageJson.version !== appInfo.version) {
  appInfo.version = packageJson.version;
  fs.writeFileSync(appInfoPath, JSON.stringify(appInfo, null, 4) + '\n');
  console.log(`Updated appinfo.json version to ${packageJson.version}`);
} else {
  console.log(`Version already in sync: ${packageJson.version}`);
}
