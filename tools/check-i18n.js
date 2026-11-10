const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const LOCALES = path.join(SRC, 'shared/i18n/locales');
const CATALOGS = fs.readdirSync(LOCALES).filter((file) => file.endsWith('.ts'));
const FOUR_FORMS = ['cs.ts', 'pl.ts'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : walk(full);
    return !entry.name.includes('.test.') && /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const unescape = (text) => text.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
const STRING = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;
const pick = (match) => unescape(match[1] !== undefined ? match[1] : match[2]);

const DATA_FILES = {
  'shared/config/constants.ts': ['name'],
  'pages/settings/ui/rows.ts': ['label', 'hint', 'section'],
  'widgets/sidebar/model/items.ts': ['label'],
  'pages/library/ui/sections.tsx': ['title', 'emptyTitle', 'emptyHint'],
  'pages/playlists/ui/PlaylistsPage.tsx': ['label'],
  'pages/home/model/useHomeRows.ts': ['title'],
};

const files = walk(SRC);
const sources = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
const used = new Map();
const add = (text, where) => { if (text && /[A-Za-z]{2,}/.test(text)) used.set(text, where); };

sources.forEach(({ file, text }) => {
  const name = path.relative(SRC, file).split(path.sep).join('/');
  for (const match of text.matchAll(new RegExp(String.raw`\b(?:t|tRef\.current)\(\s*(?:${STRING})`, 'g'))) add(pick(match), name);
  const fields = DATA_FILES[name];
  if (!fields) return;
  const field = fields.join('|');
  text.split('\n').forEach((line) => {
    if (name === 'shared/config/constants.ts' && (/native: true/.test(line) || (/family:/.test(line) && !/family: null/.test(line)))) return;
    for (const match of line.matchAll(new RegExp(String.raw`\b(?:${field}):\s*(?:${STRING})`, 'g'))) add(pick(match), name);
  });
  if (name === 'shared/config/constants.ts') for (const match of text.matchAll(/\? '(Normal[^']*)'/g)) add(match[1], name);
});

if (process.argv.includes('--list')) {
  console.log(JSON.stringify([...used.entries()].map(([key, where]) => ({ key, where })), null, 2));
  process.exit(0);
}

const allText = sources.map((source) => source.text).join('\n');
const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');
let failed = false;

CATALOGS.forEach((file) => {
  const module = { exports: {} };
  new Function('module', fs.readFileSync(path.join(LOCALES, file), 'utf8').replace('export default', 'module.exports ='))(module);
  const catalog = module.exports;
  const keys = Object.keys(catalog);
  const missing = [...used.keys()].filter((text) => !(text in catalog));
  const stale = keys.filter((key) => !allText.includes(key.replace(/\n/g, '\\n')));
  const dashes = keys.concat(Object.values(catalog)).filter((text) => /[\u2013\u2014]/.test(text));
  const broken = keys.filter((key) => {
    const value = catalog[key];
    if (typeof value !== 'string' || !value.trim()) return true;
    const forms = value.split('|');
    const expected = key.includes('|') ? (FOUR_FORMS.includes(file) ? 4 : 2) : 1;
    return forms.length !== expected || forms.some((form) => !form.trim() || placeholders(form) !== placeholders(key.split('|')[0]));
  });
  if (missing.length || stale.length || dashes.length || broken.length) failed = true;
  broken.forEach((key) => console.error(`${file}: empty value, wrong number of plural forms or changed {placeholders} for ${JSON.stringify(key)}`));
  missing.forEach((text) => console.error(`${file}: missing ${JSON.stringify(text)} (${used.get(text)})`));
  stale.forEach((key) => console.error(`${file}: unused ${JSON.stringify(key)}`));
  dashes.forEach((text) => console.error(`${file}: dash in ${JSON.stringify(text)}`));
  if (!missing.length && !stale.length && !dashes.length && !broken.length) console.log(`${file}: ${keys.length} strings, complete`);
});

process.exit(failed ? 1 : 0);
