#!/usr/bin/env node
// webOS rejects an ipk whose files all carry mtime 0 ("ipk verified failed").
const fs = require('fs');
const zlib = require('zlib');

function entries(buffer) {
  const found = {};
  let offset = 8;
  while (offset + 60 <= buffer.length) {
    const name = buffer.toString('latin1', offset, offset + 16).trim().replace(/\/$/, '');
    const size = parseInt(buffer.toString('latin1', offset + 48, offset + 58), 10);
    found[name] = buffer.subarray(offset + 60, offset + 60 + size);
    offset += 60 + size + (size % 2);
  }
  return found;
}

function zeroTimes(tar) {
  let offset = 0;
  let files = 0;
  let zero = 0;
  while (offset + 512 <= tar.length && tar[offset] !== 0) {
    const size = parseInt(tar.toString('latin1', offset + 124, offset + 135), 8) || 0;
    const type = String.fromCharCode(tar[offset + 156]);
    if (type === '0' || type === '\0') {
      files += 1;
      if ((parseInt(tar.toString('latin1', offset + 136, offset + 147), 8) || 0) === 0) zero += 1;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return { files, zero };
}

const target = process.argv[2] || fs.readdirSync('.').find((name) => name.endsWith('_all.ipk'));
if (!target) {
  console.error('No .ipk found to check.');
  process.exit(1);
}
const data = entries(fs.readFileSync(target))['data.tar.gz'];
const { files, zero } = zeroTimes(zlib.gunzipSync(data));
if (zero > 0) {
  console.error(`${target}: ${zero} of ${files} files have mtime 0, webOS would refuse to install it. Build the ipk with Node 20 (ares-package on Node 22 and newer writes mtime 0).`);
  process.exit(1);
}
console.log(`${target}: ${files} files, timestamps ok.`);
