#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
const outputFile = process.argv[2] || 'manifest.json';

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walkDir(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, baseDir));
    } else {
      files.push({
        path: path.relative(baseDir, fullPath),
        hash: hashFile(fullPath),
        size: fs.statSync(fullPath).size,
      });
    }
  }

  return files;
}

const appInfo = require(path.join(distDir, 'appinfo.json'));
const files = walkDir(distDir);

const manifest = {
  id: appInfo.id,
  version: appInfo.version,
  title: appInfo.title,
  description: appInfo.appDescription,
  files,
  generated: new Date().toISOString(),
};

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
console.log(`Manifest generated: ${outputFile}`);
